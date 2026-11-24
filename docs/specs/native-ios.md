# Native iOS app

Status: approved by Tim on 2026-11-24 (#71). Phase 0 is in progress.

## Decision

One UI codebase. One repo, one API.

- `native/` is the one client: Expo SDK 58 with Expo Router, built for iOS and
  for web. Screens are written once in React Native.
- Next.js stays as the backend. The 12 `/api/*` route handlers do not change.
- One domain. The production host serves the Expo web build and rewrites
  `/api/*` and the internal pages to the Next deployment. Same origin, so
  cookies, Origin checks and OAuth redirect URIs stay as they are.
- The old DOM screens are deleted when the new build reaches parity.

`ios-shell/` is a WebView shell. It is not the end goal and is not submitted
for App Review. It is removed once the native build is on TestFlight.

## Why this changed

The first version of this spec kept separate web and native screens, mainly
to protect the live website. Tim, 2026-11-24: "I don't think there is a risk
with the live site no one is using it." With that removed:

- The screens must be written in React Native for iOS anyway. Reusing them on
  the web is cheaper than keeping a second copy.
- The untested Next 16 + react-native-web combination is avoided, because
  React Native screens never run inside Next.
- The web build can be checked in a browser on every PR, which shortens the
  test loop. Only audio and sign-in need a phone.

Evidence and the option comparison are in #71.

## Platform seams

Each has a `.web.ts` and a `.native.ts` file, kept outside the routes folder.

| Seam | Web | Native |
| --- | --- | --- |
| Audio | today's `<audio>` + Web Audio code (`lib/musicBed.ts`) | `expo-audio`, background play, lock screen |
| Library store | today's IndexedDB store (`lib/library/store.ts`) | files on the device |
| Settings store | `localStorage` | key-value storage |
| Auth client | cookies, same origin | `@better-auth/expo` with `expo-secure-store` |

## What is shared and what stays in Next

- Shared by web and iOS: all user screens, the platform-neutral `lib/`
  modules (16 files, 1,588 lines) and their tests, `config/*.json`, a typed
  API client.
- Stays in Next: `/api/*`, `/voices` bake-off, `/architecture`,
  `/admin/usage`, `/mode-samples/*`, and the public share page (#28), which
  needs preview tags rendered on the server.

## Versions

Expo SDK 58: React Native 0.88, React 19.3.0, react-native-web 0.21.
The backend is on Next 16.4.6, React 19.3.1, better-auth ^1.7.26.
`native/` has its own `package.json`, so the React versions need not match.

## Phases

Sizes are rough days of agent work, without device testing or App Review.

### Phase 0: prerequisites (4 to 6)

- `native/` scaffold for iOS and web, theme taken from `app/globals.css`,
  the four seams.
- Typed API client with an injectable base URL and auth header.
- Auth: `@better-auth/expo` server plugin, `neville://` in `trustedOrigins`,
  `APPLE_APP_BUNDLE_ID=pckg.neville`, native Sign in with Apple by ID token,
  Google through the system browser. Settle #62 so native requests still pass.
- Audio spike on a real phone: voice plus looped music with the screen locked
  and lock-screen controls. Decide how ducking works natively.
- Deployment proof: Expo web preview calling `/api/*` on the Next deployment
  through a rewrite, signed in.

### Phase 1: first TestFlight build (6 to 9)

Screens, written once and shipped to TestFlight and a web preview URL:

- Create: wish, script, recording.
- Player: background audio and lock-screen controls.
- Library: list and detail, saved on the device.
- Settings: voice, pace, tone.
- Account: Sign in with Apple, Google, delete account.

The music bed is included only if the spike is clean.

### Phase 2: parity and cutover (6 to 9)

Playlists and "Play all", account library sync and "move device work", music
bed with ducking, mix voices, onboarding, re-record. Then the production
domain serves the Expo web build and the old DOM screens are deleted.

### Phase 3: store (5 or more)

In-app purchase on iOS and Stripe on web, App Store submission (#64), share
page (#28) with links that open the app, Android.

## Tracking

| Phase | Issue |
| --- | --- |
| 0 Prerequisites | #89 (parts: #83, #84, #85, #86) |
| 1 First TestFlight build | #91 |
| 2 Parity and cutover | #92 |
| 3 Store | #93 |

## Decided by Tim (2026-11-24)

- One UI codebase is the end state. "My hunch is that having one codebase is
  best."
- The live website is cut over when the new build reaches parity (end of
  Phase 2), not earlier. "Accept both"
- `/voices`, `/architecture`, `/admin/usage` and `/mode-samples` stay in Next
  and are not ported. "Accept both"

- `native/` lives in this repo, reusing bundle `pckg.neville` and the EAS
  project.
- Phase 1 scope as listed above.
- No purchase screen before Phase 3.
- iPhone only, tested through TestFlight.

## App Review

- 4.2 minimum functionality: do not submit a WebView shell.
- 4.8 login: Google sign-in requires Sign in with Apple, as the native sheet.
- 5.1.1(v): account deletion must be in the app.
- 3.1.1: digital subscriptions sold in the app use in-app purchase. The
  Stripe path must not ship in the iOS build.

## Risks

- Scheduled ducking and the gapless music loop may not match the web version
  on iOS. Fallback: a fixed music level, or mix the bed into the file.
- The two-project deployment behind one domain is unproven here until the
  Phase 0 proof.
- React Native on web is weaker than hand-written HTML for desktop layout,
  keyboard focus and first load size. Acceptable while the site has no users.
- DOM-only controls (4 selects, 3 range sliders) need replacements that work
  on both platforms.
