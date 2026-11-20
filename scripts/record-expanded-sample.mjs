// Makes one dev sample of the guided audio: a made-up one-line wish goes through
// /api/expand (text), then each part is recorded through /api/rerecord in Calm
// mode (the existing voice pipeline), joined with silences, and mixed with the
// Calm mode's music.
//
//   OPENROUTER_API_KEY=... npx next dev -p 3100        (the key stays on the server)
//   OPENROUTER_API_KEY=... APP_URL=http://localhost:3100 node scripts/record-expanded-sample.mjs
//
// Needs ffmpeg. Stops before spending past SAMPLE_BUDGET_USD (default 0.50).
// Writes public/expand-samples/<id>.{mp3,json}. The wish is made up; nothing here is a real person's.
import { spawnSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";

const KEY = process.env.OPENROUTER_API_KEY;
const APP = process.env.APP_URL ?? "http://localhost:3100";
const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const BUDGET = Number(process.env.SAMPLE_BUDGET_USD ?? "0.50");
const WISH = process.env.WISH ?? "I'm walking into my new home";
const ID = process.env.SAMPLE_ID ?? "new-home";
const VOICE = process.env.VOICE_ID ?? "gemini-sulafat"; // the Calm sample's voice
const OUT = "public/expand-samples";
// Calm mode, as in lib/modes.ts and lib/music.ts.
const CALM = { pace: "slow", tone: "calm", music: "morning-light", volume: 0.6, fadeIn: 2 };
const musicDb = (v) => -8 - (1 - v) * 24;

if (!KEY) throw new Error("Set OPENROUTER_API_KEY (the server needs it too).");
const usage = async () => (await (await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${KEY}` } })).json()).data.usage;
const start = await usage();
const spent = async () => (await usage()) - start;
const guard = async (what) => {
  if ((await spent()) >= BUDGET) throw new Error(`Budget of $${BUDGET} reached before ${what}.`);
};
const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  return r.stdout;
};
const post = async (path, body) => {
  const res = await fetch(`${APP}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res;
};

mkdirSync(OUT, { recursive: true });
await guard("the draft");
const draft = await (await post("/api/expand", { want: WISH, name: "", tone: CALM.tone })).json();
const afterText = await spent();
console.log(`draft: ${draft.settle.length}+${draft.scene.length}+${draft.closing.length} lines, holdAudio=${draft.holdAudio}, $${afterText.toFixed(4)}`);
if (draft.holdAudio) console.log("flags that hold audio:", draft.flags.filter((f) => f.kind !== "choice"));

// The pipeline returns one WAV of at most about 4 MB (about 83 s at 24 kHz), which is
// roughly 550 characters at Calm pace. So the script is recorded in pieces that each
// fit: settle, the scene in as many pieces as it needs, then the closing. Each piece
// goes to /api/rerecord, which vets it again, and the pieces are joined here.
const PIECE_CHARS = 540;
const pieces = [{ part: "settle", lines: draft.settle }];
let cur = [];
for (const l of draft.scene) {
  if (cur.length && cur.join(" ").length + l.length + 1 > PIECE_CHARS) {
    pieces.push({ part: "scene", lines: cur });
    cur = [];
  }
  cur.push(l);
}
pieces.push({ part: "scene", lines: cur }, { part: "closing", lines: draft.closing });
const files = [];
for (const [i, p] of pieces.entries()) {
  await guard(`piece ${i}`);
  const res = await post("/api/rerecord", { lines: p.lines, voiceId: VOICE, pace: CALM.pace, tone: CALM.tone });
  const f = `${OUT}/${ID}-${i}.wav`;
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  files.push(f);
  console.log(`${p.part} ${i + 1}/${pieces.length} (${p.lines.join(" ").length} chars): recorded, running total $${(await spent()).toFixed(4)}`);
}

// Silence between pieces: a long breath after the settle, the Calm line pause inside the
// scene, a short one before the closing.
const gaps = pieces.slice(1).map((p, i) => (pieces[i].part === "settle" ? 4 : p.part === "closing" ? 3 : 1.5));
const sil = (s) => `aevalsrc=0:d=${s}:s=24000:c=mono`;
const voiceFile = `${OUT}/${ID}-voice.wav`;
const order = files.flatMap((_, i) => (i < gaps.length ? [`[a${i}]`, `[s${i}]`] : [`[a${i}]`]));
ff([
  ...files.flatMap((f) => ["-i", f]),
  "-filter_complex",
  files.map((_, i) => `[${i}:a]aformat=sample_rates=24000:channel_layouts=mono[a${i}]`).join(";") +
    `;${gaps.map((g, i) => `${sil(g)}[s${i}]`).join(";")};${order.join("")}concat=n=${order.length}:v=0:a=1[voice]`,
  "-map", "[voice]", voiceFile,
]);
const voiceSeconds = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voiceFile]).stdout.toString());
const lead = CALM.fadeIn + 2;
const total = voiceSeconds + lead + 4;
ff([
  "-i", voiceFile, "-stream_loop", "-1", "-ss", "1", "-i", `public/music/${CALM.music}.mp3`,
  "-filter_complex",
  `[1:a]volume=${musicDb(CALM.volume)}dB,afade=t=in:d=${CALM.fadeIn}[m];` +
    `[0:a]adelay=${lead * 1000}|${lead * 1000},apad=pad_dur=4,aformat=channel_layouts=stereo,asplit=2[v][sc];` +
    `[m][sc]sidechaincompress=threshold=0.004:ratio=8:attack=80:release=500[md];` +
    `[v][md]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[x]`,
  "-map", "[x]", "-t", total.toFixed(2), "-codec:a", "libmp3lame", "-b:a", "96k", `${OUT}/${ID}.mp3`,
]);
ff(["-i", voiceFile, "-codec:a", "libmp3lame", "-b:a", "64k", `${OUT}/${ID}-voice-only.mp3`]);
for (const f of [voiceFile, ...files]) unlinkSync(f);

const cost = await spent();
writeFileSync(
  `${OUT}/${ID}.json`,
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      wish: WISH,
      mode: "calm",
      ...CALM,
      voiceId: VOICE,
      seconds: +total.toFixed(1),
      voiceSeconds: +voiceSeconds.toFixed(1),
      costUsd: +cost.toFixed(5),
      textCostUsd: +afterText.toFixed(5),
      draft,
    },
    null,
    2,
  ),
);
console.log(`Done: ${total.toFixed(0)} s, $${cost.toFixed(4)} (cap $${BUDGET}).`);
