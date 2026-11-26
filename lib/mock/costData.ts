// SAMPLE DATA — not real. Used only by /admin/usage/mock.
// All users, models, amounts and dates are fabricated.

export type MockKind = "script" | "speech" | "image";

export type MockCall = {
  model: string;
  kind: MockKind;
  chars: number;
  estUsd: number;
  ok: boolean;
};

export type MockRecording = {
  id: string;
  userId: string;
  title: string;
  at: number; // ms since epoch
  calls: MockCall[];
};

export type MockUser = {
  id: string;
  name: string;
  email: string;
};

export type MockCreditPurchase = {
  at: number;
  userId: string;
  amountUsd: number;
};

export type MockData = {
  users: MockUser[];
  recordings: MockRecording[];
  credits: MockCreditPurchase[];
};

export const MOCK_USERS: MockUser[] = [
  { id: "u1", name: "Alice Chen", email: "alice@example.com" },
  { id: "u2", name: "Bob Smith", email: "bob@example.com" },
  { id: "u3", name: "Carol Davis", email: "carol@example.com" },
  { id: "u4", name: "David Kim", email: "david@example.com" },
  { id: "u5", name: "Emma Wilson", email: "emma@example.com" },
];

const SCRIPT_MODELS = ["anthropic/claude-sonnet-5.5", "x-ai/grok-4.6", "anthropic/claude-haiku-5"];
const SPEECH_MODELS = ["elevenlabs/eleven-turbo-v2", "openai/tts-1-hd"];
const IMAGE_MODELS = ["stability/sdxl-turbo", "openai/dall-e-3"];

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function buildMockData(): MockData {
  const rng = seeded(0xdeadbeef);
  const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const range = (lo: number, hi: number) => lo + rng() * (hi - lo);

  const recordings: MockRecording[] = [];
  const credits: MockCreditPurchase[] = [];

  const NOW = 1764115200000; // 2025-11-26 00:00 UTC (fixed so totals are deterministic)
  const DAY = 86_400_000;
  const titles = [
    "Morning affirmation",
    "Gratitude journal",
    "Evening reflection",
    "Goal visualisation",
    "Confidence boost",
    "Sleep meditation",
    "Focus session",
    "Abundance mindset",
    "Healing intention",
    "Joy practice",
  ];

  let recId = 1;
  for (let d = 0; d < 30; d++) {
    const dayStart = NOW - (29 - d) * DAY;
    const count = Math.floor(range(3, 14));
    for (let i = 0; i < count; i++) {
      const user = pick(MOCK_USERS);
      const at = dayStart + rng() * DAY;
      const scriptChars = Math.floor(range(200, 1200));
      const speechChars = Math.floor(range(150, 900));
      const hasImage = rng() > 0.6;
      const calls: MockCall[] = [
        {
          model: pick(SCRIPT_MODELS),
          kind: "script",
          chars: scriptChars,
          estUsd: scriptChars * 0.000003 + range(0.0005, 0.003),
          ok: rng() > 0.04,
        },
        {
          model: pick(SPEECH_MODELS),
          kind: "speech",
          chars: speechChars,
          estUsd: speechChars * 0.000016 + range(0.0005, 0.002),
          ok: rng() > 0.04,
        },
      ];
      if (hasImage) {
        const imgChars = Math.floor(range(50, 300));
        calls.push({
          model: pick(IMAGE_MODELS),
          kind: "image",
          chars: imgChars,
          estUsd: range(0.004, 0.02),
          ok: rng() > 0.04,
        });
      }
      recordings.push({
        id: `rec-${recId++}`,
        userId: user.id,
        title: pick(titles),
        at,
        calls,
      });
    }

    // Credit purchases: roughly every 5 days per 1-2 users
    if (rng() > 0.6) {
      credits.push({
        at: dayStart + rng() * DAY,
        userId: pick(MOCK_USERS).id,
        amountUsd: pick([5, 10, 20, 50]),
      });
    }
  }

  return { users: MOCK_USERS, recordings, credits };
}

export const MOCK_DATA: MockData = buildMockData();

// --- Aggregation helpers used by the dashboard and tests ---

const MS = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
} as const;

export type Range = keyof typeof MS;
export const RANGES: Range[] = ["24h", "7d", "30d"];

export const NOW_MS = 1764115200000 + 86_400_000; // one day after last data point

export function recordingsInRange(range: Range): MockRecording[] {
  const cutoff = NOW_MS - MS[range];
  return MOCK_DATA.recordings.filter((r) => r.at >= cutoff);
}

export type DayBucket = {
  date: string; // "YYYY-MM-DD"
  script: number;
  speech: number;
  image: number;
  total: number;
};

