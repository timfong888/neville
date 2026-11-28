import { NextResponse } from "next/server";
import { apiKey } from "@/lib/server/openrouter";
import { LIMITS, generationEnabled, takeSlot, underCeiling } from "@/lib/server/limits";
import { synthesize } from "@/lib/server/tts";
import { type Script, writeScript, writeAdultScript } from "@/lib/server/writer";
import { DEFAULT_REFRAIN, exactLines, wishSexualisesMinor, wishSexualisesMinorCategory } from "@/lib/prompt";
import { neutralScript } from "@/lib/script";
import { captureEvent } from "@/lib/server/telemetry";
import { adultGate } from "@/lib/adult/gate";
import { isAdultTierUser } from "@/lib/adult/tier";
import { buildAdultVoiceChain } from "@/lib/adult/tts";
import { alertFailure } from "@/lib/server/alertFailure";
import { newAttemptId } from "@/lib/attemptId";
import { estimateSpeech, record } from "@/lib/server/ledger";
import { pauseFor, resolvePace, resolveTone, speedFor, styleInstruction } from "@/lib/delivery";
import { segmentLines, segmentsToPausedLines } from "@/lib/speech/pauses";
import { resolveVoice } from "@/lib/voices";
import { resolveCadence, resolveSpeed } from "@/lib/voice/options";
import { type PaidState, charge, runPaid, timeoutAnswer, timeoutResponse, voiceBudget, whoIsAsking } from "@/lib/server/paywall";
import { isFilterRelaxed, isUnlimited, paywallEnabled } from "@/lib/credits";
import { currentUser } from "@/lib/server/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Attaches X-Attempt-Id and X-Support-Code to any response. */
function withAttemptHeaders(res: Response, attemptId: string): Response {
  res.headers.set("X-Attempt-Id", attemptId);
  res.headers.set("X-Support-Code", attemptId.replace(/-/g, "").slice(0, 8));
  return res;
}

// Only these models take a style instruction apart from the script. It is
// never part of the spoken text, so it cannot be read aloud.
const TAKES_STYLE = /^google\/gemini/;

