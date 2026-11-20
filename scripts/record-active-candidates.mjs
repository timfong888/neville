// Records Active-mode voice candidates for Tim to compare (#45): the same text
// in each voice, over a steady Rise bed (no ducking, music level set once).
//
//   node scripts/record-active-candidates.mjs [--dry]
//
// Calls OpenRouter directly (the key comes from OPENROUTER_API_KEY or the
// session proxy). Needs ffmpeg. Stops before spending past $0.50.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const KEY = process.env.OPENROUTER_API_KEY ?? "proxy-injected";
const BUDGET = 0.5;
const OUT = "public/mode-samples/active-candidates";

const TEXT = [
  "Breathe in, Tim. Feel your feet on the ground.",
  "You are building work you love, one step at a time.",
  "You know what to do next, and you do it.",
  "Your body is strong. Your mind is clear.",
  "Every step today moves you forward.",
  "You have done hard things before. You can do this.",
  "Keep going. And so it is.",
].join("\n");

// The Active "energetic" style pushed Gemini into an announcer read. This asks for a coach instead.
const COACH =
  "Speak like a steady, quietly confident coach walking beside one person: grounded, warm, " +
  "low and even in pitch, at a natural conversational pace. No salesy lift, no announcer voice, " +
  "no smile in the voice, and do not stress single words. Let each line settle, with a short pause after it.";

const CANDIDATES = [
  { letter: "A", model: "google/gemini-3.8-flash-lite-tts", voice: "Charon", note: "Gemini Charon, low male voice, coach prompt" },
  { letter: "B", model: "google/gemini-3.8-flash-lite-tts", voice: "Gacrux", note: "Gemini Gacrux, mature female voice, coach prompt" },
  { letter: "C", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat", note: "Gemini Sulafat (already in the app), warm female voice, coach prompt" },
  { letter: "D", model: "hexgrad/kokoro-82m", voice: "am_michael", note: "Kokoro Michael, plain male voice, no style prompt (model already wired in)" },
];

// Rise sits about 13 dB under the voice the whole time: no dips, no pumping.
const MUSIC_DB = -12;

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

if (process.argv.includes("--dry")) {
  console.log(JSON.stringify({ TEXT, COACH, CANDIDATES, MUSIC_DB }, null, 2));
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
const start = await usage();
// --only=B re-records some letters and keeps the rest of the manifest.
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const kept = only && existsSync(`${OUT}/manifest.json`) ? JSON.parse(readFileSync(`${OUT}/manifest.json`, "utf8")) : null;
const rows = kept ? kept.candidates.filter((r) => !only.includes(r.letter)) : [];
for (const c of CANDIDATES.filter((x) => !only || only.includes(x.letter))) {
  // The usage counter lags, so this guard is coarse; a full run costs cents against the $0.50 cap.
  const before = await usage();
  if (before - start >= BUDGET) {
    console.log(`Budget reached; stopping before ${c.letter}.`);
    break;
  }
  const gemini = c.model.startsWith("google/gemini");
  const speak = () => fetch(`${API}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "Neville" },
    body: JSON.stringify({
      model: c.model,
      voice: c.voice,
      input: TEXT,
      ...(gemini ? { instructions: COACH } : {}),
      response_format: gemini ? "pcm" : "mp3",
    }),
  });
  // The TTS provider rate-limits bursts: wait and try again a few times.
  let res = await speak();
  for (const wait of [10, 30, 60]) {
    if (res.status !== 429) break;
    console.log(`${c.letter}: 429, retrying in ${wait} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await speak();
  }
  if (!res.ok) {
    console.log(`${c.letter} ${c.voice}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    // Keep the earlier recording's row, so the manifest still matches the file on disk.
    const prev = kept?.candidates.find((r) => r.letter === c.letter);
    if (prev) rows.push(prev);
    continue;
  }
  const audio = Buffer.from(await res.arrayBuffer());
  const rate = Number(/rate=(\d+)/.exec(res.headers.get("content-type") ?? "")?.[1]) || 24000;
  const input = gemini ? ["-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0"] : ["-i", "pipe:0"];
  // Voice to a steady speech loudness, like the app's normalisation.
  const voice = ffmpeg([...input, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "44100", "-f", "wav", "pipe:1"], audio);
  const voiceFile = `${OUT}/${c.letter}-voice.wav`;
  writeFileSync(voiceFile, voice);
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voiceFile]).stdout.toString()) + 3;
  ffmpeg([
    "-i", voiceFile,
    "-stream_loop", "-1", "-ss", "1", "-i", "public/music/rise.mp3",
    "-filter_complex",
    `[1:a]volume=${MUSIC_DB}dB,afade=t=in:d=1[m];` +
      `[0:a]adelay=1500|1500,apad=pad_dur=2,aformat=channel_layouts=stereo[v];` +
      `[v][m]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${(dur - 2).toFixed(2)}:d=2[x]`,
    "-map", "[x]", "-t", dur.toFixed(2), "-codec:a", "libmp3lame", "-b:a", "96k", `${OUT}/${c.letter}.mp3`,
  ]);
  spawnSync("rm", [voiceFile]);
  // No per-candidate cost: OpenRouter's usage counter updates late, so only the run total means anything.
  rows.push({ ...c, file: `${c.letter}.mp3`, seconds: +dur.toFixed(1) });
  console.log(`${c.letter} ${c.voice}: ${dur.toFixed(0)} s`);
}
const total = (await usage()) - start + (kept?.totalCostUsd ?? 0);
rows.sort((a, b) => a.letter.localeCompare(b.letter));
writeFileSync(
  `${OUT}/manifest.json`,
  JSON.stringify({ recordedAt: new Date().toISOString(), issue: 45, text: TEXT, style: COACH, musicDb: MUSIC_DB, ducking: "none", totalCostUsd: +total.toFixed(5), candidates: rows }, null, 2),
);
console.log(`Spent $${total.toFixed(4)} on ${rows.length} candidates.`);
