// Dev sample of a Lesson quote set (issue #43): reads the first N rows of the
// "## Quote set" table in a lesson's markdown, records each quote in one calm
// voice, joins them with pauses and mixes them over the Calm music. Quotes only:
// no narrator, no AI-written text. Not production content: it writes under
// docs/, which the app does not serve.
//
//   OPENROUTER_API_KEY=... node scripts/record-lesson-sample.mjs [docs/specs/lessons/lesson-01.md] [--count=6] [--dry]
//
// Node's fetch needs NODE_USE_ENV_PROXY=1 behind an HTTPS proxy.
// Calls OpenRouter's /audio/speech directly with the same request shape as
// lib/server/tts.ts (Gemini returns raw 24 kHz PCM and takes a style
// instruction). Needs ffmpeg. Stops before spending past SAMPLE_BUDGET_USD
// (default 0.50).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const KEY = process.env.OPENROUTER_API_KEY;
const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const BUDGET = Number(process.env.SAMPLE_BUDGET_USD ?? "0.50");
const DRY = process.argv.includes("--dry");
const COUNT = Number(process.argv.find((a) => a.startsWith("--count="))?.split("=")[1] ?? "6");
const SRC = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "docs/specs/lessons/lesson-01.md";
const OUT = "docs/specs/lessons/samples";

// Mirrors lib/delivery.ts and lib/modes.ts for Calm: Slow pace, Calm tone, morning-light at 0.6.
const CALM = {
  speed: 0.88,
  music: "morning-light",
  volume: 0.6,
  fadeIn: 2,
  // styleInstruction(Slow, Calm) from lib/delivery.ts, minus "present tense", which quotes can't follow.
  instructions:
    "Speak slowly, in a calm, warm, steady voice, like a trusted guide leading a meditation, low in energy and never announcing. " +
    "Keep your energy low. Do not sound excited, and do not lean on or stress any word. " +
    "Let your pitch settle at the end of each line, and leave a pause after every line.",
};
// A quote needs longer to land than a manifestation line, so the gap is longer than Calm's 1.5 s.
const GAP_MS = 3500;
const MODEL = "google/gemini-3.8-flash-lite-tts";
const VOICE = "Vindemiatrix";
const RATE = 24000;
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
  for (const withSpeed of [true, false]) {
    const res = await fetch(`${API}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "Neville" },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        instructions: CALM.instructions,
        input: text,
        response_format: "pcm",
        ...(withSpeed ? { speed: CALM.speed } : {}),
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

/** Each quote levelled on its own so they match, as 16-bit mono PCM. */
const level = (pcm) =>
  ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-af", "loudnorm=I=-19:TP=-2:LRA=7", "-ar", String(RATE), "-f", "s16le", "pipe:1"], pcm);
const silence = (ms) => Buffer.alloc(Math.round((RATE * ms) / 1000) * 2);

const quotes = parseQuotes(readFileSync(SRC, "utf8")).slice(0, COUNT);
if (!quotes.length) throw new Error(`no quote rows found in ${SRC}`);
const chars = quotes.reduce((n, q) => n + q.text.length, 0);
if (DRY || !KEY) {
  console.log(JSON.stringify({ src: SRC, model: MODEL, voice: VOICE, count: quotes.length, chars, budgetUsd: BUDGET, quotes }, null, 2));
  if (!KEY && !DRY) console.error("OPENROUTER_API_KEY is not set: dry run only.");
  process.exit(0);
}

const before = await usage();
const parts = [];
for (const [i, q] of quotes.entries()) {
  if ((await usage()) - before > BUDGET) throw new Error("budget reached");
  parts.push(level(await speak(q.text)), silence(i < quotes.length - 1 ? GAP_MS : 0));
  process.stdout.write(`quote ${q.n} (p. ${q.page}) recorded\n`);
}
// OpenRouter updates usage a little after the call; read again later for the true figure.
const spent = (await usage()) - before;

mkdirSync(OUT, { recursive: true });
const name = `${basename(SRC, ".md")}-quotes-calm`;
const voiceFile = `${OUT}/${name}-voice.wav`;
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
  "-map", "[x]", "-t", dur.toFixed(2), "-codec:a", "libmp3lame", "-b:a", "96k", `${OUT}/${name}.mp3`,
]);
spawnSync("rm", [voiceFile]);
const info = {
  src: SRC,
  mode: "calm",
  model: MODEL,
  voice: VOICE,
  quotes: quotes.map((q) => ({ n: q.n, page: q.page, idea: q.idea })),
  chars,
  durationS: Math.round(dur),
  spentUsd: spent,
  recorded: new Date().toISOString(),
};
writeFileSync(`${OUT}/${name}.json`, JSON.stringify(info, null, 2) + "\n");
console.log(JSON.stringify(info, null, 2));
