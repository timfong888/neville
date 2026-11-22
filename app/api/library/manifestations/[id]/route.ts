import { NextResponse } from "next/server";
import { audioType, currentUser, MAX_AUDIO_BYTES, purgeAudio, reserveAudioKey, storeAudio } from "@/lib/server/accounts";
import { getPool } from "@/lib/server/db";
import {
  addTombstones,
  audioUsage,
  clearTombstones,
  cleanManifestation,
  type Db,
  deleteManifestation,
  isId,
  MAX_ACCOUNT_AUDIO_BYTES,
  MAX_ACCOUNT_RECORDINGS,
  putManifestation,
  uploadRefusal,
} from "@/lib/server/libraryDb";
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

  // Upload first, outside any transaction, under a key already on record in
  // blob_tombstone; the save transaction then only writes rows. Uploading
  // needs a signed-in caller, so nobody else can fill storage or the record.
  let audio: { key: string; mime: string; bytes?: number } | null | undefined = form.get("removeAudio") === "1" ? null : undefined;
  let reserved: string | null = null;
  if (file && mime) {
    const user = await currentUser(req);
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    // Checked before anything is stored, and again inside the save under the profile lock.
    const refusal = await uploadRefusal(getPool() as unknown as Db, user.id, file.size, id);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 413 });
    reserved = await reserveAudioKey(user.id, mime);
    try {
      audio = { ...(await storeAudio(reserved, file, mime)), bytes: file.size };
    } catch (e) {
      await purgeAudio([reserved]).catch(() => undefined);
      throw e;
    }
  }

  let purge: string[] = [];
  try {
    const res = await asOwner(req, async (db, profileId) => {
      const stale = await putManifestation(db, profileId, m, audio);
      if (stale === null) {
        // Not this caller's id: the upload stays on record and is removed below.
        if (reserved) purge = [reserved];
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (reserved) {
        // ensureProfile locked the profile row, so concurrent saves are serialized here.
        const used = await audioUsage(db, profileId);
        if (used.bytes > MAX_ACCOUNT_AUDIO_BYTES || used.count > MAX_ACCOUNT_RECORDINGS) throw new QuotaExceeded();
      }
      // The new file is now referenced by a row; the replaced ones are not.
      if (reserved) await clearTombstones(db, [reserved]);
      purge = stale;
      await addTombstones(db, stale);
      return NextResponse.json({ ok: true });
    });
    if (res.status !== 200 && reserved && !purge.length) purge = [reserved];
    await purgeAudio(purge);
    return res;
  } catch (e) {
    // Rolled back: the reserved key is still on record, so this or a later sweep removes it.
    if (reserved) await purgeAudio([reserved]).catch(() => undefined);
    if (e instanceof QuotaExceeded) {
      return NextResponse.json({ error: "Your account has reached its storage limit for recordings." }, { status: 413 });
    }
    throw e;
  }
}

class QuotaExceeded extends Error {}

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
