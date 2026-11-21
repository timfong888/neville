# Neville

Voice manifestation app. This repo holds the architecture spec and a clickable prototype.

- Spec: [docs/specs/architecture.md](docs/specs/architecture.md)
- PRD coverage: [docs/specs/prd-coverage.md](docs/specs/prd-coverage.md)
- App: `npm install && npm run dev`, then open:
  - `/` — type a wish; the app writes a short affirmation and records it in your chosen voice.
  - `/library` — manifestations you saved with **Save** on the player; open one to edit its title and script.
  - `/playlists` — named, ordered playlists that play back to back; "Play all" plays the whole library.
  - `/account` — create a free account with Google, move device work into it, sign out, delete the account.
  - `/settings` — choose a voice. The choice is kept on the device; no account.
  - `/voices` — voice bake-off: one script, several OpenRouter voices, price per clip.
  - `/architecture` — the architecture and cost page.

## Voices on offer

`config/voices.json` holds the list people can choose from and the default.
Edit it to change what is offered; no code change is needed.

- `enabled: false` hides a voice and stops it being accepted. A device that had
  chosen it falls back to the default.
- `default` must be the `id` of an enabled voice.
- `sample` is a pre-made clip under `public/`, so listening costs nothing.
- Do not reuse an `id` for a different voice: devices remember the id.

- `tier` is `free`, `cheap`, `low`, `mid` or `premium`, by price.

- `generate: true` lets new audio be recorded in that voice. `false` means
  sample only: it can be heard in Settings but not chosen. Keep `generate` for
  cheap voices; every visitor can pick any voice that has it.

A mistake in the file fails the build, so it cannot reach the live site.

## Delivery: pace and tone

Settings has a Pace (Slow, Very slow) and a Tone (Calm, Soft, Sleep). Defaults are
Slow and Calm. The presets, with the numbers behind them, live in `lib/delivery.ts`;
the browser sends only the two ids and the server turns them into speech settings.

- **Script:** the prompt asks for 10 to 12 short present-tense lines, a repeated
  refrain, no exclamation marks, no sales words. The tone adds a one-line "feel".
- **Speed:** sent to the model as `speed`. A model that refuses it is asked again
  without it; `X-Speed-Applied` on the response says which happened.
- **Pauses:** voices that return raw PCM (HeyGen, Gemini) are recorded one line at
  a time and joined with silence (1.5 s Slow, 2.6 s Very slow, longer for Soft and
  Sleep). If the file would be too big for a response, the pauses shrink first.
  Other voices get one request with a blank line between sentences.
- **Style instruction:** sent to Gemini voices, which take one.

`node scripts/record-samples.mjs` records before/after clips into
`public/delivery-samples/` (needs the key, ffmpeg and a running dev server).

## Tests

`npm test` runs the unit tests for the limit decisions, the script rules, the
fallback script and voice choice. `npm run typecheck` checks types.

## Paid calls and what bounds them

`POST /api/manifest` is the app's one paid path, and it runs on the live site.
It writes the script with a cheap text model and records it, both through
`OPENROUTER_API_KEY`. Nothing is stored. A typical request costs about half a
cent; the dearest voice allowed about one cent.

Limits are in `config/limits.json`:

- **Hard cap: `spendCeilingUsd`.** Before every recording the server asks
  OpenRouter for the key's total usage and refuses once it reaches this number.
  OpenRouter keeps the count, so it holds across every server instance. If the
  usage cannot be read, nothing is recorded. This is the only server-side guard
  that bounds spend.
