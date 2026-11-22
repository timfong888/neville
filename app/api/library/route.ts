import { NextResponse } from "next/server";
import { loadLibrary } from "@/lib/server/libraryDb";
import { asOwner } from "@/lib/server/libraryRoute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return asOwner(req, async (db, profileId) =>
    NextResponse.json(await loadLibrary(db, profileId), { headers: { "Cache-Control": "no-store" } }),
  );
}
