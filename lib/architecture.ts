// Single source for the numbers shown on /architecture and in the demo's cost meter.
// Keep in step with docs/specs/architecture.md.

/** Free creations before the sign-up gate in the prototype (variations count). */
export const FREE_ANON_GENERATIONS = 2;

/** Per-call prices behind the demo's cost meter (USD): cheap voice tier, one image. */
export const DEMO_UNIT_COST = {
  script: 0.0035,
  ttsPer1kChars: 0.00062,
  image: 0.008,
};

export const STACK: Array<[string, string, string]> = [
  ["Web app and API", "Next.js on Vercel Pro", "Route handlers are the whole backend. The Expo app reuses them later."],
  ["Database", "Neon Postgres, via Vercel Marketplace", "Plain SQL, on the Vercel invoice, portable."],
  ["Files", "Vercel Blob", "Same bill. Audio is stored once and replayed free."],
  ["Script, voice, images", "OpenRouter", "The model router: swap voice models by changing an id. Prepaid."],
  ["Auth", "Better Auth, Google sign-in", "No extra vendor. Users live in our database."],
  ["Bots and rate limits", "Vercel BotID + Postgres counters", "No extra vendor."],
  ["Payments", "Stripe Checkout", "Fees come out of revenue."],
  ["Music", "Static loops, mixed on the device", "Zero marginal cost."],
];

export const COST_ROWS: Array<{ label: string; v: [string, string, string]; total?: boolean }> = [
  { label: "Vercel Pro", v: ["$20.00", "$20.00", "$20.00"] },
  { label: "Neon Postgres", v: ["$5.00", "$5.00", "$19.00"] },
  { label: "Vercel Blob", v: ["$0.10", "$0.95", "$9.45"] },
  { label: "Scripts", v: ["$0.60", "$5.95", "$59.50"] },
  { label: "Images", v: ["$1.28", "$12.80", "$128.00"] },
  { label: "Voice, cheap tier", v: ["$0.19", "$1.90", "$18.97"] },
  { label: "Voice, mid tier", v: ["$4.59", "$45.90", "$459.00"] },
  { label: "OpenRouter fee, 5.5%", v: ["$0.11–0.36", "$1.14–3.56", "$11–36"] },
  { label: "Total, cheap voice", v: ["$27", "$48", "$266"], total: true },
  { label: "Total, mid voice", v: ["$32", "$94", "$731"], total: true },
  { label: "Total, premium voice", v: ["$53", "$304", "$2,829"] },
];

export const VOICE_TIERS: Array<[string, string, string, string]> = [
  ["Cheap", "Kokoro 82M", "$0.62", "$0.001"],
  ["Mid", "Grok Voice, AssemblyAI, MAI-Voice", "≈ $15", "$0.027"],
  ["Premium", "ElevenLabs v4", "$40–80", "$0.07–0.14"],
];

export const GUARDRAILS_APP: Array<[string, string]> = [
  ["Per-user allowance", "Each account has a monthly allowance of voice characters and images. A generation is refused when it is spent. Premium voices use it up faster."],
  ["Retries are free", "Every generation has a key; a retry returns the same job instead of paying twice."],
  ["Length caps", "280 characters in. Script length capped by plan."],
  ["Anonymous budget", "1 real generation per visitor on the cheapest voice, no image, behind a bot check, a per-IP limit and a $1-a-day global budget. When it is spent, visitors get a library manifestation, not an error."],
  ["Free accounts: cheap voice only", "Studio voices need a subscription, so fake sign-ups cost a fraction of a cent."],
  ["Kill switch", "One setting turns generation off. Playback, sign-in and payments keep working."],
  ["Usage ledger and alerts", "Every model call records its cost. Email at 50% and 75% of the monthly budget."],
];

export const GUARDRAILS_VENDOR: Array<[string, string, string]> = [
  ["OpenRouter", "Prepaid credits, auto top-up off. Two keys with monthly limits: anonymous ($30) and members.", "Requests fail. Anonymous abuse cannot touch paying users."],
  ["Vercel", "Spend Management: notify at $30, pause at $60.", "Site pauses. Last resort, not instant."],
  ["Neon", "Compute and storage limits.", "Database suspends."],
];

export const REJECTED: Array<{ name: string; bills: string; at100: string; why: string }> = [
  {
    name: "Vercel + Convex + OpenRouter + R2",
    bills: "5 vendors, 4 bills",
    at100: "$42–89",
    why: "Works, and gives live job status and a client that runs unchanged in Expo. But it has a proprietary data model with no SQL, and its own costing shows R2 is not needed. Expo works fine over a plain HTTP API, so Convex buys convenience, not capability.",
  },
  {
    name: "Cloudflare Workers + D1 + R2, frontend on Vercel",
    bills: "4 vendors, 4 bills",
    at100: "$31–77",
    why: "Cheapest floor and free audio egress. But Cloudflare's own voices are too flat or too expensive, so voice still goes to OpenRouter and “one bill” fails. Split deployment across two platforms.",
  },
];

export const DEMO_FLOW: string[] = [
  "Visitor lands, sees one text box, an optional first name and a button. No sign-up.",
  "They type what they want and tap Create.",
  "Server checks: bot check, per-IP limit, daily anonymous budget. If the budget is spent, serve a library manifestation.",
  "Script model writes about 8 lines in “You” statements with their first name. About $0.002.",
  "Cheapest voice model reads it. Audio is stored once. About $0.0005.",
  "Player opens: tap play, lines appear as spoken, optional music.",
  "New variation, save, or choose a voice → sign-up. The first manifestation is already in the new account.",
  "Images, studio voices, unlimited variations → paywall.",
];

export const TABLES: Array<[string, string]> = [
  ["profile", "A person, or an anonymous device before sign-up. First name, plan."],
  ["manifestation", "Title, what the user typed, library flag, revocable share slug."],
  ["rendition", "One script and its audio. Variations are extra renditions."],
  ["image", "Generated images for a manifestation."],
  ["job", "One row per generation request, with an idempotency key."],
  ["usage", "Every model call and what it cost. The cost dashboard is a query on this."],
  ["allowance", "Monthly voice characters and images left, per profile."],
  ["entitlement", "Who has paid, per provider: Stripe now, Apple and Google later."],
  ["rate_limit, setting", "Counters, kill switch, daily budgets, default models."],
];
