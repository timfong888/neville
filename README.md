# Neville

Voice manifestation app. This repo holds the architecture spec and a clickable prototype.

- Spec: [docs/specs/architecture.md](docs/specs/architecture.md)
- PRD coverage: [docs/specs/prd-coverage.md](docs/specs/prd-coverage.md)
- App: `npm install && npm run dev`, then open:
  - `/` — type a wish; the app writes a short affirmation and records it in your chosen voice.
  - `/library` — manifestations you saved with **Save** on the player; open one to edit its title and script.
  - `/playlists` — named, ordered playlists that play back to back; "Play all" plays the whole library.
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
  instance. If Redis cannot be reached, recording is refused (fail closed),
  like the spend ceiling. Visitor addresses are hashed with the day before
  they are stored, and keys expire after two days. Without the variables
  (local dev, tests) the counters fall back to memory, one copy per instance.
  The two free creations before the sign-up prompt are softer: that count is
  in the browser's own storage. No bot check yet.
- `maxWantChars`, `maxScriptChars` — input and script length.
- `generationEnabled` — `false` switches recording off. Setting the environment
  variable `SPEECH_ENABLED=false` does the same without a code change.

Beyond these, the key's own limit and the account balance at OpenRouter apply.
When recording is refused or fails, the page falls back to a template script
read by the device's own voice, which costs nothing.

`POST /api/speak` (the bake-off) stays off in production. `GET /api/status`
reports whether the key is present; on previews also its budget. It never
returns the key.
