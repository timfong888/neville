#!/usr/bin/env node
// Measures how Orpheus responds to speed settings at different response formats.
// Writes results to docs/measurements/orpheus-pace.md.
// Usage: OPENROUTER_API_KEY=sk-... node scripts/measure-voice-pace.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
const KEY = process.env.OPENROUTER_API_KEY?.trim();

if (!KEY) {
  mkdirSync(join(ROOT, "docs/measurements"), { recursive: true });
  writeFileSync(
    join(ROOT, "docs/measurements/QUESTIONS.md"),
    "# QUESTIONS\n\n- `OPENROUTER_API_KEY` is not set; measurement could not run.\n"
  );
  console.error("OPENROUTER_API_KEY is not set. Result written to docs/measurements/QUESTIONS.md");
  process.exit(1);
}

// Exactly 20 words.
const SENTENCE =
  "You are standing in a bright open field where the morning sun gently touches each flower and warms the earth.";

// Speed 1.0 is the model's own pace; the app skips sending it (matches tts.ts behaviour).
const SPEEDS = [0.75, 0.88, 1.0, 1.05];
const FORMATS = ["mp3", "pcm"];

// Tara is the primary voice under test; Leah is the second Orpheus voice requested.
const VOICES = [
  { model: "canopylabs/orpheus-3b-0.1-ft", voice: "tara", id: "orpheus-tara" },
  { model: "canopylabs/orpheus-3b-0.1-ft", voice: "leah", id: "orpheus-leah" },
];

function parsePcmRate(contentType) {
  const m = /rate=(\d+)/.exec(contentType ?? "");
  const r = m ? parseInt(m[1], 10) : NaN;
  return r >= 8000 && r <= 96000 ? r : null;
}

function pcmDuration(byteLength, rate) {
  // 16-bit mono: 2 bytes per sample
  return byteLength / (rate * 2);
}

async function measure(model, voice, speed, format) {
  const body = {
    model,
    voice,
    input: SENTENCE,
    response_format: format,
    // Match tts.ts: skip speed=1.0 (the model's own pace is not sent)
    ...(speed !== 1.0 ? { speed } : {}),
  };

  let res;
  try {
    res = await fetch(`${OPENROUTER_BASE}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Neville-measure",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    return { result: "timeout", durationS: null, rate: null, bytes: null, error: String(e) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const result = res.status === 400 || res.status === 422 ? "refused" : "error";
    return { result, durationS: null, rate: null, bytes: null, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  const contentType = res.headers.get("content-type") ?? "";
  const buf = await res.arrayBuffer();

  if (format === "pcm") {
    const rate = parsePcmRate(contentType);
    if (!rate) {
      return {
        result: "accepted",
        durationS: null,
        rate: null,
        bytes: buf.byteLength,
        note: `no rate in content-type: ${contentType}`,
      };
    }
    return {
      result: "accepted",
      durationS: pcmDuration(buf.byteLength, rate),
      rate,
      bytes: buf.byteLength,
    };
  }

  // MP3: duration is estimated from byte count at ~32 kbps (Orpheus/OpenRouter default).
  // This is an approximation; check the pcm column for authoritative durations.
  const durationS = buf.byteLength / 4000; // 32 kbps = 4000 bytes/s
  return { result: "accepted", durationS, rate: null, bytes: buf.byteLength, note: "mp3 duration estimated" };
}

console.log("Measuring Orpheus pace…");
console.log(`Sentence (${SENTENCE.split(" ").length} words): "${SENTENCE}"`);
console.log("");

const results = [];
for (const v of VOICES) {
  for (const format of FORMATS) {
    for (const speed of SPEEDS) {
      const speedStr = speed === 1.0 ? "1.0 (not sent)" : String(speed);
      process.stdout.write(`  ${v.id}  format=${format}  speed=${speedStr}  … `);
      const r = await measure(v.model, v.voice, speed, format);
      const summary =
        r.result === "accepted"
          ? `${r.durationS !== null ? r.durationS.toFixed(2) + "s" : "?s"} ${r.rate ? `(${r.rate} Hz)` : ""} ${r.note ?? ""}`
          : `${r.result}${r.error ? ` — ${r.error.slice(0, 80)}` : ""}`;
      console.log(summary);
      results.push({ voice: v.id, format, speed, ...r });
      // Small gap to avoid hammering the API
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

// Speed-variation check for Tara PCM
const taraPcm = results.filter(
  (r) => r.voice === "orpheus-tara" && r.format === "pcm" && r.result === "accepted" && r.durationS !== null
);
let speedVerdict = "— (insufficient pcm data)";
if (taraPcm.length >= 2) {
  const durations = taraPcm.map((r) => r.durationS);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const variation = max > 0 ? (max - min) / max : 0;
  speedVerdict =
    variation < 0.05
      ? `Variation ${(variation * 100).toFixed(1)}% → **speed is ignored** (< 5% threshold)`
      : `Variation ${(variation * 100).toFixed(1)}% → **speed appears honoured** (≥ 5% threshold)`;
}

// Did pcm work?
const pcmWorks = results.some((r) => r.format === "pcm" && r.result === "accepted" && r.rate !== null);
const pcmSampleRate = results.find((r) => r.format === "pcm" && r.rate)?.rate ?? null;

// Markdown table
const header = "| Voice | Format | Speed sent | Speed field | Duration | PCM rate |";
const sep = "| --- | --- | --- | --- | --- | --- |";
const rows = results.map((r) => {
  const sent = r.speed === 1.0 ? "— (1.0 skipped)" : String(r.speed);
  const dur = r.durationS !== null ? `${r.durationS.toFixed(2)} s` : "—";
  const rate = r.rate ? `${r.rate} Hz` : "—";
  return `| ${r.voice} | ${r.format} | ${sent} | ${r.result} | ${dur} | ${rate} |`;
});

const doc = `# Orpheus pace measurement

Measured 2026-11-28 against OpenRouter \`canopylabs/orpheus-3b-0.1-ft\`.

**Sentence (${SENTENCE.split(" ").length} words):** "${SENTENCE}"

## Results

${[header, sep, ...rows].join("\n")}

## Analysis

**Speed honoured?** ${speedVerdict}

**PCM works?** ${pcmWorks ? `Yes — sample rate ${pcmSampleRate} Hz` : "No (all pcm requests failed or returned no rate)"}

## Notes

- Speed \`1.0\` is not sent (the app skips it, matching \`tts.ts\` behaviour; "— (1.0 skipped)" in Speed sent).
- "refused" = HTTP 400/422 on the speed field; "accepted" = field sent with no refusal (may still be ignored).
- MP3 duration is estimated from byte size at ~32 kbps; treat as approximate.
- PCM duration is exact: \`byteLength / (rate × 2)\` for 16-bit mono.
`;

mkdirSync(join(ROOT, "docs/measurements"), { recursive: true });
writeFileSync(join(ROOT, "docs/measurements/orpheus-pace.md"), doc);
console.log("\nResults written to docs/measurements/orpheus-pace.md");
