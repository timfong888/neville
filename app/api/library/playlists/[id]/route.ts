import { NextResponse } from "next/server";
import type { Playlist } from "@/lib/library/model";
import { deletePlaylist, isId, putPlaylist } from "@/lib/server/libraryDb";
import { asOwner } from "@/lib/server/libraryRoute";
import { sameSiteRequest } from "@/lib/server/origin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  // Same order as the manifestation route: the Origin check comes before the body is read.
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Partial<Playlist> | null;
  if (!body || typeof body.name !== "string" || !Array.isArray(body.itemIds)) {
    return NextResponse.json({ error: "Send a playlist." }, { status: 400 });
  }
  const p: Playlist = {
    id,
    name: body.name,
    itemIds: body.itemIds.filter((x): x is string => typeof x === "string"),
    createdAt:
      typeof body.createdAt === "number" && Number.isFinite(body.createdAt) && body.createdAt > 0 && body.createdAt <= Date.now() + 60_000
        ? body.createdAt
        : Date.now(),
    updatedAt: Date.now(),
  };
  return asOwner(req, async (db, profileId) =>
    (await putPlaylist(db, profileId, p))
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found." }, { status: 404 }),
  );
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  return asOwner(req, async (db, profileId) =>
    (await deletePlaylist(db, profileId, id))
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found." }, { status: 404 }),
  );
}
