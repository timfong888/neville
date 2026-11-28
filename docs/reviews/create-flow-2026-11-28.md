# Create flow review, 2026-11-28

Issue: timfong888/neville#283. Reviewed at `main` 4aaff0e.
Scope: everything from the Create tab to the first play, and the server behind it.
Read, not run: the app was not started on a device. See section 5.

Source notes used: issues #281, #282, #274 and Tim's product notes of 2026-11-28.
The app speaks as a hypnotist, in the second person, using the listener's name.
Users type "I am" statements. "Exact" is the wrong mode name.
Voices and models live on the server. Every failure needs a support code.

How to read this: section 1 lists what to keep. Section 2 has twelve proposals.
Section 3 ranks the five best by impact per effort. Section 4 gives an order.
Every file and line below refers to `main` at 4aaff0e.

## 1. What is already good (keep)

- **Framework-free rules with injected seams.** `lib/create.ts`, `native/src/seams/voiceListCore.ts:22` and `native/src/seams/settingsCore.ts:19` take `api` and `kv` as arguments. Tests run them without React or Expo. Keep this pattern for every new rule.
- **The server owns the voice.** The device sends an id. `lib/voices.ts:84` resolves it and never trusts a model name from a client.
- **Config fails the build.** `lib/voices.ts:40-69` validates `config/voices.json` at import time. A bad entry cannot reach production.
- **Logs never carry the wish.** `lib/server/writer.ts:101-103` logs numbers and names only. `app/api/manifest/route.ts:146` does the same for the gate.
- **Refunds are keyed and idempotent.** `lib/server/paywall.ts:75-91` retries the refund three times and can never refund twice.
- **A written script survives a voice failure.** `app/api/manifest/route.ts:321` returns the model's lines with the 502. The device reads them.
- **Waiting screen respects reduce motion.** `native/src/create/WaitingPhrases.tsx:35-43` reads the setting and drops the fade.
- **The Create button stays above the keyboard.** `native/app/(tabs)/create.tsx:53-72` puts it in the footer with the gate.
- **Drafts survive a restart.** `native/src/create/session.ts:107-111` writes the wish on every keystroke.
- **Tests name their ticket.** `tests/create.test.ts:180` reads "exact mode (#229)". Keep it.
- **Audio engineering is careful.** `lib/server/tts.ts:204-222` falls back from one take to line by line. `lib/delivery.ts:259` cuts at pauses. `lib/server/tts.ts:330` normalises loudness.
- **Spend has a hard ceiling.** `lib/server/limits.ts:36` asks OpenRouter before every recording and fails closed.

## 2. Proposals

Format: title, problem, evidence, proposal, user impact, effort (S/M/L), risk, what it unblocks.

### P1. One create pipeline, two strategies

**Problem.** The route has two copies of the same flow. The adult branch and the standard branch each write, record, log and respond. The adult copy misses features the standard copy has.

**Evidence.**
- `app/api/manifest/route.ts:153-238` is the adult branch. `:240-373` is the standard branch.
- The adult branch never reads `scriptMode`. `:241` reads it only after the adult branch returns. This is the cause of #282.
- The adult branch uses `pauseFor(pace, tone)` at `:206`. The standard branch honours `cadenceOpt` and `speedOpt` at `:298-300`. Adult users lose the Speed and Pauses controls.
- The adult branch skips `segmentLines` (`:265`). It gets no phrase pauses.
- The adult response at `:223-236` has no `X-Attempt-Id`, `X-Build`, `X-Title` or `X-Script-Mode`. The standard one at `:344-372` has them.
- `lib/server/writer.ts:92-256` and `:282-364` are two copies of the same fetch loop.
- Only the adult branch has a voice fallback chain (`:183-216`). The standard branch gives up after one voice (`:307`).

