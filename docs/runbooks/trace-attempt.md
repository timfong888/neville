# Trace a generation attempt

Take the reference from the failure screen (e.g. `7F3A-91C2`) or the full copy line (`Neville ref <uuid> <time> <build>`), then find every step of the attempt in under a minute.

## 1. PostHog — HogQL query

Replace `<attempt-id>` with the full UUID from the copy line.

```sql
SELECT event, properties.step, properties.try, properties.reason,
       properties.elapsedMs, properties.model, properties.build,
       timestamp
FROM events
WHERE properties.attempt_id = '<attempt-id>'
ORDER BY timestamp ASC
```

Expected rows: `attempt_started`, then `script_ok` or `script_failed`, then `voice_ok` or `voice_failed`, then `attempt_done` on success.

## 2. Vercel logs — keyword search

Go to the Neville project in Vercel → Logs. Set time window to ±5 min around the timestamp from the copy line.

Filter: `attempt_id`

Then filter by the first 8 characters of the UUID (e.g. `7f3a91c2`) to narrow the logs to that attempt. Look for `[script_fallback]`, `[voice_failed]`, or `[ALERT]` lines — each one includes the full `attempt_id` and `reason`.

## 3. Fallback "A moment of calm" — reason codes today

The title appears when `writeScript` returns `source: "template"` (`lib/server/writer.ts`). Reasons:

| Reason emitted | What happened |
|---|---|
| `filter_withheld` | Wish involves sexual content about a minor; never sent to a model |
| `writer_timeout` | OpenRouter network timeout or abort |
| `writer_refused` | OpenRouter returned HTTP 429 (rate limited) |
| `writer_error` | HTTP 5xx, parse error, unusable model reply, or no model listed |

Voice failure (`voice_failed` event, `voice_provider_error`) shows "The voice could not be recorded" — the title stays as whatever was generated.

A complete API failure (network error, server 500 before the response body) is caught on the client and also shows "A moment of calm" with note "The recording could not be made just now."
