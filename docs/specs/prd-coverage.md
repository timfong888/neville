# PRD coverage

Every requirement in the PRD ([Neville](https://docs.google.com/document/d/1fBH5TIdn_nzCYWX4KSIH9MoJWmm_X4_tYLbhw-mTyWc/edit), the source of truth) mapped to where it stands. Reviewed 2026-11-19 against `main` at 1d658e2.

Status:

- **Built**: works in the prototype on `main`.
- **Partial**: some of it works; the gap is named.
- **In this task**: being built now in #12 (saved manifestations and playlists) or #13 (accounts).
- **Not yet**: not built; the issue that tracks it is linked.

Paths are relative to the repository root.

## User stories

| # | PRD requirement | Status | Where |
|---|---|---|---|
| 1 | Scroll and see pre-built manifestations | Not yet | #3 step 5 (5 to 10 library manifestations) |
| 2 | Select from a list of voices to create manifestations | Built | `app/settings/`, `config/voices.json` (#5); pace and tone in #10 |
| 3 | Define my manifestation | Built | `app/page.tsx` (create form), `app/api/manifest/route.ts` |
| 4 | Play mode that plays through all my manifestations | In this task | #12: saved library, named playlists, "Play all" |
| 5 | Meditations in "You" statements | Built | `lib/prompt.ts`, `lib/script.ts` |
| 6 | Uses my first name from time to time | Partial | First name used once, in the opening line (`lib/prompt.ts`). "From time to time" across a playlist: each saved manifestation uses it, so a playlist repeats it; within one script it is not repeated |
| 7 | AI variations to keep it interesting | Built | "New variation" on the player, `app/page.tsx` |
| 8 | Not repetitive; keeps me engaged instead of YouTube | Partial | Variations, music pad and read-along exist. Images and scrolling visual: #15. Calmer delivery: #10 |
| 9 | New programming that overcomes doubts with imagery and goals | Not yet | #15 |

## Technology

| PRD requirement | Status | Where |
|---|---|---|
| React web app for the MVP | Built | Next.js on Vercel, `docs/specs/architecture.md` |
| Full working backend, including payments | Partial | Route handlers exist; database and accounts in #13; payments #3 step 4 (out of scope here) |
| Expo and EAS, App Store and Play Store after the MVP | Not yet | #3 (deferred); architecture spec "Later: Expo" |
| Voice through a router, to compare cost and quality | Built | OpenRouter in `lib/server/tts.ts`; bake-off at `/voices` (#4) |
| Image generation, many realistic images | Not yet | #15 |
| Background music that keeps me listening | Partial | Ambient pad generated in the browser (`app/page.tsx`, `startPad`). Licensed loops not chosen |

## GTM

| PRD requirement | Status | Where |
|---|---|---|
| SEO website to attract users | Not yet | #3 (deferred) |
| Low-cost influencer content for TikTok | Not yet | #3 (deferred) |

## Screens (onboarding table)

| PRD requirement | Status | Where |
|---|---|---|
| Clean walkthrough of the benefits and how it works | Not yet | #14 |
| Finish onboarding excited; get value immediately | Partial | `/` creates a manifestation in one tap; no walkthrough (#14) |
| Free standardised recordings to listen to right away | Not yet | #3 step 5 |
| Create a customised one with my vision and name, easily | Built | `/` |
| Try things right away without signing up, shown clearly | Built | `/` ("No sign-up. One tap.") |
| Sign up easily when I need to | In this task | #13 (sign-up prompt today is a placeholder, `Gate` in `app/page.tsx`) |
| Use the app from the web | Built | |
| Create a manifestation with a single click | Built | "Create my manifestation" on `/` |
| Business: offer the first manifestation cost-effectively | Partial | Spend ceiling and soft limits, `lib/server/limits.ts`; durable limits #8 |
| Business: first manifestation drives account creation | In this task | #13 (save leads to sign-up; device work moves into the account) |
| Business: first manifestation leads to payment | Not yet | #3 step 4 (payments out of scope) |
| Delete my entire account | In this task | #13 |
| Describe my end state | Built | create form on `/` |
| Title created automatically from the description, and editable | In this task | Automatic: built (`titleFor`, `lib/script.ts`). Editable: #12 |
| Edit the affirmation; AI writes the first draft | In this task | AI draft: built. Editing the saved script: #12 |
| Look at one specific manifestation | In this task | #12 (`/library/[id]`) |
| Share it publicly and copy its URL | Partial | "Share" copies a link that refills the wish on `/`, not a public page of the recording. Public pages: #3 step 5 |
| Scroll all the manifestations I created | In this task | #12 (`/library`) |

## Storyboard

| PRD requirement | Status | Where |
|---|---|---|
| A clear, legible flow in the PRD and the spec | Not yet | #14 |
| Drill down into specific screens | Not yet | #14 |

## Proposed PRD changes

For Tim to accept or reject. The PRD body is not edited. The connector this session has can read the Doc but not write to it, so these could not be added there as blue text with comments; each is written here as the text to insert and the reason.

1. **After user story 4, add:** "A playlist is a named, ordered set of my manifestations. 'Play all' plays every manifestation I have saved, newest first. A playlist plays from first to last without me touching the screen, and shows each line as it is spoken."
   *Why:* story 4 says "play mode", and the request for this work says "playlist". The PRD does not define either. This is the definition #12 builds.
2. **In the sign-up row, add:** "At MVP, sign-in is Google only. Anything I saved before signing up moves into my account."
   *Why:* the approved architecture chose Google-only to avoid an email service; the PRD does not say which sign-in methods or what happens to work done before sign-up.
3. **In the delete-account row, add:** "Deleting removes my manifestations, recordings, playlists and share links, and cancels my subscription."
   *Why:* "delete my entire account" does not say whether recordings and public links go too. The spec assumes they do.
4. **In story 9, add:** "I can type a doubt, and the app writes new lines that answer it."
   *Why:* story 9 names the need but not an interaction, so it cannot be built or tested as written. #15 proposes this one.
