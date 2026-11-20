// Dev sample of a Lesson quote set (issue #43): reads the "## Quote set" table
// in a lesson's markdown, records each quote in one voice, joins them with
// pauses and mixes them over the Calm music. Quotes only: no narrator, no
// AI-written text. Not production content: it writes under docs/, which the
// app does not serve.
//
//   OPENROUTER_API_KEY=... node scripts/record-lesson-sample.mjs [lesson.md] [--voice=george] [--count=9] [--clip=1] [--dry]
//
//   --voice  a key of VOICES below (default george)
//   --count  record the first N quotes (default: all)
//   --clip=N record only quote N, as a short audition clip
//
// Node's fetch needs NODE_USE_ENV_PROXY=1 behind an HTTPS proxy.
// Calls OpenRouter's /audio/speech directly with the same request shape as
// lib/server/tts.ts. Needs ffmpeg. Stops before spending past
// SAMPLE_BUDGET_USD (default 0.50).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const KEY = process.env.OPENROUTER_API_KEY;
const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const BUDGET = Number(process.env.SAMPLE_BUDGET_USD ?? "0.50");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const DRY = process.argv.includes("--dry");
const SRC = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "docs/specs/lessons/lesson-01.md";
const OUT = "docs/specs/lessons/samples";

// The quote voice Tim asked for (2026-11-20): male, authoritative, slightly
// British, warm, with a lecturer's clip. Lecturer voices run at their natural
// pace: in Calm the calm comes from the pauses and the music.
const LECTURER =
  "Read as a warm, authoritative British lecturer with a light received-pronunciation accent. " +
  "Measured and crisp, every consonant clear, never theatrical or sing-song. " +
  "Do not sound excited. Let your pitch settle at the end of each sentence.";
const VOICES = {
  george: { label: "ElevenLabs George", model: "elevenlabs/eleven-v4-turbo", voice: "george", format: "mp3", usdPerChar: 40 / 1e6 },
  daniel: { label: "ElevenLabs Daniel", model: "elevenlabs/eleven-v4-turbo", voice: "daniel", format: "mp3", usdPerChar: 40 / 1e6 },
  sadaltager: { label: "Gemini Sadaltager", model: "google/gemini-3.8-flash-tts", voice: "Sadaltager", format: "pcm", rate: 24000, instructions: LECTURER, usdPerChar: 0.3 / 1e3 / 60 },
  vindemiatrix: {
    label: "Gemini Vindemiatrix",
    model: "google/gemini-3.8-flash-lite-tts",
    voice: "Vindemiatrix",
    format: "pcm",
    rate: 24000,
    speed: 0.88,
    instructions:
      "Speak slowly, in a calm, warm, steady voice, like a trusted guide leading a meditation, low in energy and never announcing. " +
      "Keep your energy low. Do not sound excited, and do not lean on or stress any word. Let your pitch settle at the end of each line.",
    usdPerChar: 0.3 / 1e3 / 60,
  },
};
const V = VOICES[arg("voice") ?? "george"];
if (!V) throw new Error(`unknown --voice; one of ${Object.keys(VOICES).join(", ")}`);

// Mirrors lib/modes.ts for Calm: morning-light at 0.6 with a 2 s fade-in.
const CALM = { music: "morning-light", volume: 0.6, fadeIn: 2 };
// A quote needs longer to land than a manifestation line, so the gap is longer than Calm's 1.5 s.
const GAP_MS = 3500;
const RATE = 24000; // everything is decoded to 24 kHz mono before joining
const musicDb = (v) => (v === 0 ? -120 : -8 - (1 - v) * 24);

/** Rows of the "## Quote set" table: `| # | Page | Big idea | Quote |`. */
function parseQuotes(md) {
  const section = md.split(/^## Quote set.*$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    .map((row) => /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(row))
    .filter(Boolean)
    .map(([, n, page, idea, text]) => ({ n: Number(n), page, idea, text }));
}

const usage = async () => {
  const r = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`cannot read key usage: ${r.status}`);
  return (await r.json()).data.usage;
};

/** The upstream sometimes answers 429 or 5xx for a moment; wait and try again a few times. */
async function speak(text, tries = 5) {
  for (let t = 1; ; t++) {
    try {
      return await speakOnce(text);
    } catch (e) {
      if (t >= tries || !/speech failed (429|5\d\d)/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 4000 * t));
    }
  }
}

