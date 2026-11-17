const box = { fill: "#232748", stroke: "#3a3f6b", rx: 12 };
const t = { fill: "#f3ece0", fontSize: 15, fontWeight: 600 } as const;
const s = { fill: "#a8a6bd", fontSize: 12 } as const;
const arrow = { stroke: "#a9a4e6", strokeWidth: 1.6, fill: "none", markerEnd: "url(#a)" };

export default function Diagram() {
  return (
    <svg viewBox="0 0 900 470" role="img" aria-labelledby="dg-title dg-desc">
      <title id="dg-title">Neville architecture</title>
      <desc id="dg-desc">
        The browser talks to a Next.js app on Vercel. Vercel functions use Neon Postgres and
        Vercel Blob, which are on the Vercel bill, and call OpenRouter, which runs on prepaid
        credits. Stripe takes payments.
      </desc>
      <defs>
        <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#a9a4e6" />
        </marker>
      </defs>

      {/* Bill 1 */}
      <rect x="250" y="20" width="390" height="430" rx="18" fill="none" stroke="#e8b86d" strokeDasharray="6 6" />
      <text x="266" y="44" fill="#e8b86d" fontSize="12" fontWeight="600">
        BILL 1 · VERCEL · pause-at-budget
      </text>

      {/* Bill 2 */}
      <rect x="670" y="20" width="215" height="250" rx="18" fill="none" stroke="#8fd3a8" strokeDasharray="6 6" />
      <text x="686" y="44" fill="#8fd3a8" fontSize="12" fontWeight="600">
        BILL 2 · PREPAID · hard stop
      </text>

      {/* Client */}
      <rect x="15" y="150" width="200" height="120" {...box} />
      <text x="31" y="180" {...t}>Browser</text>
      <text x="31" y="202" {...s}>Next.js pages, audio player</text>
      <text x="31" y="220" {...s}>music loops mixed on device</text>
      <text x="31" y="248" {...s} fill="#a9a4e6">later: Expo app, same API</text>

      {/* Vercel functions */}
      <rect x="270" y="60" width="350" height="170" {...box} />
      <text x="286" y="88" {...t}>Next.js on Vercel</text>
      <text x="286" y="110" {...s}>Route handlers = the whole backend</text>
      <text x="286" y="136" {...s}>• /api/generate  (script → voice → image)</text>
      <text x="286" y="154" {...s}>• auth, share pages, Stripe webhook</text>
      <text x="286" y="180" {...s} fill="#f0a37a">Gate on every paid call: bot check →</text>
      <text x="286" y="198" {...s} fill="#f0a37a">rate limit → budget ledger → cache lookup</text>

      {/* Postgres */}
      <rect x="270" y="270" width="165" height="160" {...box} />
      <text x="286" y="298" {...t}>Neon Postgres</text>
      <text x="286" y="320" {...s}>users, manifestations,</text>
      <text x="286" y="338" {...s}>renditions, usage ledger,</text>
      <text x="286" y="356" {...s}>rate limits, subscriptions</text>
      <text x="286" y="390" {...s} fill="#a9a4e6">one database, plain SQL</text>

      {/* Blob */}
      <rect x="455" y="270" width="165" height="160" {...box} />
      <text x="471" y="298" {...t}>Vercel Blob</text>
      <text x="471" y="320" {...s}>audio (MP3), images</text>
      <text x="471" y="338" {...s}>stored once, replayed free</text>
      <text x="471" y="356" {...s}>keyed by content hash</text>
      <text x="471" y="390" {...s} fill="#a9a4e6">behind a storage interface</text>

      {/* OpenRouter */}
      <rect x="690" y="60" width="180" height="190" {...box} />
      <text x="706" y="88" {...t}>OpenRouter</text>
      <text x="706" y="110" {...s}>the model router</text>
      <text x="706" y="136" {...s}>• script LLM</text>
      <text x="706" y="154" {...s}>• voice (TTS) models</text>
      <text x="706" y="172" {...s}>• image models</text>
      <text x="706" y="204" {...s} fill="#8fd3a8">2 keys, each with a</text>
      <text x="706" y="222" {...s} fill="#8fd3a8">monthly limit; no auto top-up</text>

      {/* Stripe */}
      <rect x="690" y="300" width="180" height="100" {...box} />
      <text x="706" y="328" {...t}>Stripe</text>
      <text x="706" y="350" {...s}>Checkout + webhook</text>
      <text x="706" y="372" {...s}>fees come out of revenue</text>

      {/* Arrows */}
      <path d="M215 195 H268" {...arrow} />
      <path d="M352 230 V268" {...arrow} />
      <path d="M537 230 V268" {...arrow} />
      <path d="M620 130 H688" {...arrow} />
      <path d="M620 215 C655 215 650 345 688 345" {...arrow} />
      <path d="M455 440 C300 468 110 420 110 272" {...arrow} strokeDasharray="4 4" />
      <text x="120" y="440" {...s}>audio streams straight from storage</text>
    </svg>
  );
}
