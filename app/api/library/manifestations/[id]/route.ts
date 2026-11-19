import { NextResponse } from "next/server";
import { audioType, deleteAudio, MAX_AUDIO_BYTES, storeAudio } from "@/lib/server/accounts";
import { cleanManifestation, deleteManifestation, isId, putManifestation } from "@/lib/server/libraryDb";
import { asOwner } from "@/lib/server/libraryRoute";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Create or replace. Multipart: `meta` (JSON manifestation), optional `audio`
 * (file), optional `removeAudio=1`. No audio field keeps the current recording.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send multipart form data." }, { status: 400 });
  }
  let meta: unknown;
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return NextResponse.json({ error: "Bad meta." }, { status: 400 });
  }
  const m = cleanManifestation(meta, id);
  if (!m) return NextResponse.json({ error: "A title and a script are needed." }, { status: 400 });
  const file = form.get("audio");
  if (file !== null && !(file instanceof Blob)) return NextResponse.json({ error: "Bad audio." }, { status: 400 });
  if (file && file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Recording too large." }, { status: 413 });
  // The type comes from the file's own bytes; the browser's label is ignored.
  const mime = file ? await audioType(file) : null;
  if (file && !mime) return NextResponse.json({ error: "Recording must be WAV or MP3." }, { status: 415 });

  return asOwner(req, async (db, profileId) => {
    const audio = file && mime ? await storeAudio(profileId, id, file, mime) : form.get("removeAudio") === "1" ? null : undefined;
    const stale = await putManifestation(db, profileId, m, audio);
    if (stale === null) {
      if (audio) await deleteAudio([audio.key]);
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    await deleteAudio(stale);
    return NextResponse.json({ ok: true, hasAudio: audio ? true : audio === null ? false : undefined });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  return asOwner(req, async (db, profileId) => {
    const keys = await deleteManifestation(db, profileId, id);
    if (keys === null) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await deleteAudio(keys);
    return NextResponse.json({ ok: true });
  });
}
