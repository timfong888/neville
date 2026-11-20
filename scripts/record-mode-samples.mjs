// Records short samples of each mode for the pull request: the voice through
// this app's own /api/manifest with the mode's pace and tone, then mixed with
// the mode's music at the mode's volume, dipping under the voice.
//
//   OPENROUTER_API_KEY=... npm start                (the key stays on the server)
//   OPENROUTER_API_KEY=... node scripts/record-mode-samples.mjs [--dry]
//
// Needs ffmpeg. Stops before spending past SAMPLE_BUDGET_USD (default 0.25) and
// writes public/mode-samples/manifest.json with what each clip cost.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const KEY = process.env.OPENROUTER_API_KEY;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const BUDGET = Number(process.env.SAMPLE_BUDGET_USD ?? "0.25");
const DRY = process.argv.includes("--dry");
// --remix: mix again from the saved voice-only files after a music or level change. Costs nothing.
const REMIX = process.argv.includes("--remix");
const OUT = "public/mode-samples";

// Mirrors lib/modes.ts and lib/music.ts (kept here so the script runs without a build).
const MODES = {
  calm: { pace: "slow", tone: "calm", music: "morning-light", volume: 0.6, fadeIn: 2 },
  sleep: { pace: "very-slow", tone: "sleep", music: "night-tide", volume: 0.45, fadeIn: 8 },
  active: { pace: "brisk", tone: "energetic", music: "rise", volume: 0.8, fadeIn: 1 },
};
const musicDb = (v) => (v === 0 ? -120 : -8 - (1 - v) * 24);

const SAMPLES = [
  { id: "sleep-1", mode: "sleep", voiceId: "gemini-vindemiatrix", wish: "to feel safe and rested, and to sleep deeply", name: "Tim" },
  { id: "sleep-2", mode: "sleep", voiceId: "gemini-achernar", wish: "a body that heals and renews itself while I sleep", name: "Tim" },
  { id: "active-1", mode: "active", voiceId: "gemini-kore", wish: "to run my own business doing work I love", name: "Tim" },
  { id: "active-2", mode: "active", voiceId: "gemini-algieba", wish: "a healthy, strong body that I enjoy living in", name: "Tim" },
  { id: "calm-1", mode: "calm", voiceId: "gemini-sulafat", wish: "I want to be calm and confident when I speak", name: "Tim" },
];

const usage = async () => {
  const r = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`cannot read key usage: ${r.status}`);
  return (await r.json()).data.usage;
};

function ffmpeg(args, input) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return r.stdout;
}

/** Voice over the mode's music: music from its loop start, faded in, ducked under speech, faded out at the end. */
function mix(voiceWav, s, keepVoiceOnly = false) {
  const m = MODES[s.mode];
  const voiceFile = `${OUT}/${s.id}-voice.wav`;
  writeFileSync(voiceFile, voiceWav);
  const lead = Math.min(4, m.fadeIn); // music alone before the voice comes in
  const graph =
    `[1:a]volume=${musicDb(m.volume)}dB,afade=t=in:d=${m.fadeIn}[m];` +
    `[0:a]adelay=${lead * 1000}|${lead * 1000},apad=pad_dur=4,aformat=channel_layouts=stereo,asplit=2[v][sc];` +
    `[m][sc]sidechaincompress=threshold=0.004:ratio=8:attack=80:release=500[md];` +
    `[v][md]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=0:d=0[x]`;
  // Fade the end: find the length first.
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voiceFile]).stdout.toString()) + lead + 4;
  ffmpeg([
    "-i", voiceFile,
    "-stream_loop", "-1", "-ss", "1", "-i", `public/music/${m.music}.mp3`,
    "-filter_complex", graph.replace("afade=t=out:st=0:d=0", `afade=t=out:st=${(dur - 3).toFixed(2)}:d=3`),
    "-map", "[x]", "-t", dur.toFixed(2), "-codec:a", "libmp3lame", "-b:a", "96k", `${OUT}/${s.id}.mp3`,
  ]);
  if (!keepVoiceOnly) ffmpeg(["-i", voiceFile, "-codec:a", "libmp3lame", "-b:a", "64k", `${OUT}/${s.id}-voice-only.mp3`]);
  spawnSync("rm", [voiceFile]);
  return dur;
}

if (DRY) {
  console.log(JSON.stringify({ app: APP, budgetUsd: BUDGET, samples: SAMPLES }, null, 2));
  process.exit(0);
}
if (REMIX) {
  const man = JSON.parse(readFileSync(`${OUT}/manifest.json`, "utf8"));
  for (const s of man.samples) {
    s.seconds = +mix(ffmpeg(["-i", `${OUT}/${s.voiceOnly}`, "-f", "wav", "pipe:1"]), s, true).toFixed(1);
    Object.assign(s, MODES[s.mode]);
  }
  man.remixedAt = new Date().toISOString();
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(man, null, 2));
  console.log(`Remixed ${man.samples.length} samples.`);
  process.exit(0);
}
if (!KEY) throw new Error("Set OPENROUTER_API_KEY (the server needs it too).");
mkdirSync(OUT, { recursive: true });
const start = await usage();
const rows = [];
for (const s of SAMPLES) {
  const before = await usage();
  if (before - start >= BUDGET) {
    console.log(`Budget of $${BUDGET} reached; stopping before ${s.id}.`);
    break;
  }
  const m = MODES[s.mode];
  const res = await fetch(`${APP}/api/manifest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ want: s.wish, name: s.name, voiceId: s.voiceId, pace: m.pace, tone: m.tone, variant: 0 }),
  });
  if (!res.ok) throw new Error(`${s.id}: ${res.status} ${await res.text()}`);
  const wav = Buffer.from(await res.arrayBuffer());
  const lines = JSON.parse(Buffer.from(res.headers.get("X-Script"), "base64").toString("utf8"));
  const seconds = mix(wav, s);
  const after = await usage();
  rows.push({
    ...s, ...m, file: `${s.id}.mp3`, voiceOnly: `${s.id}-voice-only.mp3`, seconds: +seconds.toFixed(1),
    script: lines, scriptSource: res.headers.get("X-Script-Source"),
    speedApplied: res.headers.get("X-Speed-Applied") === "1", pauseMs: Number(res.headers.get("X-Pause-Ms") ?? 0) || null,
    costUsd: +(after - before).toFixed(5),
  });
  console.log(`${s.id}: ${seconds.toFixed(0)} s, $${(after - before).toFixed(4)}, speedApplied=${res.headers.get("X-Speed-Applied")}`);
}
const total = (await usage()) - start;
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ recordedAt: new Date().toISOString(), totalCostUsd: +total.toFixed(5), samples: rows }, null, 2));
console.log(`Spent $${total.toFixed(4)} on ${rows.length} samples.`);
