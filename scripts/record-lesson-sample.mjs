// Dev sample of a Lesson (issue #43): records the script table in a lesson's
// markdown, narrator lines in one voice and quote lines in another, joined with
// the Calm mode's pauses and mixed over the Calm music. Not production content:
// it writes under docs/, which the app does not serve.
//
//   OPENROUTER_API_KEY=... node scripts/record-lesson-sample.mjs [docs/specs/lessons/lesson-01.md] [--dry]
//
// Calls OpenRouter's /audio/speech directly, with the same request shape as
// lib/server/tts.ts (HeyGen returns raw 44.1 kHz PCM). Needs ffmpeg. Stops
// before spending past SAMPLE_BUDGET_USD (default 0.50).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const KEY = process.env.OPENROUTER_API_KEY;
const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const BUDGET = Number(process.env.SAMPLE_BUDGET_USD ?? "0.50");
const DRY = process.argv.includes("--dry");
const SRC = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "docs/specs/lessons/lesson-01.md";
const OUT = "docs/specs/lessons/samples";

// Mirrors lib/delivery.ts and lib/modes.ts for Calm: Slow pace, Calm tone, morning-light at 0.6.
const CALM = { speed: 0.88, pauseMs: 1500, music: "morning-light", volume: 0.6, fadeIn: 2 };
const MODEL = "heygen/heygen-voice-1-turbo";
const USD_PER_CHAR = 4 / 1e6; // OpenRouter list price for HeyGen Turbo, read 2026-11-20
const VOICES = { N: "nadine", Q: "lucian" };
const RATE = 44100;
const musicDb = (v) => (v === 0 ? -120 : -8 - (1 - v) * 24);

/** Rows of the "## Script" table: `| N | line |` or `| Q | line *(p. 3)* |`. */
function parseScript(md) {
  const section = md.split(/^## Script.*$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    .map((row) => /^\|\s*([NQ])\s*\|\s*(.+?)\s*\|\s*$/.exec(row))
    .filter(Boolean)
    .map(([, who, text]) => ({ who, text: text.replace(/\*\([^)]*\)\*/g, "").replace(/\s+/g, " ").trim() }));
}

const usage = async () => {
  const r = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`cannot read key usage: ${r.status}`);
  return (await r.json()).data.usage;
};

async function speak(text, voice) {
  for (const withSpeed of [true, false]) {
    const res = await fetch(`${API}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "Neville" },
      body: JSON.stringify({ model: MODEL, voice, input: text, response_format: "pcm", ...(withSpeed ? { speed: CALM.speed } : {}) }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (withSpeed && (res.status === 400 || res.status === 422)) continue;
    throw new Error(`speech failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

function ffmpeg(args, input) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return r.stdout;
}

/** Each line levelled on its own so the two voices match, as 16-bit mono PCM. */
const level = (pcm) =>
  ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-af", "loudnorm=I=-19:TP=-2:LRA=7", "-ar", String(RATE), "-f", "s16le", "pipe:1"], pcm);
const silence = (ms) => Buffer.alloc(Math.round((RATE * ms) / 1000) * 2);

const lines = parseScript(readFileSync(SRC, "utf8"));
const chars = lines.reduce((n, l) => n + l.text.length, 0);
const estimate = chars * USD_PER_CHAR;
if (!lines.length) throw new Error(`no script rows found in ${SRC}`);
if (DRY || !KEY) {
  console.log(JSON.stringify({ src: SRC, lineCount: lines.length, chars, estimateUsd: estimate, budgetUsd: BUDGET, lines }, null, 2));
  if (!KEY && !DRY) console.error("OPENROUTER_API_KEY is not set: dry run only.");
  process.exit(0);
}
if (estimate > BUDGET) throw new Error(`estimate $${estimate.toFixed(4)} is over the $${BUDGET} budget`);

const before = await usage();
const parts = [];
for (const [i, l] of lines.entries()) {
  if ((await usage()) - before + l.text.length * USD_PER_CHAR > BUDGET) throw new Error("budget reached");
  const pcm = level(await speak(l.text, VOICES[l.who]));
  // Quotes get a little more room either side, so they land.
  const next = lines[i + 1];
  const gap = l.who === "Q" || next?.who === "Q" ? CALM.pauseMs * 1.4 : CALM.pauseMs;
  parts.push(pcm, silence(next ? gap : 0));
  process.stdout.write(`${l.who} ${i + 1}/${lines.length}\n`);
}
const spent = (await usage()) - before;

mkdirSync(OUT, { recursive: true });
const name = basename(SRC, ".md");
const voiceFile = `${OUT}/${name}-calm-voice.wav`;
ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", voiceFile], Buffer.concat(parts));
const lead = CALM.fadeIn;
const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voiceFile]).stdout.toString()) + lead + 4;
ffmpeg([
  "-i", voiceFile,
  "-stream_loop", "-1", "-ss", "1", "-i", `public/music/${CALM.music}.mp3`,
  "-filter_complex",
  `[1:a]volume=${musicDb(CALM.volume)}dB,afade=t=in:d=${CALM.fadeIn}[m];` +
    `[0:a]adelay=${lead * 1000}|${lead * 1000},apad=pad_dur=4,aformat=channel_layouts=stereo,asplit=2[v][sc];` +
    `[m][sc]sidechaincompress=threshold=0.004:ratio=8:attack=80:release=500[md];` +
    `[v][md]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${(dur - 3).toFixed(2)}:d=3[x]`,
  "-map", "[x]", "-t", dur.toFixed(2), "-codec:a", "libmp3lame", "-b:a", "96k", `${OUT}/${name}-calm.mp3`,
]);
spawnSync("rm", [voiceFile]);
const info = { src: SRC, mode: "calm", model: MODEL, voices: VOICES, lines: lines.length, chars, durationS: Math.round(dur), estimateUsd: estimate, spentUsd: spent, recorded: new Date().toISOString() };
writeFileSync(`${OUT}/${name}-calm.json`, JSON.stringify(info, null, 2) + "\n");
console.log(JSON.stringify(info, null, 2));
