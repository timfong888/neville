// Does a script fit the response limit once recorded? (#170)
//
//   npm run eval:audio
//
// Records scripts from evals/scripts-compare.snapshot.md with the default voice at each pace and
// reports seconds, bytes and whether the 4 MB response limit holds. Costs a few US cents.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { synthesize } = await import("@/lib/server/tts");
const { PACES, TONES, pauseFor, speedFor, MAX_AUDIO_BYTES } = await import("@/lib/delivery");
const { DEFAULT_VOICE_ID, ENABLED_VOICES } = await import("@/lib/voices");
const { default: limits } = await import("@/config/limits.json");

const KEY = process.env.OPENROUTER_API_KEY ?? "sk-or-proxy-injected";
const voice = ENABLED_VOICES.find((v) => v.id === DEFAULT_VOICE_ID)!;

/** New-setup scripts from the snapshot: the longest and a middle one by word count. */
function scripts(): string[][] {
  const md = readFileSync("evals/scripts-compare.snapshot.md", "utf8");
  const all = md
    .split(/\n(?=## new )/)
    .slice(1)
    .map((s) => s.split("\n").filter((l) => l.startsWith("> ")).map((l) => l.slice(2)));
  const by = [...all].sort((a, b) => a.join(" ").length - b.join(" ").length);
  return [by[by.length - 1], by[Math.floor(by.length / 2)]];
}

describe("recorded length (#170)", async () => {
  const tone = TONES[0];
  const rows: Array<{ pace: string; words: number; chars: number; sec: number; bytes: number; ok: boolean; why?: string }> = [];
  for (const lines of scripts()) {
    for (const pace of PACES.filter((p) => p.id === "slow" || p.id === "very-slow")) {
      const r = await synthesize({
        key: KEY, model: voice.model, voice: voice.voice, text: lines.join("\n\n"), lines,
        pauseMs: pauseFor(pace, tone), speed: speedFor(pace, tone), compact: true, timeoutMs: 90_000, atomic: voice.atomic === true,
      });
      const words = lines.join(" ").split(/\s+/).length;
      rows.push(r.ok
        ? { pace: pace.id, words, chars: lines.join(" ").length, sec: Math.round((r.audio.byteLength - 44) / 48_000), bytes: r.audio.byteLength, ok: true }
        : { pace: pace.id, words, chars: lines.join(" ").length, sec: 0, bytes: 0, ok: false, why: r.message });
    }
  }
  console.log(JSON.stringify(rows));
  it(`fits ${MAX_AUDIO_BYTES} bytes at every pace (maxScriptChars ${limits.maxScriptChars})`, () => {
    expect(rows.filter((r) => !r.ok), JSON.stringify(rows)).toEqual([]);
  });
});