- **Daily caps: `perIpPerDay`, `globalPerDay`.** Counted in Upstash Redis when
  it is connected (Vercel Marketplace, Storage, Upstash for Redis; it sets
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` or `KV_REST_API_URL`/`_TOKEN`, and both
  pairs are read). Then every server instance shares one count, it survives
  restarts, and a visitor cannot get extra recordings by landing on another
  instance. Both limits are checked before anything is counted, in one Redis script,
  so a refused request changes no count and one visitor's retries cannot use
  up other visitors' share of the day. A visitor (or day) already known to
  be full is refused for a minute from memory, without a Redis call. If
  Redis cannot be reached, recording is refused (fail closed), like the spend
  ceiling. Visitor addresses are stored only as an HMAC
  keyed by a server secret (`LIMITS_SALT` if set, otherwise derived from the
  OpenRouter key) and the day, and keys expire after two days. Without the variables
  (local dev, tests) the counters fall back to memory, one copy per instance.
  The two free creations before the sign-up prompt are softer: that count is
  in the browser's own storage. No bot check yet.
- `maxWantChars`, `maxScriptChars` — input and script length.
- `generationEnabled` — `false` switches recording off. Setting the environment
  variable `SPEECH_ENABLED=false` does the same without a code change.

Beyond these, the key's own limit and the account balance at OpenRouter apply.
When recording is refused or fails, the page falls back to a template script
read by the device's own voice, which costs nothing.

## Usage ledger, kill switch and budget alerts

- **Ledger.** Every paid call, with the one gap noted below, (`/api/manifest` script and speech, `/api/rerecord`
  vet and speech) is recorded: route, kind, model, characters, estimated cost.
  Each entry is one `[ledger]` JSON line in the runtime log (Vercel, project,
  Logs), which is the durable record. The last 500 are also kept in memory per
  server instance for the admin page. `lib/server/ledger.ts` has a
  `LedgerStore` interface so a database table can replace the memory store
  later without touching the routes. Speech cost is an estimate from
  OpenRouter's per-character price; voices priced by token show "—".
- **Alerts.** Each time the server reads the key's usage (before every paid
  request) it checks it against `spendCeilingUsd`. At 50%, 80% and 100% it
  logs `[budget-alert]` and, if `ALERT_WEBHOOK_URL` is set, POSTs
  `{text, content, level, usage, ceiling}` there (a Slack or Discord incoming
  webhook works as is). No email service is connected. Each server instance
  alerts a level once, so the same level can arrive more than once; a webhook
  that fails is logged and not retried.
- **Failed recordings** are recorded too (`ok: false`, unpriced), since a long
  script can be billed in part before it fails; the admin page marks them.
  A script check that answers with nothing usable is recorded as well.
  Script-writing calls are recorded unpriced (fractions of a cent). Known gap:
  a script-writing reply that arrives but is unusable (the app then uses the
  general script) is not recorded yet, because `writeScript` reports "template" the
  same way whether or not a reply arrived. The ceiling and alerts are not
  affected: they use OpenRouter's own usage counter.
- **Admin page.** Set `ADMIN_TOKEN` in Vercel, open `/admin/usage` and enter
  it once (a 12-hour httpOnly cookie holds a signed session whose expiry the
  server checks; the token never goes in a URL or the cookie): a banner at 50/80/100%, kill-switch state and recent ledger rows.
  Without `ADMIN_TOKEN` the page is a 404. Use a long random token (32+
  characters, e.g. `openssl rand -base64 32`); after 10 wrong tries a visitor
  is refused for 15 minutes. That throttle is best effort: it is counted in
  memory per server instance (durable once a shared store such as Upstash is
  added, issue #8), and it identifies the visitor by `x-real-ip` /
  `x-forwarded-for`, which only Vercel's own edge sets reliably; behind any
  other proxy those headers can be forged. Changing the token signs every session out.
- **Kill switch.** `SPEECH_ENABLED=false` (Vercel env, then redeploy: about a
  minute) or `generationEnabled: false` in `config/limits.json`. For an
  instant stop, disable the key at openrouter.ai: recording refuses whenever
  usage cannot be read.

`POST /api/speak` (the bake-off) stays off in production. `GET /api/status`
reports whether the key is present; on previews also its budget. It never
returns the key.

## Accounts

Off until every variable below is set; until then saved work stays in the
browser and `/account` says what is missing (variable names only, never
values, and not on production).

| Variable | Where it comes from |
|---|---|
| `ACCOUNTS_ENABLED` | set to `true` |
| `DATABASE_URL` | Neon, added from the Vercel Marketplace |
| `BLOB_READ_WRITE_TOKEN` | a **private** Vercel Blob store connected to the project |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth Web client. Authorized redirect URIs: `https://getneville.vercel.app/api/auth/callback/google` and `https://neville-delta.vercel.app/api/auth/callback/google` (plus a preview branch URL if you test sign-in there); JavaScript origins: the same two hosts |
| `BETTER_AUTH_SECRET` | 32+ random characters |
| `BETTER_AUTH_URL` | optional; production defaults to `https://getneville.vercel.app`, previews to their branch URL. `https://neville-delta.vercel.app` stays a trusted origin |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | optional: Sign in with Apple appears (Services ID return URLs: `https://getneville.vercel.app/api/auth/callback/apple` and `https://neville-delta.vercel.app/api/auth/callback/apple`; domains: `getneville.vercel.app`, `neville-delta.vercel.app`) when all four are set and the key parses. A key that does not parse switches only Apple off (one log line names the variable); Google keeps working. The Services ID, the 10-character Team ID, the key's Key ID, and the full contents of its `.p8` file. The app signs Apple's client secret from the key itself, so nothing expires by hand. |
| `APPLE_APP_BUNDLE_ID` | optional, for the future iOS app: also accept Apple ID tokens issued to this bundle id (the Services ID stays accepted) |

Schema: `db/migrations/*.sql`, applied in order by `scripts/migrate.mjs`. A
build applies them only when `MIGRATE_ON_BUILD=true`; `npm run migrate`
applies them by hand against `DATABASE_URL`. Recordings are kept in private
Blob storage and only served through `/api/library/.../audio` to their owner.
Deleting an account deletes the user row, which cascades to every saved row,
then deletes the recordings.
