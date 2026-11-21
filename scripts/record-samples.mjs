// Records the before/after delivery samples for the pull request.
//
//   OPENROUTER_API_KEY=... npm run dev          (one terminal; the key stays on the server)
//   OPENROUTER_API_KEY=... node scripts/record-samples.mjs [--dry]
//
// "Before" is the delivery that was on main: the old script prompt, the script
// read as one run of text, Gemini given the one fixed style line, no speed, no
// pauses. "After" goes through this app's own /api/manifest with a pace and tone.
// Needs ffmpeg. Stops before spending past SAMPLE_BUDGET_USD (default 0.25) and
// writes public/delivery-samples/manifest.json with what each clip cost.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const KEY = process.env.OPENROUTER_API_KEY;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const BUDGET = Number(process.env.SAMPLE_BUDGET_USD ?? "0.25");
const DRY = process.argv.includes("--dry");
const OUT = "public/delivery-samples";

const voices = JSON.parse(readFileSync("config/voices.json", "utf8")).voices;
const limits = JSON.parse(readFileSync("config/limits.json", "utf8"));

const SAMPLES = [
  { id: "1-default-voice", title: "Default voice (Nadine), Slow + Calm", voiceId: "heygen-nadine", pace: "slow", tone: "calm",
    wish: "I want to be calm and confident when I speak", name: "Tim" },
  { id: "2-soft-very-slow", title: "Gemini Sulafat, Very slow + Soft", voiceId: "gemini-sulafat", pace: "very-slow", tone: "soft",
    wish: "a loving, easy relationship with my family", name: "Tim" },
  { id: "3-sleep", title: "Gemini Vindemiatrix, Very slow + Sleep", voiceId: "gemini-vindemiatrix", pace: "very-slow", tone: "sleep",
    wish: "to feel safe and rested, and to sleep deeply", name: "Tim" },
];

// The script prompt and style line exactly as they were on main before this change.
const OLD_SYSTEM = readFileSync(new URL("./old-system-prompt.txt", import.meta.url), "utf8").trim();
const OLD_STYLE = "Speak slowly, calmly and warmly, like a meditation guide. Leave a short pause after each sentence.";

const usage = async () => {
  const r = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`cannot read key usage: ${r.status}`);
  return (await r.json()).data.usage;
};

function toMp3(input, args, file) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args, "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k", file], { input });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

async function before(s) {
  const v = voices.find((x) => x.id === s.voiceId);
  const chat = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: limits.scriptModels[0], max_tokens: 400, temperature: 0.8,
      messages: [{ role: "system", content: OLD_SYSTEM }, { role: "user", content: JSON.stringify({ wish: s.wish, first_name: s.name }) }],
    }),
  });
  const text = (await chat.json()).choices[0].message.content.split(/\n+/).map((l) => l.trim()).filter(Boolean).join(" ");
  const res = await fetch(`${API}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: v.model, ...(v.voice ? { voice: v.voice } : {}),
      ...(/^google\/gemini/.test(v.model) ? { instructions: OLD_STYLE } : {}),
      input: text, response_format: "pcm",
    }),
  });
  if (!res.ok) throw new Error(`before ${s.id}: ${res.status} ${await res.text()}`);
  const rate = Number(/rate=(\d+)/.exec(res.headers.get("content-type") ?? "")?.[1]) || (v.model.startsWith("heygen/") ? 44100 : 24000);
  toMp3(Buffer.from(await res.arrayBuffer()), ["-f", "s16le", "-ar", String(rate), "-ac", "1"], `${OUT}/${s.id}-before.mp3`);
  return { script: text };
}

async function after(s) {
  const res = await fetch(`${APP}/api/manifest`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ want: s.wish, name: s.name, voiceId: s.voiceId, pace: s.pace, tone: s.tone, variant: 0 }),
  });
  if (!res.ok) throw new Error(`after ${s.id}: ${res.status} ${await res.text()}`);
  toMp3(Buffer.from(await res.arrayBuffer()), ["-f", "wav"], `${OUT}/${s.id}-after.mp3`);
  const lines = JSON.parse(Buffer.from(res.headers.get("X-Script"), "base64").toString("utf8"));
  return {
    script: lines.join(" "), scriptSource: res.headers.get("X-Script-Source"),
    speedApplied: res.headers.get("X-Speed-Applied") === "1", pauseMs: Number(res.headers.get("X-Pause-Ms") ?? 0) || null,
  };
}

if (DRY) {
  console.log(JSON.stringify({ app: APP, budgetUsd: BUDGET, samples: SAMPLES }, null, 2));
  process.exit(0);
}
if (!KEY) throw new Error("Set OPENROUTER_API_KEY (the dev server needs it too).");
mkdirSync(OUT, { recursive: true });
const start = await usage();
const rows = [];
for (const s of SAMPLES) {
  const now = await usage();
  if (now - start >= BUDGET) { console.log(`Budget of $${BUDGET} reached; stopping before ${s.id}.`); break; }
  const b = await before(s);
  const mid = await usage();
  const a = await after(s);
  const end = await usage();
  rows.push({ ...s, files: { before: `${s.id}-before.mp3`, after: `${s.id}-after.mp3` },
    before: { script: b.script, costUsd: +(mid - now).toFixed(5) },
    after: { script: a.script, scriptSource: a.scriptSource, speedApplied: a.speedApplied, pauseMs: a.pauseMs, costUsd: +(end - mid).toFixed(5) } });
  console.log(`${s.id}: before $${(mid - now).toFixed(4)}, after $${(end - mid).toFixed(4)}, speedApplied=${a.speedApplied}`);
}
const total = (await usage()) - start;
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ recordedAt: new Date().toISOString(), totalCostUsd: +total.toFixed(5), samples: rows }, null, 2));
console.log(`Spent $${total.toFixed(4)} on ${rows.length} pairs.`);