**Proposal.** One pipeline: `gate → write → record → respond`. Each stage takes a strategy object.
- `write` takes `{ system, models, checks }`. Adult passes `ADULT_SYSTEM`, `adultScriptModels` and the output gate. Standard passes `SYSTEM`, `scriptModels` and the sexual-content checks.
- `record` takes a voice chain for every tier. Standard gets `[requested, default]`. Adult gets `[requested, ...adultTtsFallback]`.
- `respond` builds one header set from one `Result` type.
- `writeScript` and `writeAdultScript` become one function with a `Policy` argument.

**User impact.** Adult-tier users get exact mode, speed, pauses and the support code. Every user gets a voice fallback. Future fixes land once.

**Effort.** L. **Risk.** Medium. The adult gate order must not change. Tests in `tests/adult-tier.test.ts` and `tests/adult-tts.test.ts` must keep passing.

**Unblocks.** #282 cause 1. #281 F2 and F3 for every tier. P11.

### P2. One attempt id on every line and every response

**Problem.** One request has three ids. Many log lines and responses have none. Tim's screenshot in #281 had no code because the failure path sends none.

**Evidence.**
- `app/api/manifest/route.ts:50` reads or makes `attemptId`.
- `:182` makes a second id, `adultAttemptId`, for the TTS loop.
- `lib/server/alertFailure.ts:32` makes a third random `requestId` for every alert.
- `:312` logs `[voice_failed]` with no attempt id.
- `lib/server/ledger.ts:54` writes `[ledger]` lines with no attempt id.
- `lib/server/tts.ts:248` and `:273` return "did not answer in time" with no stage, voice or model name.
- `:220` (adult voice failure) returns JSON with no `X-Attempt-Id` and no id in the body. So do the refusals at `:53`, `:56`, `:63`, `:70`, `:101`, `:106`, `:148` and `:160`.
- `lib/api/client.ts:173` builds `ApiError` from the body only. A header id never reaches the screen.

**Proposal.**
- `const log = forAttempt(attemptId)` at the top of `handle`. Every `console.*` and `captureEvent` goes through it. It adds `attempt_id`, `stage`, `elapsedMs` and `build`.
- `synthesize` and `writeScript` take `attemptId` and log one line per try: model or voice, ms, outcome.
- Delete `adultAttemptId` and the random `requestId`. `alertFailure` takes the attempt id.
- One `reply(status, body)` helper sets `X-Attempt-Id` and puts `attemptId` in every JSON body.
- `ApiError` gains `attemptId` from header or body. `Made.attemptId` prefers the server's value.

**User impact.** Every failure screen shows a code that finds the request in one search. Support gets faster.

**Effort.** M. **Risk.** Low. Logging and headers only.

**Unblocks.** #281 F1 and F3. `docs/runbooks/trace-attempt.md` becomes true for every path.

### P3. One clock for the whole request

**Problem.** Each stage starts its own timer. The sum can pass the route's budget. The #281 request spent 35 s on two writers and left 17 s for the voice.

**Evidence.**
- `app/api/manifest/route.ts:24` gives the route 60 s. `config/credits.json:5` gives the paywall 50 s.
- `lib/server/writer.ts:140` and `:298` each start `deadline = now + scriptTimeoutMs` (36 s, `config/limits.json:16`).
- `route.ts:154` runs the adult writer, then `:253` runs the standard writer on `no_model`. Two full script budgets, one request.
- `route.ts:284` gives the voice `min(42 s, 52 s - elapsed)`. After 44 s of guards and scripts the voice gets 8 s. A stitched ten-line recording cannot finish in 8 s.
- `route.ts:195` calls `underCeiling` (a 6 s network call, `lib/server/limits.ts:42`) inside the adult TTS loop, once per voice.
- `lib/server/writer.ts:21` fetches the model catalogue with a 5 s timeout before the first script try.

**Proposal.**
- Make one `Deadline` in `handle` with `remaining()` and `share(fraction, min, max)`.
- Pass it to every stage. All writers together get at most 30 s. The voice is guaranteed 20 s or the route stops early.
- When the voice cannot get 20 s, return the written script with code `voice_skipped` and refund. The device reads it. Do not start a recording that will time out.
- Check the ceiling once per request. Move the catalogue fetch to a warm cache refreshed by a cron or on module load.

