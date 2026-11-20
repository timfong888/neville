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
- **Soft MVP caps: `perIpPerDay`, `globalPerDay`.** Counters held in memory, one
  copy per server instance, lost on restart. They slow casual overuse; they are
  not a cap. Making them durable needs a store: see issue #8. The two free creations before the sign-up prompt are softer still:
  that count is in the browser's own storage.
- `maxWantChars`, `maxScriptChars` — input and script length.
- `generationEnabled` — `false` switches recording off. Setting the environment
  variable `SPEECH_ENABLED=false` does the same without a code change.

Beyond these, the key's own limit and the account balance at OpenRouter apply.
When recording is refused or fails, the page falls back to a template script
read by the device's own voice, which costs nothing.

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
