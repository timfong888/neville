import { NextResponse } from "next/server";
import { listSpeechModels } from "@/lib/server/openrouter";

// Speech models, their prices and voices, straight from OpenRouter's public list.
export async function GET() {
  try {
    return NextResponse.json(await listSpeechModels());
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
