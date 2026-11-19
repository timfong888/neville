import { NextResponse } from "next/server";
import { audioType, MAX_AUDIO_BYTES, purgeAudio, reserveAudioKey, storeAudio } from "@/lib/server/accounts";
import { addTombstones, clearTombstones, cleanManifestation, deleteManifestation, isId, putManifestation } from "@/lib/server/libraryDb";
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

  // Keys to remove from Blob once the transaction has committed.
  let purge: string[] = [];
  let reserved: string | null = null;
  try {
    const res = await asOwner(req, async (db, profileId) => {
      let audio: { key: string; mime: string } | null | undefined = form.get("removeAudio") === "1" ? null : undefined;
      if (file && mime) {
        reserved = await reserveAudioKey(profileId, id, mime);
        audio = await storeAudio(reserved, file, mime);
      }
      const stale = await putManifestation(db, profileId, m, audio);
      if (stale === null) {
        // Not this caller's id: the upload stays recorded and is removed below.
        if (reserved) purge = [reserved];
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      // The new file is now referenced by a row; the replaced ones are not.
      if (reserved) await clearTombstones(db, [reserved]);
      purge = stale;
      await addTombstones(db, stale);
      return NextResponse.json({ ok: true });
    });
    await purgeAudio(purge);
    return res;
  } catch (e) {
    // Rolled back: the reserved key is still recorded, so this or a later sweep removes it.
    if (reserved) await purgeAudio([reserved]).catch(() => undefined);
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  let purge: string[] = [];
  const res = await asOwner(req, async (db, profileId) => {
    const keys = await deleteManifestation(db, profileId, id);
    if (keys === null) return NextResponse.json({ error: "Not found." }, { status: 404 });
    purge = keys;
    await addTombstones(db, keys);
    return NextResponse.json({ ok: true });
  });
  await purgeAudio(purge);
  return res;
}