function visitor(req: Request): string {
  // On Vercel these are set by the platform, not by the caller.
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// The app's one paid path: a wish in, a script and its recording out.
// Nothing is stored. Guards are in lib/server/limits.ts. With PAYWALL_ENABLED=true it also needs
// sign-in and one credit per recording (lib/server/paywall.ts, #168); a credit is given back if
// the recording fails after it was taken.
export async function POST(req: Request) {
  return runPaid((state) => handle(req, state));
}

async function handle(req: Request, state: PaidState): Promise<Response> {
  // The route has 60 s in all (maxDuration), counted from here: guards, script, voice and the ledger writes.
  const started = Date.now();
  const attemptId = req.headers.get("X-Attempt-Id") || newAttemptId();
  const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "";
  if (!generationEnabled()) {
    return NextResponse.json({ code: "off", error: "Recording is switched off." }, { status: 503 });
  }
  const key = apiKey();
  if (!key) return NextResponse.json({ code: "off", error: "Recording is not set up here." }, { status: 503 });

  let body: { want?: unknown; name?: unknown; voiceId?: unknown; variant?: unknown; pace?: unknown; tone?: unknown; repeat?: unknown; speedStep?: unknown; cadenceStep?: unknown; scriptMode?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
  } catch {
    return NextResponse.json({ code: "bad_request", error: "Send JSON." }, { status: 400 });
  }
  const want = typeof body.want === "string" ? body.want.replace(/\s+/g, " ").trim() : "";
  const name = typeof body.name === "string" ? body.name.replace(/[^\p{L}\p{M}' -]/gu, "").trim().slice(0, 40) : "";
  const variant = Number.isSafeInteger(body.variant) ? Math.abs(body.variant as number) % 50 : 0;
  if (!want || want.length > LIMITS.maxWantChars) {
    return NextResponse.json(
      { code: "bad_request", error: `Say what you want in 1 to ${LIMITS.maxWantChars} characters.` },
      { status: 400 },
    );
  }
  // The browser sends only an id. The model and voice come from the config.
  const voice = resolveVoice(typeof body.voiceId === "string" ? body.voiceId : null);
  // Pace and tone are preset ids too. Speed, pause and instruction come from lib/delivery.ts.
  const pace = resolvePace(body.pace);
  const tone = resolveTone(body.tone);
  // speedStep / cadenceStep are the simpler create-flow controls; when present they override pace/tone's computed values.
  const speedOpt = body.speedStep !== undefined ? resolveSpeed(body.speedStep) : null;
  const cadenceOpt = body.cadenceStep !== undefined ? resolveCadence(body.cadenceStep) : null;

  // A configured tester must be signed in before their network slot is skipped.
  // This lookup happens even while the paywall is off, so tester access stays useful during testing.
  let session: Awaited<ReturnType<typeof currentUser>> | undefined;
  try {
    session = await currentUser(req);
  } catch (e) {
    // With the paywall on, an auth/DB outage is fail-closed: re-throw so the route
    // returns a 500 rather than silently treating the caller as a non-tester.
    // With the paywall off, the route is public; treat the caller as signed-out so
    // normal slot limits still apply and the outage does not cause a 500.
    if (paywallEnabled()) throw e;
    session = null;
  }
  const tester = isUnlimited(session);
  if (tester && session) console.info("[tester]", session.id);
  const relaxed = isFilterRelaxed(session);
  if (relaxed && session) console.info("[relaxed]", session.id);
  const slot = tester ? null : await takeSlot(visitor(req));
  if (slot?.refusal) return NextResponse.json(slot.refusal, { status: slot.refusal.status });

  const budget = await underCeiling(key);
  if (!budget.ok) {
    await slot?.release();
    return NextResponse.json(budget.refusal, { status: budget.refusal.status });
  }

  // Sign-in comes after the IP, daily and spend-ceiling guards, which stay the backstop for every request. A
  // signed-out request keeps its slot, so it counts against the limits; a misconfiguration costs nobody one.
  let who: Awaited<ReturnType<typeof whoIsAsking>>;
  try {
    who = await whoIsAsking(req, session);
  } catch (e) {
    // The sign-in lookup failed (an auth or database error): give the slot back, so an outage does not use up the daily limits.
    await slot?.release();
    throw e;
  }
  if ("response" in who) {
    if (who.response.status !== 401) await slot?.release();
    return who.response;
  }

  // The last gate before anything is paid for: the guards above are the backstop, this is the account's quota.
  state.charging = true;
  const charged = await charge(who, "manifest").finally(() => {
    state.charging = false;
  });
  if ("response" in charged) {
    await slot?.release();
    return charged.response;
  }
  state.charged = charged;
  if (state.timedOut) {
    // The deadline already passed while the credit was being taken: give it back and stop.
    await charged.refund();
    alertFailure("manifest_timeout", { route: "manifest", reason: "timeout", model: voice.model, voice: voice.id, elapsedMs: Date.now() - started });
    return timeoutResponse(true);
  }

  // Hard-block gate: runs for every account, no off switch.
  const gate = adultGate(want);
  if (!gate.allowed) {
    await charged.refund();
    await slot?.release();
    // Log reason only — never log the wish text.
    console.info("[adult_gate_block]", JSON.stringify({ reason: gate.reason, route: "manifest" }));
    return NextResponse.json({ code: "content_policy", error: gate.guidance }, { status: 422 });
  }

  // Read scriptMode before the adult branch so exact mode can skip writeAdultScript.
  const isExact = body.scriptMode === "exact";

  // Adult-tier path: allowlisted users get the uncensored model.
  const isAdult = isAdultTierUser(session?.email ?? null);
  if (isAdult) {
    let adultScript: Script | undefined;
    if (isExact) {
      // Exact mode: skip the adult model; use the user's translated lines directly.
      if (wishSexualisesMinor(want)) {
        captureEvent("script_withheld", { route: "manifest", attempt_id: attemptId });
        adultScript = { lines: neutralScript(name), source: "template", reason: "withheld", refrain: DEFAULT_REFRAIN };
      } else {
        const { lines, refrain } = exactLines(want, name);
        adultScript = { lines, source: "exact", refrain };
      }
    } else {
      const adultResult = await writeAdultScript({ key, want, name, variant, attemptId });
      if (!adultResult.ok) {
        console.warn("[adult_script_refused]", JSON.stringify({ reason: adultResult.reason, category: adultResult.category ?? null, route: "manifest", attempt_id: attemptId }));
        if (adultResult.reason === "output_gate") {
          await charged.refund();
          await slot?.release();
          const r = NextResponse.json({ code: "content_policy", supportCode: attemptId.replace(/-/g, "").slice(0, 8), error: "The script did not pass the content check. Please try again." }, { status: 422 });
          withAttemptHeaders(r, attemptId);
          return r;
        }
        // no_model: adult models unavailable — alert and fall through to the standard script path.
        alertFailure("adult_models_unavailable", { route: "manifest", attempt_id: attemptId });
      } else {
        adultScript = adultResult.script;
      }
    }
    if (adultScript !== undefined) {
    // No share link and no gallery for adult-tier items.
    // The X-Adult header tells the native app to suppress share/gallery controls.
    const repeat = body.repeat === true && /^(?:heygen\/|google\/gemini)/.test(voice.model);
    const recorded = repeat ? [...adultScript.lines, adultScript.refrain] : adultScript.lines;
    const text = recorded.join("\n\n");
    const spoken = recorded.join(" ").length;
    if (adultScript.source === "model" || (adultScript.costUsd ?? 0) > 0) {
      await record({ route: "manifest", kind: "script", source: adultScript.source, model: adultScript.model ?? null, chars: spoken, estUsd: adultScript.costUsd ?? null });
    }
    console.info("[script_stage]", JSON.stringify({ attempt_id: attemptId, stage: "script", source: adultScript.source, model: adultScript.model ?? null, chars: spoken, elapsedMs: Date.now() - started }));
    if (state.timedOut) {
      alertFailure("manifest_timeout", { route: "manifest", reason: "timeout", step: "script", model: adultScript.model ?? null, elapsedMs: Date.now() - started, attempt_id: attemptId });
      return timeoutResponse(true);
    }
    // Adult-tier TTS: try up to MAX_ADULT_TTS voices in fallback order.
    // The requested voice is first; config fallbacks follow if it refuses or errors.
    const MAX_ADULT_TTS = 3;
    const chain = buildAdultVoiceChain(
      { id: voice.id, model: voice.model, voice: voice.voice, atomic: voice.atomic },
      LIMITS.adultTtsFallback,
      MAX_ADULT_TTS,
    );

    let speech: Awaited<ReturnType<typeof synthesize>> | undefined;
    let usedId = voice.id;

    for (let i = 0; i < chain.length; i++) {
      const c = chain[i];
      // Re-check ceiling before each attempt — a concurrent request may have consumed the allowance between iterations.
      const iterCeiling = await underCeiling(key);
      if (!iterCeiling.ok) {
        await charged.refund();
        await slot?.release();
        return NextResponse.json(iterCeiling.refusal, { status: iterCeiling.refusal.status });
      }
      const ms = voiceBudget(state, Math.max(3_000, Math.min(42_000, 52_000 - (Date.now() - started))));
      if (ms === null) {
        alertFailure("manifest_timeout", { route: "manifest", reason: "timeout", step: "audio", model: c.model, voice: c.id, elapsedMs: Date.now() - started, attempt_id: attemptId });
        return timeoutAnswer(state);
      }
      const audioStart = Date.now();
      let s: Awaited<ReturnType<typeof synthesize>>;
      try {
        s = await synthesize({ key, model: c.model, voice: c.voice, text, lines: recorded, tail: repeat ? 1 : 0, pauseMs: pauseFor(pace, tone), speed: speedFor(pace, tone), instructions: TAKES_STYLE.test(c.model) ? styleInstruction(pace, tone) : undefined, compact: true, timeoutMs: ms, atomic: c.atomic });
      } catch (e) {
        const name = e instanceof Error ? e.name : "unknown";
        console.warn("[audio_stage]", JSON.stringify({ attempt_id: attemptId, stage: "audio", attempt: i + 1, model: c.model, voice: c.id, outcome: name, ms: Date.now() - audioStart }));
        s = { ok: false, status: 504, message: name };
      }
      console.info("[audio_stage]", JSON.stringify({ attempt_id: attemptId, stage: "audio", attempt: i + 1, model: c.model, voice: c.id, ok: s.ok, ms: Date.now() - audioStart, ...(!s.ok ? { status: s.status } : {}) }));
      if (s.ok) {
        await record({ route: "manifest", kind: "speech", model: c.model, voiceId: c.id, chars: s.sentChars, estUsd: await estimateSpeech(c.model, s.sentChars) });
      } else {
        await record({ route: "manifest", kind: "speech", model: c.model, voiceId: c.id, chars: s.sentChars ?? spoken, estUsd: null, ok: false });
      }
      speech = s;
      usedId = c.id;
      if (s.ok) break;
    }

    if (!speech?.ok) {
      await charged.refund();
      const r = NextResponse.json({ code: "voice_failed", supportCode: attemptId.replace(/-/g, "").slice(0, 8), error: "The voice could not be recorded just now.", ...(adultScript.source === "model" ? { lines: adultScript.lines } : {}) }, { status: 502 });
      withAttemptHeaders(r, attemptId);
      return r;
    }
    if (!state.timedOut) await charged.fulfil();
    return new NextResponse(speech.audio, {
      headers: {
        "Content-Type": speech.mime, "Cache-Control": "no-store",
        "X-Script": Buffer.from(JSON.stringify(adultScript.lines), "utf8").toString("base64"),
        "X-Script-Source": adultScript.source,
        ...(adultScript.source === "exact" ? { "X-Script-Mode": "exact" } : {}),
        "X-Adult": "1",
        ...(repeat && !speech.tailDropped ? { "X-Refrain": Buffer.from(adultScript.refrain, "utf8").toString("base64") } : {}),
        ...(charged.left !== null ? { "X-Credits-Left": charged.left } : {}),
        "X-Voice-Id": usedId, "X-Chars": String(text.length), "X-Pace": pace.id, "X-Tone": tone.id,
        "X-Speed-Applied": speech.speedApplied ? "1" : "0",
        ...(speech.pauseMs ? { "X-Pause-Ms": String(speech.pauseMs) } : {}),
        ...(speech.starts ? { "X-Line-Starts": JSON.stringify(speech.starts) } : {}),
      },
    });
    } // end if (adultScript)
  } // end if (isAdult)

  console.info("[attempt_started]", JSON.stringify({ attempt_id: attemptId, build, route: "manifest" }));
  captureEvent("attempt_started", { route: "manifest", attempt_id: attemptId, build });
  let script: Script;
  if (isExact) {
    if (wishSexualisesMinor(want)) {
      captureEvent("script_withheld", { route: "manifest", attempt_id: attemptId });
      const category = wishSexualisesMinorCategory(want);
      script = { lines: neutralScript(name), source: "template", reason: "withheld", refrain: DEFAULT_REFRAIN, ...(category ? {} : {}) };
    } else {
      const { lines, refrain } = exactLines(want, name);
      script = { lines, source: "exact", refrain };
    }
  } else {
    script = await writeScript({ key, want, name, variant, toneNote: tone.scriptNote, relaxed, attemptId, voiceId: voice.id, voiceModel: voice.model });
  }
  if (script.source === "model") {
    captureEvent("script_ok", { route: "manifest", attempt_id: attemptId, model: script.model, elapsedMs: Date.now() - started });
  }
  console.info("[script_stage]", JSON.stringify({ attempt_id: attemptId, stage: "script", source: script.source, model: script.model ?? null, chars: script.lines.join(" ").length, elapsedMs: Date.now() - started }));
  // Programming mode (#77): the refrain is recorded once, as one more line at
  // the end, and the app loops it. Only voices recorded as PCM with line starts
  // can be cut apart in the browser.
  const repeat = body.repeat === true && /^(?:heygen\/|google\/gemini)/.test(voice.model);
  const recorded = repeat ? [...script.lines, script.refrain] : script.lines;
  // Split long sentences into natural-pause phrases and assign per-gap pause lengths.
  const tail = repeat ? 1 : 0;
  const segments = segmentLines(recorded, tail);
  const { lines: pausedLines, pauseMsPerGap } = segmentsToPausedLines(segments);
  // A blank line between lines is the pause we can ask of voices whose audio
  // cannot be stitched; the others get real silence between lines.
  const text = pausedLines.join("\n\n");
  // Characters actually spoken, for the ledger: the blank lines between lines
  // are not sent when a voice is recorded line by line.
  const spoken = pausedLines.join(" ").length;
  // A template script after paid tries is recorded too: those tries were billed. Exact mode is free (no model).
  if (script.source === "model" || script.source === "template" && (script.costUsd ?? 0) > 0) {
    // The writer returns what OpenRouter billed for the script, tries that gave nothing included (#170).
    await record({ route: "manifest", kind: "script", source: script.source, model: script.model ?? null, chars: spoken, estUsd: script.costUsd ?? null });
  }
  // The deadline passed while the script was being written: do not start the voice, the credit is already refunded.
  if (state.timedOut) {
    alertFailure("manifest_timeout", { route: "manifest", reason: "timeout", step: "script", model: script.model ?? voice.model, voice: voice.id, elapsedMs: Date.now() - started, attempt_id: attemptId });
    return timeoutResponse(true);
  }
  // With the paywall on, the voice call also ends before the paywall's deadline (50 s): the route's own 52 s budget alone could pass it.
  const voiceMs = voiceBudget(state, Math.max(3_000, Math.min(42_000, 52_000 - (Date.now() - started))));
  if (voiceMs === null) {
    alertFailure("manifest_timeout", { route: "manifest", reason: "timeout", step: "audio", model: script.model ?? voice.model, voice: voice.id, elapsedMs: Date.now() - started, attempt_id: attemptId });
    return timeoutAnswer(state);
  }

  // Try the primary voice, then one fallback from adultTtsFallback if it fails or throws.
  const audioFallbacks = LIMITS.adultTtsFallback.slice(0, 1);
  const voiceChain = [
    { id: voice.id, model: voice.model, voice: voice.voice, atomic: voice.atomic === true },
    ...audioFallbacks,
  ];
  let speech: Awaited<ReturnType<typeof synthesize>> | undefined;
  let usedVoiceId = voice.id;
  let remainingMs = voiceMs;

  for (let vi = 0; vi < voiceChain.length; vi++) {
    const vc = voiceChain[vi];
    if (vi > 0) {
      // Re-check budget for the fallback attempt.
      const fb = voiceBudget(state, Math.max(3_000, Math.min(42_000, 52_000 - (Date.now() - started))));
      if (fb === null) break;
      remainingMs = fb;
    }
    const audioStart = Date.now();
    let s: Awaited<ReturnType<typeof synthesize>>;
    try {
      s = await synthesize({
        key,
        model: vc.model,
        voice: vc.voice,
        text,
        lines: pausedLines,
        // The refrain follows the closing with no pause, and its length does not
        // shorten the pauses between the script's lines.
        tail,
        pauseMs: cadenceOpt ? cadenceOpt.pauseMs : pauseFor(pace, tone),
        pauseMsPerGap,
        speed: speedOpt ? speedOpt.speed : speedFor(pace, tone),
        instructions: TAKES_STYLE.test(vc.model) ? styleInstruction(pace, tone) : undefined,
        compact: true,
        // 8 s are kept for the ledger writes and the reply; a slow script leaves the voice less, and a failed voice returns the script for the device voice.
        timeoutMs: remainingMs,
        atomic: vc.atomic,
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "unknown";
      console.warn("[audio_stage]", JSON.stringify({ attempt_id: attemptId, stage: "audio", attempt: vi + 1, model: vc.model, voice: vc.id, outcome: name, ms: Date.now() - audioStart }));
      s = { ok: false, status: 504, message: name };
    }
    console.info("[audio_stage]", JSON.stringify({ attempt_id: attemptId, stage: "audio", attempt: vi + 1, model: vc.model, voice: vc.id, ok: s.ok, ms: Date.now() - audioStart, ...(!s.ok ? { status: s.status } : {}) }));
    if (s.ok) {
      await record({ route: "manifest", kind: "speech", model: vc.model, voiceId: vc.id, chars: s.sentChars, estUsd: await estimateSpeech(vc.model, s.sentChars) });
    } else {
      await record({ route: "manifest", kind: "speech", model: vc.model, voiceId: vc.id, chars: s.sentChars ?? spoken, estUsd: null, ok: false });
    }
    speech = s;
    usedVoiceId = vc.id;
    if (s.ok) break;
  }

  if (!speech?.ok) {
    // A failed recording may still have been billed in part (several requests
    // for a long script), so it is recorded, unpriced.
    // The upstream reason, so a failure can be read from the log (#73). Never the key.
    console.warn("[voice_failed]", JSON.stringify({ attempt_id: attemptId, route: "manifest", model: voice.model, voiceId: voice.id, status: speech?.status, message: speech?.message }));
    alertFailure("voice_failed", { route: "manifest", model: voice.model, voice: voice.id, status: speech?.status, elapsedMs: Date.now() - started, attempt_id: attemptId });
    await charged.refund();
    const failRes = NextResponse.json(
      {
        code: "voice_failed",
        supportCode: attemptId.replace(/-/g, "").slice(0, 8),
        error: "The voice could not be recorded just now.",
        // The model's script was already written and vetted: the device voice
        // reads it instead of the general one. A template script is not sent.
        ...(script.source === "model" ? { lines: script.lines } : {}),
        // Why the template was used, when it was: the client can show a reason-specific note.
        ...(script.source === "template" && script.reason ? { reason: script.reason } : {}),
      },
      { status: 502 },
    );
    withAttemptHeaders(failRes, attemptId);
    return failRes;
  }

  captureEvent("voice_ok", { route: "manifest", attempt_id: attemptId, model: voice.model, elapsedMs: Date.now() - started });
  // The recording is made: mark the spend delivered so it is never refunded by reconciliation.
  if (!state.timedOut) await charged.fulfil(); // a timed-out request was already refunded or left for reconciliation
  captureEvent("attempt_done", { route: "manifest", attempt_id: attemptId, elapsedMs: Date.now() - started });
  return new NextResponse(speech.audio, {
    headers: {
      "Content-Type": speech.mime,
      "Cache-Control": "no-store",
      "X-Attempt-Id": attemptId,
      ...(build ? { "X-Build": build } : {}),
      "X-Script": Buffer.from(JSON.stringify(script.lines), "utf8").toString("base64"),
      "X-Script-Source": script.source,
      ...(script.source === "template" && script.reason ? { "X-Script-Reason": script.reason } : {}),
      ...(script.source === "exact" ? { "X-Script-Mode": "exact" } : {}),
      ...(script.title ? { "X-Title": Buffer.from(script.title, "utf8").toString("base64") } : {}),
      ...(script.term ? { "X-Script-Term": script.term } : {}),
      // When set, the last line start belongs to this refrain, recorded after the script.
      ...(repeat && !speech.tailDropped ? { "X-Refrain": Buffer.from(script.refrain, "utf8").toString("base64") } : {}),
      // Repetition was asked for, but this voice's audio cannot be cut apart to
      // loop ("unsupported"), or this take's refrain could not be cut cleanly
      // and was left out ("skipped").
      ...(body.repeat === true && !repeat ? { "X-Repeat": "unsupported" } : {}),
      ...(repeat && speech.tailDropped ? { "X-Repeat": "skipped" } : {}),
      ...(charged.left !== null ? { "X-Credits-Left": charged.left } : {}),
      "X-Voice-Id": usedVoiceId,
      "X-Chars": String(text.length),
      "X-Pace": pace.id,
      "X-Tone": tone.id,
      // Whether the model took the speed we sent, and the pause used between lines.
      "X-Speed-Applied": speech.speedApplied ? "1" : "0",
      ...(speech.pauseMs ? { "X-Pause-Ms": String(speech.pauseMs) } : {}),
      ...(speech.starts ? { "X-Line-Starts": JSON.stringify(speech.starts) } : {}),
    },
  });
}