**User impact.** Fewer timeouts. A slow script never eats the recording. The user gets their script in 35 s instead of a generic one in 52 s.

**Effort.** M. **Risk.** Low. Numbers in config; behaviour on the slow path only.

**Unblocks.** #281 "tries each model within a total time budget". P1 uses the same clock.

### P4. One failure envelope, parsed once

**Problem.** Failure bodies differ by path. Three clients parse them three ways. Copy drifts.

**Evidence.**
- `app/api/manifest/route.ts:220` returns `{ code, error, lines? }`.
- `:315-328` returns `{ code, error, lines?, reason? }` and a header.
- `app/api/rerecord/route.ts:232-243` returns `{ code, error, hint, creditReturned?, creditsBalance? }`.
- `lib/server/paywall.ts:108` returns `{ code, error, creditReturned? }`.
- `lib/create.ts:126-152` maps errors to a screen note. `native/src/create/session.ts:177-192` repeats that mapping, including the `withReset` helper. `app/page.tsx:478-481` parses the body a third way and skips `lib/api/client.ts`.
- `lib/create.ts:13` and `app/page.tsx:35` hold the same `EXAMPLES` list twice.

**Proposal.**
- Server: one type. `{ code, error, hint?, attemptId, script?: { lines, source, reason? }, credit?: { returned, balance? } }`. One `fail()` builder in a shared module used by manifest and rerecord.
- Client: `ApiError` carries the parsed envelope. One `failedMade(error, attemptId)` in `lib/create.ts`. `session.ts` and `page.tsx` call it. `page.tsx` uses `createApi` like the native app.
- Delete the second `EXAMPLES` and the second `withReset`.

**User impact.** The same failure reads the same on web and phone. Hints reach the manifest flow, not only re-record.

**Effort.** M. **Risk.** Low. Shape change on error paths only; tests cover each code.

**Unblocks.** #281 F4 on every path. P7 builds its card on this envelope.

### P5. Name the modes by what they do, and decide what "my words" means

**Problem.** "Exactly my words" is not exact. The ids `exact` and `enhance` describe neither mode. Tim: "exact is the wrong word."

**Evidence.**
- Labels: `native/app/(tabs)/create.tsx:108-109` and `app/page.tsx:832-840`.
- Ids: `lib/create.ts:24` (`"exact" | "enhance"`).
- "Exact" rewrites: `lib/prompt.ts:371-403` strips thanks, flips "I" to "you", and prefixes the name up to five times.
- The product voice is second person: `lib/prompt.ts:30` says "always 'you', never 'I'". Users type "I am" (`lib/create.ts:13-18`).
- #282 asks for verbatim. That conflicts with the second-person rule when the user typed "I am calm".

**Proposal.**
- Rename the ids to `scene` and `verbatim`. Rename the labels to "Write me a scene" and "Read my words as typed".
- Under the toggle, show one line of what the first sentence will sound like. Example for scene: "You are calm and confident when you speak." Example for verbatim: the typed sentence unchanged.
- Decision for Tim, recorded here: does "Read my words as typed" keep "I am", or flip to "you are"? #282 says keep. The hypnotist rule says flip. One answer, one test.
- Keep the stored key `nv_script_mode` and migrate old values once.

**User impact.** The user knows what each button does before tapping. Fewer "the script changed" reports.

**Effort.** S for labels and ids. M with the preview line.

**Risk.** Low. One stored value to migrate.

**Unblocks.** #282 acceptance copy. Any future third mode has a naming pattern.

### P6. One tap from result to sound

**Problem.** After Create, the user taps twice more to hear anything. The Script screen is an interstitial.

**Evidence.**
- `native/app/(tabs)/create.tsx:69` tap 1: "Create my manifestation".
- `native/app/create/script.tsx:51` tap 2: "Listen".
- `native/app/create/recording.tsx:211` tap 3: "Play".
- `recording.tsx:222-229` already shows the full script, editable. The Script screen repeats it read-only (`script.tsx:42-46`).
- The web version plays from one screen (`app/page.tsx:516` sets `stage("player")`).

