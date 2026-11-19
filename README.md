# Neville

Voice manifestation app. This repo holds the architecture spec and a clickable prototype.

- Spec: [docs/specs/architecture.md](docs/specs/architecture.md)
- Prototype: `npm install && npm run dev`, then open:
  - `/` — Demo 1. Uses the browser speech engine; free, no keys.
  - `/architecture` — the architecture and cost page.
  - `/voices` — voice bake-off: one script, several OpenRouter voices, price per clip.
  - `/settings` — choose a voice. The choice is kept on the device; no account.

## Voices on offer

`config/voices.json` holds the list people can choose from and the default.
Edit it to change what is offered; no code change is needed.

- `enabled: false` hides a voice and stops it being accepted. A device that had
  chosen it falls back to the default.
- `default` must be the `id` of an enabled voice.
- `sample` is a pre-made clip under `public/`, so listening costs nothing.
- Do not reuse an `id` for a different voice: devices remember the id.

A mistake in the file fails the build, so it cannot reach the live site.
Real speech generation stays off unless `SPEECH_ENABLED=true`; the setting
works either way.

## Paid calls

Only `/voices` (through `POST /api/speak`) calls a paid API, and only when
`OPENROUTER_API_KEY` is set. It is switched off in production
(`VERCEL_ENV=production` returns 404), so the live site cannot spend.
`GET /api/status` reports whether the key is present and its remaining budget; it never returns the key.
