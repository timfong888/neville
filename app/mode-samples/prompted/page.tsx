// Prompted-voice experiments (#45): the same Active text, shaped by a style
// prompt or by a voice designed from a description. Each prompt is shown.
import type { Metadata } from "next";
import Link from "next/link";
import manifest from "@/public/mode-samples/prompted/manifest.json";

export const metadata: Metadata = { title: "Prompted voices — Neville" };

type Sample = { letter: string; model: string; voice: string; note: string; prompt: string; file: string };
const BASE = "/mode-samples/prompted/";

export default function PromptedVoices() {
  const list = manifest.candidates as Sample[];
  return (
    <>
      <h1>Prompted voices</h1>
      <p className="lede">
        Same text as the <Link href="/mode-samples/active-candidates">Active candidates</Link>, over the same steady
        music. Compare each with candidate A (Charon with the coach prompt).
      </p>
      {list.map((s) => (
        <section key={s.letter} className="card sample">
          <h2>
            {s.letter} · {s.note}
          </h2>
          <audio controls preload="none" src={BASE + s.file} style={{ width: "100%" }} />
          <p className="small muted">
            {s.model}
            {s.voice ? ` · voice ${s.voice}` : " · no preset voice"}
          </p>
          <p className="small">
            <b>Prompt:</b> {s.prompt}
          </p>
        </section>
      ))}
    </>
  );
}