**Proposal.**
- Land on one Result screen after making. It shows the title, the lines and one big Play button.
- Add a setting "Play as soon as it is ready", default on. The recording starts when the screen appears. The user's hands can stay still, eyes closed.
- Keep `script.tsx` as a redirect for old deep links, then delete it.

**User impact.** Wish to audio in 1 tap plus typing, or 2 with autoplay off. The first listen comes about five seconds sooner.

**Effort.** M. **Risk.** Low. Native screens only. Autoplay on a phone needs the audio seam configured first (`native/src/create/playback.ts:78`).

**Unblocks.** P7 has one place to show failure. One screen to keep in step with the web.

### P7. A failure the user can act on

**Problem.** A failure shows a generic title and a note. The reference is on one screen only. A retry costs a free creation. The sign-in prompt has no link.

**Evidence.**
- `native/app/create/script.tsx:48` says "Nothing was recorded." with no reference. The user sees this screen first.
- `native/app/create/recording.tsx:202-203` shows the reference only here, and "Copy" opens a share sheet.
- `native/src/create/session.ts:221` counts a free creation before `generate`. A server failure keeps the count.
- `recording.tsx:213` "New variation" is the only retry. It calls `spend()` again (`session.ts:233-237`).
- `native/app/(tabs)/create.tsx:60` says "Sign in to continue recording." with no way to sign in.
- `lib/create.ts:40` titles every failure "A moment of calm", even when the user's own script came back.

**Proposal.**
- One `FailedCard` component. It shows what happened in one sentence and "Code XXXX-XXXX" with a Copy button. It offers "Try again" and "Try another voice".
- "Try again" keeps the variant and does not call `spend()`. On any `ApiError` the device count is restored.
- When the server returned the user's script, the title is the wish's title, not "A moment of calm".
- The sign-in note links to the Profile tab.
- Show the card on the Result screen, in the Create footer, and in the re-record error slot.

**User impact.** The user has the code to send, a free retry, and a way around a bad voice.

**Effort.** M. **Risk.** Low. Device state and copy only.

**Unblocks.** #281 user-facing acceptance. Depends on P2 for the server id and P4 for the envelope.

### P8. First-run copy that is true for the build

**Problem.** The headline promises no sign-up. The paid build requires it. The quote sits between the label and the box.

**Evidence.**
- `native/app/(tabs)/create.tsx:74`: "No sign-up. One tap."
- `config/credits.json:3`: `signInRequired: true`. `native/src/config.ts:10` turns the paywall on per build.
- `create.tsx:83-86`: the label "What is already yours?" then an italic quote, then the input. The quote pushes the input down on a small screen.
- `create.tsx:97`: the placeholder is "I am calm and confident when I speak". Good. Nothing says the voice will answer as "you".

**Proposal.**
- Drive the lede from the build: paywall off, "No sign-up. One tap."; paywall on, "One free recording. Sign in to keep it."
- Move the quote under the examples. Keep it to one line.
- Add one hint under the input: "Type it as 'I am…'. Neville speaks it back as 'you are…', with your name."
- Show the name the voice will use, with a link to Profile when it is empty. `getFirstName()` (`session.ts:147`) is read silently today.

**User impact.** No broken promise on the first screen. The user understands the "I" to "you" turn before hearing it.

**Effort.** S. **Risk.** Low. Copy and layout.

**Unblocks.** App Store screenshots that match the product. P5's preview line uses the same hint.

### P9. Voice list states, and the list off the device

**Problem.** Offline with no cache, the picker says "Loading voices…" forever. The inline picker shows nothing. The native bundle still ships the full voice config.

