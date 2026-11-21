// The Active voice candidates (#45) on one page, so a folder link plays them.
// public/ serves the MP3s but never lists a folder (#55).
import type { Metadata } from "next";
import Link from "next/link";
import manifest from "@/public/mode-samples/active-candidates/manifest.json";

export const metadata: Metadata = { title: "Active voice candidates — Neville" };

type Candidate = { letter: string; voice: string; note: string; file: string; seconds: number };
const BASE = "/mode-samples/active-candidates/";

export default function ActiveCandidates() {
  const list = manifest.candidates as Candidate[];
  return (
    <>
      <h1>Active voice candidates</h1>
      <p className="lede">
        The same short text in four voices over steady music. Pick the one that sounds most like a calm coach, by
        letter.
      </p>
      {list.map((c) => (
        <section key={c.letter} className="card sample">
          <h2>
            {c.letter} · {c.voice}
          </h2>
          <p className="small muted">{c.note}</p>
          <audio controls preload="none" src={BASE + c.file} style={{ width: "100%" }} />
        </section>
      ))}
      <p className="small muted">
        Other mode samples: <Link href="/mode-samples">Sleep, Calm and the first Active samples</Link>.
      </p>
    </>
  );
}
