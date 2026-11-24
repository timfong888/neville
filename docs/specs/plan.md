# Neville plan

Status: living document, started 2026-11-24. The PRD (Google Doc "Neville") is the source of truth for scope. This page says what we build next, in what order, and why. Each step links its ticket, and the tickets hold the detail and acceptance tests.

## What we are building

A calm voice that reads you a short script about your wish as if it is already true, in your own words, often enough to change how you think. That means four things:

1. **The recording works every time.** A failed recording falls back to the phone's own voice reading a generic script. That is the single biggest reason the app felt repetitive in Tim's first TestFlight test (2026-11-24).
2. **The script follows Neville's method, not generic affirmations.** Assume the end, feel it from inside, one moment that implies it is done, thanks as the refrain.
3. **Repetition is a setting.** Early on, breaking through takes repetition, so the listener chooses how many minutes of it to hear.
4. **The app is on the phone.** The iOS shell is in TestFlight now. A native app follows.

## Order of work, and why

| # | Step | Ticket | Why now | Waits on |
|---|---|---|---|---|
| 1 | Retry brief voice-provider errors; read the written script if the voice still fails | #73, PR #75 | About half of recordings were failing. Smallest, safest fix. | — |
| 2 | Script prompt paraphrases Lesson 1, plus a fixed-input eval | #78, PR (draft) | Approved by Tim. It changes what every new script says. | — |
| 3 | Closing line: replace "And so it is." | #79 | Tiny, and Tim found it "chippy". | Tim's pick |
| 4 | Atomic voice: one request per script, pauses and pace inside it | #76 | One failure point instead of 10 to 13. Pace and pauses only work on a Gemini voice. | Tim: default voice |
| 5 | Programming mode: minutes of repetition | #77 | Tim's chosen technique for the short script. Needs the refrain from step 2. | Tim: default and max minutes, order |
| 6 | Sign-in inside the iOS shell | #70 | Saving and playlists need an account on the phone. | — |
| 7 | Native app approach | #71, #64, #68 | Decide one codebase or shared logic once the web app's core is solid. | Tim |

The background issue for steps 2 to 5 is #74 (findings: the fallback script, and the method not being in the prompt).

## How we know it works

- **Recording:** at least 19 of 20 production generations come back as recordings (the `[ledger]` log lines).
- **Script:** `npm run eval:scripts` passes on 8 fixed wishes × 3 tones × 2 versions, with no stock phrases, the wish never "on its way", and versions that don't repeat each other. A model judge looks for one moment that implies the wish is done. Tim reads the snapshot (`evals/scripts.snapshot.md`).
- **Feel:** Tim listens on the phone, with the phone locked, and approves each step.