**Evidence.**
- `native/app/create/voice.tsx:55` shows "Loading voices…" while `!ready`. `native/src/seams/voiceList.ts:27` leaves `ready` false when offline with no cache.
- `native/src/ui/VoiceSection.tsx:65` maps an empty list with no message.
- `lib/voices.ts:6` imports `config/voices.json`. `lib/create.ts:81` and `native/src/create/session.ts:15` call `resolveVoice` on the device, so the bundle contains every voice. Tim (2026-11-28, #274): "We should not hard code the voice list."
- `native/src/seams/voiceConstants.ts:2` already holds the one allowed fallback id.

**Proposal.**
- `useVoices` returns `status: "loading" | "ready" | "offline"`. Offline shows "Connect to load voices" and the fallback voice name.
- `wishRequest` sends the id as stored, or omits it. The server resolves. Delete the `resolveVoice` calls in `lib/create.ts:81`, `session.ts:67` and `session.ts:158`. Voice names come from the fetched list.
- Split `lib/voices.ts` into a server module and a shared `Voice` type. Native code can then never import the config.
- Serve samples through `/api/voices/:id/sample`, so a new voice has a sample with no build.

**User impact.** A clear offline state. New voices appear with a deploy. A smaller app bundle.

**Effort.** M. **Risk.** Low to medium. #274 is in flight and owns part of this; scope this to what #274 leaves.

**Unblocks.** The rest of #274. P10's capability flags live in one place.

### P10. Voice capabilities and delivery in config, not regexes

**Problem.** What a voice can do is encoded as model-name regexes in three files. Delivery has two parallel systems.

**Evidence.**
- `lib/server/tts.ts:9` `PCM_ONLY = /^(heygen\/|google\/gemini)/`.
- `app/api/manifest/route.ts:168` and `:261` repeat that regex to decide `repeat`.
- `route.ts:28` and `app/api/rerecord/route.ts:24` both define `TAKES_STYLE`.
- `tts.ts:20-23` hard-codes per-model text caps.
- `config/limits.json:32-36` repeats model and voice names already in `config/voices.json`.
- Two delivery models: pace and tone (`lib/delivery.ts:38-105`, `native/app/(tabs)/settings.tsx:38-47`) and speed and cadence (`lib/voice/options.ts:26-37`, `VoiceSection.tsx:83-112`). `route.ts:77-81` accepts both and lets one override the other.

**Proposal.**
- Add to each voice in `config/voices.json`: `format: "pcm" | "mp3"`, `takesStyle`, `maxChars`, `canLoop`. Validate in `lib/voices.ts`.
- `adultTtsFallback` becomes a list of voice ids.
- Pick one delivery model for the user: speed and pauses. Map pace and tone to it once, server side, and remove them from Settings.

**User impact.** One set of controls in one place. Adding a voice is one config edit with no code.

**Effort.** M. **Risk.** Low. Config and lookups; behaviour unchanged for existing voices.

**Unblocks.** #274's "one config change adds a voice". P1's record stage reads one capability object.

### P11. A pipeline that tests can run without HTTP

**Problem.** The route is one 330-line function. Tests mock eleven modules or start an HTTP server to reach one branch.

**Evidence.**
- `app/api/manifest/route.ts:47-374` is `handle`.
- `tests/adult-script-fallback.test.ts` has 11 `vi.mock` calls and a `node:http` server.
- `tests/attempt-id.test.ts:64-160` also stands up a server to test headers.
- The 60 s budget, stage order and refund rules have no test that fails on a wrong order.

**Proposal.**
- `lib/server/create/pipeline.ts` exports `createRecording(input, deps)`. `deps` is `{ writer, voice, ledger, credits, clock, log }`.
- The route parses the request, builds `deps`, calls the pipeline, serialises `Result`.
- Tests pass fakes and a fake clock. They assert stage order, budget shares, refund on each failure, and the envelope.

**User impact.** None directly. Fewer regressions on the paid path.

**Effort.** M after P1. **Risk.** Low. A move, not a rewrite.

**Unblocks.** The regression tests #281 and #282 ask for, written against fakes.

### P12. Accessibility and touch targets on the form

**Problem.** The selected mode is announced as "dimmed". Chips are under 44 pt. "Copy" does not copy.

**Evidence.**
- `native/app/(tabs)/create.tsx:108-109` marks the chosen mode with `disabled`. `native/src/create/ui.tsx:9` passes `disabled` to `Pressable`; `:41` dims it to 0.45. VoiceOver reads "dimmed", not "selected".
- `ui.tsx:39` chips have `paddingVertical: 7`, about 32 pt tall. Apple's minimum is 44 pt.
- `native/app/create/recording.tsx:203` "Copy" opens `Share.share`.
- `VoiceSection.tsx:86-91` does it right: `accessibilityRole="radio"` with `accessibilityState.checked`.

**Proposal.**
- One `Choice` chip component with `accessibilityRole="radio"`, `checked` state, and `minHeight: 44`. Use it for mode, speed and pauses.
- "Copy" uses `expo-clipboard` and shows "Copied" for two seconds. Keep Share as a second small button.
- Give the Create button `accessibilityHint` "Writes and records your wish. Takes up to half a minute."

**User impact.** Screen-reader users hear which mode is on. Every target is tappable with a thumb.

**Effort.** S. **Risk.** Low.

**Unblocks.** App Store accessibility review. P5 and P8 reuse the chip.

## 3. Top 5 by impact per effort

| Rank | Proposal | Effort | One line of impact |
|---|---|---|---|
| 1 | P2 One attempt id everywhere | M | Every failure shows a code that finds the request. |
| 2 | P5 Name the modes by what they do | S | Users know what each button does before tapping. |
| 3 | P7 A failure the user can act on | M | Retry at no cost, copy the code, switch voice. |
| 4 | P3 One clock for the request | M | A slow script never eats the recording. |
| 5 | P4 One failure envelope | M | The same failure reads the same on every screen. |

P1 has the highest absolute impact. It is L and overlaps the two PRs in flight. Do it after #281 and #282 merge.

## 4. Suggested order and what runs in parallel

Rule: do not touch files that #281 or #282 are changing until they merge.
#281 touches `route.ts`, `writer.ts`, `tts.ts` and the result screen. #282 touches `route.ts` and `prompt.ts`.

**Wave 1, now, in parallel. Native and web UI only.**
- P5 labels and ids (`create.tsx`, `page.tsx`, `lib/create.ts`).
- P8 first-run copy (`create.tsx`).
- P12 chip component and clipboard (`ui.tsx`, `create.tsx`, `recording.tsx` Copy button only).
- P6 Result screen. Coordinate with #281's result-screen change or wait for it.

**Wave 2, after #281 merges. Server observability and budget.**
- P2 attempt id. Then P3 clock. Same files; one person, in order.
- P4 envelope, after P2. Then P7 on the device, after P4.

**Wave 3, after #282 merges.**
- P1 one pipeline. Then P11 extract and test.
- P10 capabilities in config, alongside P1 or just after.

**Wave 4, after #274 finishes.**
- P9 voice states and the list off the device.

Parallel pairs that never share a file: P5 with P2, P8 with P3, P12 with P4, P9 with P10.

## 5. What I could not verify

- Nothing ran on a device or simulator. Tap counts and screen order come from the code, not from use.
- VoiceOver output for the `disabled` chip is inferred from React Native's accessibility mapping, not heard.
- The 44 pt chip height is computed from padding and a 14 pt font, not measured.
- The #281 timeline comes from the issue text. I did not read Vercel or PostHog logs.
- Autoplay on iOS after a route change may need a user gesture. P6 needs a device test.
- Offline behaviour of `expo-file-system` and the KV cache is read from code only.
- How the RevenueCat sheet renders real prices. `PaywallSheet.tsx` was read with mock data in mind.
- Whether the web `page.tsx` is still in use after the native cutover. If not, several evidence lines there matter less.
- Whether `ADULT_TIER_ENABLED` is on in production. If off, P1's adult evidence affects allowlisted testers only.
