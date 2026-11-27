// Temporary dev route: benchmarks every OpenRouter TTS model with one test line.
// Gate: TTS_BENCH=1 env flag AND signed-in unlimited (tester) account.
// Never set TTS_BENCH=1 in production.
// Hard cost cap: $1 total. Never logs the test line or any audio.
import { NextResponse } from "next/server";
import { OPENROUTER, apiKey, listSpeechModels } from "@/lib/server/openrouter";
import { currentUser } from "@/lib/server/accounts";
import { isUnlimited } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COST_CAP_USD = 1.0;
const PER_MODEL_TIMEOUT_MS = 30_000;

// A short adult-affirmation sentence for consenting adults.
// No minors, no real people. Never echoed back or stored.
const TEST_LINE =
  "I am a confident adult who fully owns my desires and embraces pleasure with intention and consent.";

export type ModelResult = {
  model: string;
  voice: string;
  outcome: "ok" | "refused" | "error";
  httpStatus: number;
  bytes: number | null;
  latencyMs: number;
  estCostUsd: number | null;
};

export async function GET(req: Request) {
  if (process.env.TTS_BENCH !== "1") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const key = apiKey();
  if (!key) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not set." }, { status: 503 });
  }

  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    user = await currentUser(req);
  } catch {
    user = null;
  }
  if (!user || !isUnlimited(user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { models } = await listSpeechModels();

  const results: ModelResult[] = [];
  let totalCostUsd = 0;
  let cappedAt: number | null = null;

  for (const m of models) {
    if (totalCostUsd >= COST_CAP_USD) {
      cappedAt = COST_CAP_USD;
      break;
    }

    const voice = m.voices[0] ?? "";
    const t0 = Date.now();
    let httpStatus = 0;
    let bytes: number | null = null;
    let outcome: ModelResult["outcome"] = "error";

    try {
      const res = await fetch(`${OPENROUTER}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "Neville",
        },
        body: JSON.stringify({
          model: m.id,
          ...(voice ? { voice } : {}),
          input: TEST_LINE,
          response_format: "mp3",
        }),
        signal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
      });
      httpStatus = res.status;
      if (res.ok) {
        const buf = await res.arrayBuffer();
        bytes = buf.byteLength;
        outcome = "ok";
        // Discard audio immediately — never log or return it.
      } else if (res.status === 400 || res.status === 403 || res.status === 422) {
        outcome = "refused";
      } else {
        outcome = "error";
      }
    } catch {
      httpStatus = 0;
      outcome = "error";
    }

    const latencyMs = Date.now() - t0;
    const estCostUsd =
      m.usdPerMChars !== null ? (TEST_LINE.length * m.usdPerMChars) / 1e6 : null;

    if (estCostUsd !== null && estCostUsd > 0) totalCostUsd += estCostUsd;

    results.push({ model: m.id, voice, outcome, httpStatus, bytes, latencyMs, estCostUsd });
  }

  return NextResponse.json({ results, totalCostUsd, cappedAt });
}
