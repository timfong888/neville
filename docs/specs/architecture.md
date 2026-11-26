# Neville architecture

> **Note, 2026-11-25.** The `/architecture` page on the website is gone (Tim: "You can drop the architecture page"); this document is the written record only. The page's content (diagram, stack, cost tables, guardrails) is kept as text in `architecture-site-page.md`, and its numbers stay in `lib/architecture.ts`. The original text below is the 2026-11-17 design; the corrections that follow say where it no longer matches what is built or what vendors charge. Corrected lines are marked **[corrected 2026-11-25]** in place.

## Corrections, 2026-11-25

Each fix, with how it was checked. "Code" means this repository on `main` at 83ad7c1. "OpenRouter" means its public model list read on 2026-11-25.

1. **Cheap voice price.** Kokoro 82M is $0.99 per 1M characters, not $0.62 (OpenRouter).
2. **Default voice.** The default is `gemini-sulafat` on `google/gemini-3.8-flash-lite-tts` (`config/voices.json`), priced by tokens ($0.50 per 1M text-in, $6 per 1M audio-out, OpenRouter), not per character. The cheap-voice and mid-voice monthly totals ($27, $48, $266 and $32, $94, $731) were built on per-character prices and are **not valid** for the default voice. A real figure needs audio-token counts per clip; the usage ledger (item 4) is where to measure it.
3. **Script models.** The writer uses Gemini 2.5 Flash Lite and similar small models at $0.10 in and $0.40 out per 1M tokens (OpenRouter; list in `config/limits.json`: Gemini 2.5 Flash Lite, GPT-4.1 nano, GPT-4o mini, Mistral Small 3.2, Llama 3.3 70B), not Claude Haiku at about $0.0035 a script. A script at those prices is a small fraction of a cent.
4. **Guardrails as built** (`config/limits.json`, `lib/limits.ts`, `lib/ledger.ts`, PR #26): a spend ceiling of $2 read from OpenRouter's own usage counter; at most 150 generations a day in total and 6 per visitor per day (counted in Upstash Redis when configured, otherwise in memory per instance); 280 characters in and 700 out; a kill switch (`generationEnabled`, `SPEECH_ENABLED`); alerts at 50%, 80% and 100% of the ceiling, to a webhook (`ALERT_WEBHOOK_URL`) or the log, not email. The usage ledger is `[ledger]` log lines plus the last 500 entries in memory per instance, not a Postgres table. **No bot check exists yet:** BotID is not in the code.
5. **Sign-in.** Apple-only is enough to turn accounts on; Google is optional and appears only when its two variables are set (#106, `lib/server/providers.ts`). The Expo section's "Sign in with Apple alongside Google" is now the other way round.
6. **Not built:** Stripe (nothing in the code) and the `entitlement` table (the paywall uses `credit_ledger` instead, correction 10). Neither are the `allowance`, `job`, `usage`, `image`, `rate_limit` or `setting` tables below. The tables that exist (`db/migrations/001_accounts_and_library.sql`) are `user`, `session`, `account`, `verification`, `profile`, `manifestation`, `rendition`, `playlist`, `playlist_item` and `blob_tombstone`.
7. **Blob transfer** is included in Vercel's flat rate, so there is no separate per-GB transfer line; only storage is a cost to watch. (Reported by the PRD steward from Vercel's pricing; not re-read here.)
8. **Neon** is on the Free plan today; a typical Launch plan bill is about $15 a month, not $5 to $19. (Reported by the PRD steward; the Neon API does not show the plan, so not independently checked here.)
9. **Web stack.** The client is `native/`, one React Native codebase for iOS and web, with Next.js as the API only; see `native-ios.md`.
10. **[2026-11-26, #168] Paywall as built:** credits in Postgres (`credit_ledger`, `config/credits.json`), bought through RevenueCat, switched by `PAYWALL_ENABLED` (default off). See Data model.

Status: proposed, 2026-11-17. Source of truth for product scope is the PRD (Google Doc "Neville"). This document starts fresh: nothing from the old Google project, FlutterFlow app, users or recordings is reused.

## Decision

**Next.js on Vercel, with Neon Postgres and Vercel Blob on the Vercel bill, and every AI call through OpenRouter on prepaid credits.** Stripe takes payments. There is no separate backend service.

| Concern | Choice | Why |
|---|---|---|
| Web app and API | Next.js on Vercel Pro. Route handlers are the whole backend. | One deploy, preview URL per PR, and the same HTTP API serves the Expo app later. |
| Database | Neon Postgres (Launch plan), installed from the Vercel Marketplace | Plain SQL, on the Vercel invoice, portable to any Postgres host. Paid plan because the free tier suspends the whole app when its compute hours run out. **[corrected 2026-11-25]** Today it runs on the Free plan; Launch is about $15 a month when needed (correction 8). |
| Files | Vercel Blob, behind a small storage interface | Same bill. Audio transfer is cents at this scale (see costs). **[corrected 2026-11-25]** Transfer is included in Vercel's flat rate (correction 7). |
| Script, voice, images | OpenRouter only | It is the model router the PRD asks for: one API and one balance across voice models, so cost and quality can be compared by changing a model id. |
| Auth | Better Auth inside the app, Google sign-in only at MVP | No extra vendor or bill, users live in our Postgres, so "delete my account" is one transaction. Google-only avoids adding an email-sending service. **[corrected 2026-11-25]** Sign in with Apple alone turns accounts on; Google is optional (correction 5). |
| Bot protection and rate limits | Vercel BotID plus counters in Postgres | No extra vendor. **[corrected 2026-11-25]** Not built as written: no BotID yet; counters are in Upstash Redis when configured, else in memory (correction 4). |
| Payments | Stripe Checkout and one webhook | Fees come out of revenue, there is no bill to pay. **[corrected 2026-11-25]** Not built yet (correction 6). |
| Background music | A few licensed loops as static files, mixed in the browser | Zero marginal cost. No server-side audio processing. |

Two bills to pay: **Vercel** (hosting, database, files) and **OpenRouter** (all AI). The spend that scales with usage sits almost entirely on OpenRouter, which is prepaid and stops at zero.

### Why this one

1. **The dollar risk is AI spend, not infrastructure.** At 1,000 users, infrastructure is about $45 a month in every design; AI is $200 to $2,500 depending on the voice tier. The architecture choice that matters is where the AI spend sits and how it is capped, and all three candidates use OpenRouter for voice. So the tie-break is simplicity, and this design has the fewest moving parts.
2. **Cost visibility.** One prepaid balance covers every model. Every generation also writes a row to our own usage ledger with its cost, so cost per user, per voice model and per day is a SQL query, not a cloud console.
3. **No lock-in that matters.** Postgres and an HTTP API are the most portable choices available. Blob is behind an interface so a move to R2 is a one-file change.

## Rejected options

**Vercel + Convex + OpenRouter + Cloudflare R2 (the earlier proposal).** It works and costs about the same ($42 to $89 a month at 100 users). Its real advantages are live job status without polling and a client library that runs unchanged in Expo. Against that: five vendors and four bills, a proprietary data model with no SQL (leaving means rewriting the backend), and R2 that its own costing shows is not needed below roughly 100 GB stored. The adversarial review found Expo over a plain HTTP API with bearer tokens to be fine, so Convex buys convenience, not capability. Rejected on simplicity and lock-in.

**Cloudflare Workers + D1 + R2, frontend on Vercel.** Cheapest floor ($5 a month) and free audio egress. But the "one bill" pitch fails: Cloudflare's own voice models are either too flat for a meditation product or twice the price of OpenRouter's mid tier, so voice still goes to OpenRouter, and Tim wants the app on Vercel, which makes four bills and a split deployment with cross-domain cookies. Saves about $10 to $180 a month at 100 to 1,000 users, mostly from a cheaper image model that this design can also route to. Rejected on complexity. Worth revisiting only if audio transfer passes 1 TB a month.

**Not costed in depth:** Supabase or Firebase as the backend. Each adds a vendor and a bill without removing one, and Firebase is the opaque Google billing Tim left.

## Costs

Assumptions (identical across the three designs): an active user creates 4 manifestations a month, each about 2 minutes of audio (1,800 characters) with 2 AI variations, 4 images per manifestation, 20 listens a month, plus 5 anonymous trial generations per active user as funnel waste. That is 17 voice generations (30,600 characters), 17 scripts and 16 images per active user per month.

Unit prices, read 2026-11-17:

| Item | Price | Per unit | Confidence |
|---|---|---|---|
| Voice, cheap: Kokoro 82M | **[corrected 2026-11-25]** $0.99 per 1M characters (was $0.62) | about $0.0018 per 2-minute audio (1,800 characters) | OpenRouter, 2026-11-25 |
| Voice, default: Gemini 3.8 Flash Lite TTS (`gemini-sulafat`) | **[added 2026-11-25]** $0.50 per 1M text tokens in, $6 per 1M audio tokens out | not per character; measure from the ledger | OpenRouter, 2026-11-25 |
| Voice, mid: several models (Grok Voice, AssemblyAI TTS 1, MAI-Voice, Speechify) | about $15 per 1M characters | $0.027 per audio | Listed price, from search results |
| Voice, premium: ElevenLabs v4 | $40 to $80 per 1M characters | $0.07 to $0.14 per audio | Listed price, from search results |
| Script: Gemini 2.5 Flash Lite and similar | **[corrected 2026-11-25]** $0.10 in / $0.40 out per 1M tokens (was Claude Haiku class, $1 / $5) | a small fraction of a cent per script | OpenRouter, 2026-11-25 |
| Image: Seedream class | about $0.008 per image | | Verified on OpenRouter |
| OpenRouter fee | 5.5% on credit purchases | | From OpenRouter FAQ |
| Vercel Pro | $20 a month, includes a usage credit | | Verified |
| Neon Launch | usage-based, about $5 a month idle-ish, about $19 at 1,000 users. **[corrected 2026-11-25]** Free plan today; typical Launch bill about $15 | | Estimate; steward-reported |
| Vercel Blob | $0.023 per GB stored, about $0.05 per GB transferred. **[corrected 2026-11-25]** Transfer is included in Vercel's flat rate | | Verified via search; steward-reported |

Monthly cost per service:

| Service | 10 users | 100 users | 1,000 users |
|---|---:|---:|---:|
| Vercel Pro | $20.00 | $20.00 | $20.00 |
| Neon Postgres | $5.00 | $5.00 | $19.00 |
| Vercel Blob (storage at month 12, plus transfer) | $0.10 | $0.95 | $9.45 |
| Scripts | $0.60 | $5.95 | $59.50 |
| Images | $1.28 | $12.80 | $128.00 |
| Voice, cheap tier | $0.19 | $1.90 | $18.97 |
| Voice, mid tier | $4.59 | $45.90 | $459.00 |
| OpenRouter fee (cheap / mid) | $0.11 / $0.36 | $1.14 / $3.56 | $11.36 / $35.56 |
| **Total, cheap voice** | **$27** | **$48** | **$266** |
| **Total, mid voice** | **$32** | **$94** | **$731** |
| Total, premium voice ($80 per 1M) | $53 | $304 | $2,829 |

**[corrected 2026-11-25]** The Scripts and "Voice, cheap tier" rows and the totals above use the old prices (corrections 1 to 3). The Neon row ($5 / $5 / $19) and the Blob "plus transfer" are stale too (corrections 7 and 8: Neon is on the Free plan today, about $15 on Launch, and Blob transfer is inside the flat rate). The cheap-voice and mid-voice totals are not valid for the default voice; read this table as the 2026-11-17 estimate, not the current cost.

What the table says:

- **Voice only dominates from the mid tier up.** On the cheap tier, images are the largest line. Voice is under 10% of the total on cheap, about 63% on mid, close to 90% on premium.
- **Variable cost per active user:** about $0.22 a month (cheap voice), $0.68 (mid), $2.78 (premium). Against a subscription of around $10 a month, even premium leaves margin, provided usage per user is capped.
- **Script length is the multiplier.** These numbers assume 2-minute audio. A 10-minute meditation costs 5 times as much voice.
- **Replays are free.** Audio is generated once and stored; listening costs only transfer (about $0.0001 per play).
- **Images are the easy saving.** Generating one image per manifestation instead of four, and reusing it across variations, cuts the image line by 75%.
- Stripe fees (about 2.9% + 30¢ per charge) are excluded because they scale with revenue.

Not verified this session: direct fetches of vercel.com and openrouter.ai were blocked, so some prices come from search extracts of the official pages. Re-check the mid and premium voice prices before committing to a tier.

## Budget guardrails

Vendor caps stop spend but they do it by breaking the app, so the first line of defence is in our own code and the vendor caps are the backstop.

In the app (first line). **[corrected 2026-11-25]** This list is the design. What is built is in correction 4: the $2 ceiling, 150 a day total, 6 per visitor per day, the kill switch and 50/80/100% alerts. The allowance ledger, idempotent jobs, BotID, cheap-voice-only free accounts and the Postgres usage ledger are not built.

1. **Per-user allowance ledger.** Every account has a monthly allowance of voice characters and images, set by plan. A generation debits the ledger before the model is called and is refused when the allowance is spent. Premium voices debit at their real cost ratio. This is what stops one subscriber spending $80 against a $10 subscription.
2. **Idempotent jobs.** Each generation is a row with a client-supplied key; a retry returns the existing job instead of paying twice.
3. **Hard length caps.** Input 280 characters; script output capped (about 1,800 characters on free, higher on paid plans).
4. **Anonymous budget.** Anonymous visitors get 1 real generation on the cheapest voice, no image, behind BotID, a per-IP rate limit and a global daily anonymous budget (start at $1 a day, about 250 generations). When the budget is spent, visitors get a pre-rendered library manifestation and a sign-up prompt, not an error.
5. **Free accounts get cheap voice only.** Premium voices require an active subscription, so fake sign-ups cost a fraction of a cent each.
6. **Kill switch.** One setting turns generation off while playback, sign-in and payments keep working.
7. **Usage ledger.** Every model call records model, units and cost. A daily job compares the ledger with the OpenRouter balance and emails Tim at 50% and 75% of the monthly budget.

At the vendors (backstop):

| Vendor | Control | Behaviour when hit |
|---|---|---|
| OpenRouter | Prepaid credits, auto top-up off. Two API keys with monthly limits: `anon` ($30) and `members`. | Requests fail. The anonymous key running out cannot affect paying users. |
| Vercel | Spend Management: notify at $30, pause at $60 | Site pauses. Opt-in and not instant, so it is a last resort. |
| Neon | Compute and storage limits on the Launch plan | Database suspends. |
| Stripe | None needed | |

**The number to watch weekly:** OpenRouter spend in the last 7 days divided by paying subscribers, next to weekly revenue per subscriber.

## Data model

Postgres. Auth tables (`user`, `session`, `account`) are created by Better Auth and not shown.

**[corrected 2026-11-25]** The SQL below is the original design. Only `profile`, `manifestation` and `rendition` exist from it, plus `playlist`, `playlist_item` and `blob_tombstone`, which it does not list (correction 6).

```sql
-- A person, or an anonymous device before sign-up.
profile (
  id            uuid primary key,
  user_id       text unique references "user"(id) on delete cascade, -- null while anonymous
  device_id     text unique,          -- signed cookie; adopted on sign-up
  first_name    text,
  plan          text not null default 'free',   -- free | paid
  created_at    timestamptz not null default now()
)

manifestation (
  id            uuid primary key,
  profile_id    uuid not null references profile(id) on delete cascade,
  title         text not null,        -- generated, editable
  description   text not null,        -- what the user typed
  is_library    boolean not null default false,  -- pre-built, free to all
  share_slug    text unique,          -- null = private; served at /s/:slug, revocable
  created_at    timestamptz not null default now()
)

-- One script and its audio. Variations are extra renditions of one manifestation.
rendition (
  id            uuid primary key,
  manifestation_id uuid not null references manifestation(id) on delete cascade,
  script        text not null,        -- "You" statements, editable draft
  voice_model   text,                 -- OpenRouter model id
  voice_id      text,
  audio_key     text,                 -- storage key; null until generated
  audio_seconds int,
  created_at    timestamptz not null default now()
)

image (
  id            uuid primary key,
  manifestation_id uuid not null references manifestation(id) on delete cascade,
  model         text not null,
  storage_key   text not null
)

-- One row per generation request. idempotency_key makes retries free.
job (
  id            uuid primary key,
  profile_id    uuid not null references profile(id) on delete cascade,
  idempotency_key text not null,
  kind          text not null,        -- script | voice | image
  status        text not null,        -- queued | running | done | failed | refused
  rendition_id  uuid references rendition(id) on delete set null,
  unique (profile_id, idempotency_key)
)

-- Every model call and what it cost. Never deleted; profile_id is nulled on account deletion.
usage (
  id            bigserial primary key,
  profile_id    uuid references profile(id) on delete set null,
  job_id        uuid,
  model         text not null,
  units         int not null,         -- characters, tokens or images
  cost_usd      numeric(10,6) not null,
  is_anonymous  boolean not null,
  created_at    timestamptz not null default now()
)

-- Monthly allowance per profile. Debited before each model call.
allowance (
  profile_id    uuid references profile(id) on delete cascade,
  period        date not null,        -- first day of month
  voice_chars_left int not null,
  images_left   int not null,
  primary key (profile_id, period)
)

-- Who is entitled to what, whoever sold it. Stripe now, Apple and Google later.
entitlement (
  profile_id    uuid references profile(id) on delete cascade,
  provider      text not null,        -- stripe | apple | google
  external_id   text not null,
  status        text not null,
  current_period_end timestamptz,
  primary key (provider, external_id)
)

rate_limit ( key text primary key, count int not null, window_start timestamptz not null )
setting    ( key text primary key, value jsonb not null )   -- kill switch, daily budgets, default models
```

**[corrected 2026-11-26, #168]** Entitlements are stored as credits, in our Postgres (`db/migrations/004_credit_ledger.sql`), not in Stripe or RevenueCat. The `entitlement` and `allowance` tables above are not built and are not the plan for the paywall. RevenueCat is the till: its webhook tells our server a purchase happened, and our server adds credits. RevenueCat entitlements suit subscriptions, not a count of recordings.

```sql
-- One row per grant or spend. An account's balance is sum(delta). Keyed by the Better Auth user id.
credit_ledger (
  id          bigint generated always as identity primary key,
  user_id     text not null references "user"(id) on delete cascade,
  delta       integer not null,
  reason      text not null,   -- free | purchase | spend | refund | tester
  product_id  text,            -- starter | pack10, for a purchase
  source_id   text unique,     -- RevenueCat event id: a repeated event can never grant twice
  once_key    text,            -- 'free' or 'starter'; unique with user_id, so each is granted once per account
  environment text,            -- SANDBOX | PRODUCTION, from the event
  created_at  timestamptz not null default now()
)
```

- **Packs** (`config/credits.json`, Tim 2026-11-26): `starter` is 3 recordings at $2.99, once per account; `pack10` is 10 recordings at $6.99, repeatable. Prices are set in App Store Connect, not here. The free allowance (1) and "sign-in required" (true) are in the same file.
- **Spend:** one credit per recording, taken after the network and spend-ceiling guards pass and before any paid call, under a per-account lock, so two requests at balance 1 cannot both record. A recording that fails after the credit was taken gives it back (`refund`). The network, global and ceiling guards stay as the backstop.
- **Testers:** `UNLIMITED_USER_EMAILS` (comma list) skips the spend for a signed-in account whose email, from the server-side session and verified by the sign-in provider, is on the list. Each such recording writes a `tester` row with delta 0, so the cost stays countable. Nothing from the client is trusted.
- **Switch:** `PAYWALL_ENABLED` (default off). Off, `/api/manifest` is as it was before.
- **RevenueCat id mapping:** the RevenueCat app user id is our account id (`"user".id`). The app calls `Purchases.logIn(id)` right after sign-in. The webhook (`POST /api/revenuecat/webhook`, header checked against `REVENUECAT_WEBHOOK_AUTH`) handles `NON_RENEWING_PURCHASE` and `INITIAL_PURCHASE`, and tries the event's aliases when `app_user_id` is not an account.
- **Deleting an account** deletes its ledger rows with it (cascade), like every other user-owned row.

Delete account: one transaction deletes the auth user (cascading to profile, manifestations, renditions, images, jobs, allowance, entitlement), then a job deletes the stored files by key and cancels the Stripe subscription. Share links stop working because they are served through `/s/:slug`, never as raw storage URLs.

## Demo 1 flow: type what you want, hear your manifestation

No sign-up. This is what the prototype in this repository shows, with the browser's built-in speech standing in for the voice model.

1. Visitor lands on `/` and sees one text box, an optional first name, and a button.
2. They type what they want and tap **Create my manifestation**.
3. Server: BotID check, per-IP rate limit, daily anonymous budget check. If the budget is spent, skip to a library manifestation.
4. Server creates an anonymous profile (signed device cookie) and a job row.
5. Script model writes about 8 lines in "You" statements, using the first name two or three times. Cost about $0.002.
6. Cheapest voice model reads it. Audio is stored once. Cost about $0.0005.
7. The player opens: tap play, lines appear as they are spoken, optional music loop.
8. **New variation**, **save** and **choose a voice** lead to the sign-up prompt. Signing up adopts the anonymous profile, so the first manifestation is already in the account.
9. Images, studio voices and unlimited variations lead to the paywall.

Total marginal cost of the anonymous experience: under half a cent.

Demo 2 (next): the same flow with real models behind a $20 prepaid OpenRouter balance, plus a voice bake-off page that plays one script in three voice tiers with the cost of each.

## Later: Expo

The route handlers are already the API. The Expo app needs bearer-token sessions (Better Auth supports this), background audio, and Sign in with Apple alongside Google. Apple requires in-app purchase for digital subscriptions (15 to 30%), which is why entitlements are stored per provider from day one.

## Open risks

- **Voice quality at the cheap tier is untested.** The whole cost picture depends on whether Kokoro is good enough for a meditation voice. Demo 2 settles this by ear.
- **Privacy.** What people wish for reveals health, money and relationships. Scripts go to model providers through OpenRouter; use providers that do not train on inputs, and keep the description out of logs.
- **Content.** Free text is turned into speech. Scripts need a system prompt that refuses medical-cure claims and content about other named people.
- **Better Auth is self-run.** Security updates are ours to apply. If that becomes a burden, a hosted auth service is a contained swap.
