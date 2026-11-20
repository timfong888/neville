import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlaylistPlayer from "@/app/components/PlaylistPlayer";
import type { Manifestation } from "@/lib/library/model";
import { dbConfigured, getPool } from "@/lib/server/db";
import { getShare } from "@/lib/server/shareDb";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!dbConfigured()) return null;
  try {
    return await getShare(getPool(), id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await load((await params).id);
  // Shared pages are public but not for search engines.
  return { title: s ? `${s.title} — Neville` : "Not found — Neville", robots: { index: false, follow: false } };
}

// A shared manifestation, readable signed out. Read by the visitor's own
// device voice: no paid call is made when someone opens a link.
export default async function SharedPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await load((await params).id);
  if (!s) notFound();
  const item: Manifestation = {
    id: `share-${s.id}`,
    title: s.title,
    want: "",
    firstName: "",
    lines: s.lines,
    voiceId: "",
    voiceName: s.voiceName,
    hasAudio: false,
    createdAt: s.createdAt,
    updatedAt: s.createdAt,
  };
  return (
    <>
      <p className="small muted">Shared with you</p>
      <h1>{s.title}</h1>
      <div className="card">
        <PlaylistPlayer items={[item]} />
      </div>
      <ol className="script">
        {s.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      <p className="small muted">Read by your device&apos;s own voice.</p>
      <Link className="btn primary" href="/">
        Make your own
      </Link>
    </>
  );
}
