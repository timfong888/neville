// Atomic voice probe (#76): 3 fixed scripts recorded in one request each, in
// the default voice, measured for pauses and size, and checked by
// transcription that no pause tag is spoken. Costs well under one US cent.
//
//   NODE_USE_ENV_PROXY=1 npx vitest run --config evals/vitest.config.ts evals/atomic.eval.ts
//
// Writes the recordings to evals/out/ (not committed) for listening.
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { synthesize } = await import("@/lib/server/tts");
const { MAX_AUDIO_BYTES, pauseFor, resolvePace, resolveTone, speedFor, styleInstruction } = await import("@/lib/delivery");
const { DEFAULT_VOICE_ID, resolveVoice } = await import("@/lib/voices");

const KEY = process.env.OPENROUTER_API_KEY ?? "sk-or-proxy-injected";

const SCRIPTS: Array<{ name: string; pace: string; tone: string; lines: string[] }> = [
  {
    name: "house-calm",
    pace: "slow",
    tone: "calm",
    lines: [
      "Take a slow breath in, and let it go.",
      "You own the small house by the sea.",
      "Your keys are warm in your hand.",
      "You unlock your own front door.",
      "The kitchen fills with morning light.",
      "The small house by the sea is yours.",
      "You are someone who is at home here.",
      "Thank you, thank you, thank you.",
      "It is done.",
    ],
  },
  {
    name: "sister-soft",
    pace: "slow",
    tone: "soft",
    lines: [
      "Your phone lights up with her name.",
      "You answer, and she laughs first.",
      "You and your sister talk with ease.",
      "She says she has missed you.",
      "You feel the old warmth return.",
      "You and your sister are close.",
      "Thank you for this, thank you.",
      "It is done.",
    ],
  },
  {
    name: "sleep-sleep",
    pace: "very-slow",
    tone: "sleep",
    lines: [
      "Let your body grow heavy now.",
      "You sleep deeply through the night.",
      "The room is dark and still.",
      "You wake rested in the morning light.",
      "You sleep deeply through the night.",
      "Thank you, thank you.",
      "It is done.",
    ],
  },
];

function gapsMs(wav: ArrayBuffer, rate: number, thr = 500, minMs = 250): number[] {
  const pcm = new Int16Array(wav, 44, Math.floor((wav.byteLength - 44) / 2));
  const win = Math.floor(rate * 0.02);
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i + win <= pcm.length; i += win) {
    let peak = 0;
    for (let j = i; j < i + win; j++) peak = Math.max(peak, Math.abs(pcm[j]));
    if (peak < thr) run++;
    else {
      if (run * 20 >= minMs) out.push(run * 20);
      run = 0;
    }
  }
  return out;
}

async function transcribe(wav: ArrayBuffer): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this audio verbatim, every word spoken, nothing else." },
            { type: "input_audio", input_audio: { data: Buffer.from(wav).toString("base64"), format: "wav" } },
          ],
        },
      ],
    }),
  });
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? "";
}

describe("atomic voice probe", async () => {
  const voice = resolveVoice(DEFAULT_VOICE_ID);
  mkdirSync("evals/out", { recursive: true });
  const results = await Promise.all(
    SCRIPTS.map(async (s) => {
      const pace = resolvePace(s.pace);
      const tone = resolveTone(s.tone);
      const t = Date.now();
      const out = await synthesize({
        key: KEY,
        model: voice.model,
        voice: voice.voice,
        text: s.lines.join("\n\n"),
        lines: s.lines,
        pauseMs: pauseFor(pace, tone),
        speed: speedFor(pace, tone),
        instructions: styleInstruction(pace, tone),
        compact: true,
        timeoutMs: 42_000,
        atomic: voice.atomic === true,
      });
      if (!out.ok) return { s, ok: false as const, message: out.message };
      writeFileSync(`evals/out/${s.name}.wav`, Buffer.from(out.audio));
      const rate = new DataView(out.audio).getUint32(24, true);
      const words = await transcribe(out.audio);
      return {
        s,
        ok: true as const,
        requests: out.requests,
        bytes: out.audio.byteLength,
        seconds: Math.round((out.audio.byteLength - 44) / 2 / rate),
        latencyS: Math.round((Date.now() - t) / 100) / 10,
        gaps: gapsMs(out.audio, rate),
        pauseMs: out.pauseMs,
        starts: out.starts,
        words,
      };
    }),
  );
  console.table(results.map((r) => (r.ok ? { name: r.s.name, requests: r.requests, seconds: r.seconds, latencyS: r.latencyS, bytes: r.bytes, pauseMs: r.pauseMs, lines: r.s.lines.length, starts: r.starts?.map((x) => x.toFixed(2)).join(" ") } : { name: r.s.name, error: r.message })));

  it(`records in ${voice.id}, one request per script`, () => {
    expect(voice.atomic).toBe(true);
    for (const r of results) {
      expect(r.ok, r.ok ? "" : r.message).toBe(true);
      if (r.ok) expect(r.requests).toBe(1);
    }
  });
  it("pauses between lines for the pace's own length", () => {
    for (const r of results) {
      if (!r.ok) continue;
      expect(r.pauseMs, `${r.s.name}: pauses were not found and set`).toBeGreaterThanOrEqual(1000);
      // Every line boundary carries at least the set pause (inner breaths may add more gaps).
      expect(r.gaps.filter((g) => g >= r.pauseMs! - 60).length).toBeGreaterThanOrEqual(r.s.lines.length - 1);
    }
  });
  it("fits in one response", () => {
    for (const r of results) if (r.ok) expect(r.bytes).toBeLessThanOrEqual(MAX_AUDIO_BYTES);
  });
  it("never speaks the pause tag", () => {
    for (const r of results) if (r.ok) expect(r.words.toLowerCase()).not.toMatch(/\bpause\b/);
  });
});
