import { NextResponse } from "next/server";
import { readAudio } from "@/lib/server/accounts";
import { getAudio, isId } from "@/lib/server/libraryDb";
import { asOwner } from "@/lib/server/libraryRoute";

export const dynamic = "force-dynamic";

/** Streams the owner's recording. The storage URL never reaches the browser. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  return asOwner(req, async (db, profileId) => {
    const a = await getAudio(db, profileId, id);
    const stream = a && (await readAudio(a.key));
    if (!a || !stream) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return new Response(stream, { headers: { "Content-Type": a.mime, "Cache-Control": "private, no-store" } });
  });
}
