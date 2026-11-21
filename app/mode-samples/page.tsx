// The mode samples on one page. public/ serves the MP3s but never lists a folder (#55).
import type { Metadata } from "next";
import Link from "next/link";
import manifest from "@/public/mode-samples/manifest.json";

export const metadata: Metadata = { title: "Mode samples — Neville" };

type Sample = { id: string; mode: string; voiceId: string; file: string; seconds: number };
const BASE = "/mode-samples/";
const NOTE: Record<string, string> = {
  sleep: "Sleep: approved",
  calm: "Calm: approved",
  active: "Active: being reworked",
};

export default function ModeSamples() {
  const list = manifest.samples as Sample[];
  return (
    <>
      <h1>Mode samples</h1>
      <p className="lede">
        Short samples of each mode. Active is being reworked: <Link href="/mode-samples/active-candidates">pick a voice
        from the new candidates</Link>.
      </p>
      {list.map((s) => (
        <section key={s.id} className="card sample">
          <h2>{s.id}</h2>
          <p className="small muted">
            {NOTE[s.mode] ?? s.mode} · {s.voiceId.replace(/^gemini-/, "Gemini ")} · {Math.round(s.seconds)} s
          </p>
          <audio controls preload="none" src={BASE + s.file} style={{ width: "100%" }} />
        </section>
      ))}
    </>
  );
}
