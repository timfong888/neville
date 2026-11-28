import { NextResponse } from "next/server";
import { DEFAULT_VOICE_ID, ENABLED_VOICES } from "@/lib/voices";

// The list of voices the app offers, keyed by their id.
// A Vercel deploy is enough to add, remove or change the default.
export async function GET() {
  return NextResponse.json({ voices: ENABLED_VOICES, default: DEFAULT_VOICE_ID });
}