async function speakOnce(text) {
  for (const withSpeed of V.speed ? [true, false] : [false]) {
    const res = await fetch(`${API}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "Neville" },
      body: JSON.stringify({
        model: V.model,
        voice: V.voice,
        ...(V.instructions ? { instructions: V.instructions } : {}),
        input: text,
        response_format: V.format,
        ...(withSpeed ? { speed: V.speed } : {}),
      }),
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

/** Any upstream audio to 24 kHz mono 16-bit PCM, levelled so quotes and voices match. */
function toLevelledPcm(audio) {
  const input = V.format === "pcm" ? ["-f", "s16le", "-ar", String(V.rate), "-ac", "1", "-i", "pipe:0"] : ["-f", "mp3", "-i", "pipe:0"];
  return ffmpeg([...input, "-af", "loudnorm=I=-19:TP=-2:LRA=7", "-ar", String(RATE), "-ac", "1", "-f", "s16le", "pipe:1"], audio);
}
const silence = (ms) => Buffer.alloc(Math.round((RATE * ms) / 1000) * 2);

const all = parseQuotes(readFileSync(SRC, "utf8"));
const clip = arg("clip") ? Number(arg("clip")) : null;
const quotes = clip ? all.filter((q) => q.n === clip) : all.slice(0, Number(arg("count") ?? all.length));
if (!quotes.length) throw new Error(`no quote rows found in ${SRC}`);
const chars = quotes.reduce((n, q) => n + q.text.length, 0);
const estimate = chars * V.usdPerChar;
if (DRY || !KEY) {
  console.log(JSON.stringify({ src: SRC, voice: V, count: quotes.length, chars, estimateUsd: estimate, budgetUsd: BUDGET, quotes }, null, 2));
  if (!KEY && !DRY) console.error("OPENROUTER_API_KEY is not set: dry run only.");
  process.exit(0);
}
if (estimate > BUDGET) throw new Error(`estimate $${estimate.toFixed(4)} is over the $${BUDGET} budget`);

const before = await usage();
const parts = [];
for (const [i, q] of quotes.entries()) {
  if ((await usage()) - before + q.text.length * V.usdPerChar > BUDGET) throw new Error("budget reached");
  parts.push(toLevelledPcm(await speak(q.text)), silence(i < quotes.length - 1 ? GAP_MS : 0));
  process.stdout.write(`quote ${q.n} (p. ${q.page}) recorded\n`);
}
// OpenRouter updates usage a little after the call; read again later for the true figure.
const spent = (await usage()) - before;

mkdirSync(OUT, { recursive: true });
const voiceKey = arg("voice") ?? "george";
const name = `${basename(SRC, ".md")}-${clip ? `clip${clip}` : "quotes"}-calm-${voiceKey}`;
const voiceFile = `${OUT}/${name}-voice.wav`;
ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", voiceFile], Buffer.concat(parts));
const lead = clip ? 1 : CALM.fadeIn;
const tail = clip ? 1.5 : 4;
const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voiceFile]).stdout.toString()) + lead + tail;
ffmpeg([
  "-i", voiceFile,
  "-stream_loop", "-1", "-ss", "1", "-i", `public/music/${CALM.music}.mp3`,
  "-filter_complex",
  `[1:a]volume=${musicDb(CALM.volume)}dB,afade=t=in:d=${lead}[m];` +
    `[0:a]adelay=${lead * 1000}|${lead * 1000},apad=pad_dur=${tail},aformat=channel_layouts=stereo,asplit=2[v][sc];` +
    `[m][sc]sidechaincompress=threshold=0.004:ratio=8:attack=80:release=500[md];` +
    `[v][md]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${(dur - Math.min(3, tail)).toFixed(2)}:d=${Math.min(3, tail)}[x]`,
  "-map", "[x]", "-t", dur.toFixed(2), "-codec:a", "libmp3lame", "-b:a", "96k", `${OUT}/${name}.mp3`,
]);
spawnSync("rm", [voiceFile]);
const info = {
  src: SRC,
  mode: "calm",
  voice: { key: voiceKey, label: V.label, model: V.model, voice: V.voice, instructions: V.instructions ?? null },
  quotes: quotes.map((q) => ({ n: q.n, page: q.page, idea: q.idea })),
  chars,
  durationS: Math.round(dur),
  estimateUsd: estimate,
  spentUsd: spent,
  recorded: new Date().toISOString(),
};
writeFileSync(`${OUT}/${name}.json`, JSON.stringify(info, null, 2) + "\n");
console.log(JSON.stringify({ name, durationS: info.durationS, spentUsd: spent, estimateUsd: estimate }));
