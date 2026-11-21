// Records prompted-voice experiments for Tim (#45): the same Active text as the
// candidates, with a different style prompt or a voice designed from a
// description, over the same steady Rise bed. Each prompt is kept in the manifest.
//
//   node scripts/record-prompted-voices.mjs [--dry] [--only=P2]
//
// Calls OpenRouter directly (the key comes from OPENROUTER_API_KEY or the
// session proxy). Needs ffmpeg. Stops before spending past $0.50.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const KEY = process.env.OPENROUTER_API_KEY ?? "proxy-injected";
const BUDGET = 0.5;
const OUT = "public/mode-samples/prompted";

const TEXT = [
  "Breathe in, Tim. Feel your feet on the ground.",
  "You are building work you love, one step at a time.",
  "You know what to do next, and you do it.",
  "Your body is strong. Your mind is clear.",
  "Every step today moves you forward.",
  "You have done hard things before. You can do this.",
  "Keep going. And so it is.",
].join("\n");

const INTIMATE =
  "Speak slower, warmer and more intimate, as if sitting beside one person late in the evening: close to the " +
  "microphone, soft and low, unhurried, a gentle smile in the voice. Let each line settle before the next.";
const MORNING_COACH =
  "Speak like a confident running coach beside one person on a morning run: grounded and encouraging, steady " +
  "breath, a little brisk, sure of every word, never salesy and never shouting.";
const DESIGNED =
  "A warm, grounded man in his forties with a low, slightly husky voice. He speaks calmly and confidently, " +
  "like a trusted coach, close to the microphone, in a quiet room. No music, no sound effects.";

// Tim asked for husky, older and experienced (#45). Qualities only: no real person is named or imitated.
const GRAVELLY =
  "A deep, gravelly, raspy baritone. An older man in his early sixties with a worn, husky texture from decades " +
  "of speaking to large crowds. Big chest resonance, slow and deliberate, with intense, warm conviction. Powerful " +
  "but not shouting. Leans into key words, pauses with purpose, sounds like a seasoned coach who has seen it all.";
const GRAVELLY_LOW = GRAVELLY + " Even more rasp and audible breath in the voice, and a lower pitch.";
const GRAVELLY_DRIVE = GRAVELLY + " More energy and drive: a peak-moment pep talk, urgent and building, still never shouting.";

const CANDIDATES = [
  { letter: "P1", model: "google/gemini-3.8-flash-lite-tts", voice: "Charon", prompt: INTIMATE, note: "Charon, slower, warmer, intimate" },
  { letter: "P2", model: "google/gemini-3.8-flash-lite-tts", voice: "Charon", prompt: MORNING_COACH, note: "Charon, confident morning-run coach" },
  { letter: "P3", model: "google/gemini-3.8-flash-tts", voice: "Charon", prompt: INTIMATE, note: "Charon on Gemini's higher 'creative' tier, intimate prompt" },
  { letter: "P4", model: "bytedance-seed/seed-audio-1-0", voice: "", prompt: DESIGNED, note: "A new voice designed from a description (ByteDance Seed Audio)" },
  { letter: "P5", model: "bytedance-seed/seed-audio-1-0", voice: "", prompt: GRAVELLY, note: "Designed voice: gravelly, older, experienced coach" },
  { letter: "P6", model: "bytedance-seed/seed-audio-1-0", voice: "", prompt: GRAVELLY_LOW, note: "Designed voice: as P5, more rasp and breath, lower" },
  { letter: "P7", model: "bytedance-seed/seed-audio-1-0", voice: "", prompt: GRAVELLY_DRIVE, note: "Designed voice: as P5, more energy and drive" },
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
  console.log(JSON.stringify({ TEXT, CANDIDATES, MUSIC_DB }, null, 2));
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
      input: TEXT,
      ...(c.voice ? { voice: c.voice } : {}),
      instructions: c.prompt,
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
const total = (await usage()) - start;
rows.sort((a, b) => a.letter.localeCompare(b.letter));
writeFileSync(
  `${OUT}/manifest.json`,
  JSON.stringify({ recordedAt: new Date().toISOString(), issue: 45, text: TEXT, musicDb: MUSIC_DB, ducking: "none", totalCostUsd: +total.toFixed(5), candidates: rows }, null, 2),
);
console.log(`Spent $${total.toFixed(4)} on ${rows.length} candidates.`);