export function spendPerDay(range: Range): DayBucket[] {
  const recs = recordingsInRange(range);
  const map = new Map<string, DayBucket>();
  for (const rec of recs) {
    const date = new Date(rec.at).toISOString().slice(0, 10);
    if (!map.has(date)) map.set(date, { date, script: 0, speech: 0, image: 0, total: 0 });
    const b = map.get(date)!;
    for (const c of rec.calls) {
      b[c.kind] += c.estUsd;
      b.total += c.estUsd;
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

export type RevCostDay = {
  date: string;
  revenue: number;
  cost: number;
};

export function revenueVsCost(range: Range): RevCostDay[] {
  const cutoff = NOW_MS - MS[range];
  const costMap = new Map<string, number>();
  for (const rec of MOCK_DATA.recordings.filter((r) => r.at >= cutoff)) {
    const date = new Date(rec.at).toISOString().slice(0, 10);
    const cost = rec.calls.reduce((s, c) => s + c.estUsd, 0);
    costMap.set(date, (costMap.get(date) ?? 0) + cost);
  }
  const revMap = new Map<string, number>();
  for (const cr of MOCK_DATA.credits.filter((c) => c.at >= cutoff)) {
    const date = new Date(cr.at).toISOString().slice(0, 10);
    revMap.set(date, (revMap.get(date) ?? 0) + cr.amountUsd);
  }
  const dates = new Set([...costMap.keys(), ...revMap.keys()]);
  return [...dates]
    .sort()
    .map((date) => ({ date, revenue: revMap.get(date) ?? 0, cost: costMap.get(date) ?? 0 }));
}

export type UserCost = {
  userId: string;
  name: string;
  totalUsd: number;
  recordings: number;
};

export function topUsers(range: Range): UserCost[] {
  const recs = recordingsInRange(range);
  const map = new Map<string, { totalUsd: number; recordings: number }>();
  for (const rec of recs) {
    const cost = rec.calls.reduce((s, c) => s + c.estUsd, 0);
    const e = map.get(rec.userId) ?? { totalUsd: 0, recordings: 0 };
    e.totalUsd += cost;
    e.recordings += 1;
    map.set(rec.userId, e);
  }
  const userMap = new Map(MOCK_DATA.users.map((u) => [u.id, u]));
  return [...map.entries()]
    .map(([userId, v]) => ({ userId, name: userMap.get(userId)?.name ?? userId, ...v }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

export type CreditSummary = {
  bought: number;
  spent: number;
  outstanding: number;
};

export function creditSummary(): CreditSummary {
  const bought = MOCK_DATA.credits.reduce((s, c) => s + c.amountUsd, 0);
  const spent = MOCK_DATA.recordings.reduce(
    (s, r) => s + r.calls.reduce((cs, c) => cs + c.estUsd, 0),
    0,
  );
  return { bought, spent, outstanding: Math.max(0, bought - spent) };
}

export type CostPerRecording = {
  avg: number;
  trend: number; // positive = more expensive than prior period
  sparkline: number[]; // daily avg cost for the last 7 data points
};

export function costPerRecording(range: Range): CostPerRecording {
  const recs = recordingsInRange(range);
  const avg =
    recs.length === 0
      ? 0
      : recs.reduce((s, r) => s + r.calls.reduce((cs, c) => cs + c.estUsd, 0), 0) / recs.length;

  // Compare to prior same-length period
  const ms = MS[range];
  const prevCutoff = NOW_MS - 2 * ms;
  const prevRecs = MOCK_DATA.recordings.filter((r) => r.at >= prevCutoff && r.at < NOW_MS - ms);
  const prevAvg =
    prevRecs.length === 0
      ? 0
      : prevRecs.reduce((s, r) => s + r.calls.reduce((cs, c) => cs + c.estUsd, 0), 0) / prevRecs.length;

  const trend = avg - prevAvg;

  // Sparkline: last 7 calendar days within range
  const spark7 = spendPerDay("7d").map((d) => {
    const dayRecs = recs.filter((r) => r.at.toString().startsWith("") && new Date(r.at).toISOString().slice(0, 10) === d.date);
    if (dayRecs.length === 0) return 0;
    return dayRecs.reduce((s, r) => s + r.calls.reduce((cs, c) => cs + c.estUsd, 0), 0) / dayRecs.length;
  });

  return { avg, trend, sparkline: spark7 };
}

export type ModelSpend = {
  model: string;
  kind: MockKind;
  totalUsd: number;
};

export function spendByModel(range: Range): ModelSpend[] {
  const recs = recordingsInRange(range);
  const map = new Map<string, { kind: MockKind; totalUsd: number }>();
  for (const rec of recs) {
    for (const c of rec.calls) {
      const existing = map.get(c.model) ?? { kind: c.kind, totalUsd: 0 };
      existing.totalUsd += c.estUsd;
      map.set(c.model, existing);
    }
  }
  return [...map.entries()]
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}
