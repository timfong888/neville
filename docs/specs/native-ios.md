# Native iOS app

Status: proposal, awaiting Tim's decision in #71. Nothing here is built.

## Decision proposed

One repo, one API, shared logic. Separate web and native screens for now.

- The website stays as it is: Next.js, DOM and CSS.
- A new Expo app in `native/` holds the iOS screens, written in React Native.
- Both use the same `/api/*` route handlers and the same logic in `lib/`.
- After the first TestFlight build, decide whether the website adopts the
  native screens through Expo Router web. That would give one UI codebase.

`ios-shell/` is a WebView shell. It is not the end goal and is not submitted
for App Review. It is removed once the native build is on TestFlight.

## Why not one UI codebase now

- React web does not compile to iOS. The website's 19 client files (3,164
  lines) are DOM elements and CSS classes, so sharing the UI means rewriting
  the working website in React Native components first.
- Audio is platform-specific either way (`<audio>`, Web Audio and Media
  Session on web; `expo-audio` on iOS).
- No tested Next 16 + react-native-web setup was found. Solito lists Next 15.2
  with Expo SDK 52.

Evidence and the option comparison are in #71.

## What is shared

| Shared | Not shared |
| --- | --- |
| `/api/*` route handlers (12) | Screens |
| Platform-neutral `lib/` modules (16 files, 1,588 lines) and their tests | Audio playback |
| `config/voices.json`, `config/limits.json` | Device storage |
| `LibraryStore` interface (`lib/library/store.ts`) | Sign-in UI |
| A typed API client (to be written) | |

## Versions

Expo SDK 58: React Native 0.88, React 19.3.0, react-native-web 0.21.
The site is on Next 16.4.6, React 19.3.1, better-auth ^1.7.26.
The native app keeps its own `package.json`, so the two React versions do not
have to match.

## Phases

Sizes are rough days of agent work, without device testing or App Review.

### Phase 0: prerequisites (3 to 5)

- `native/` Expo app with Expo Router that imports `lib/`. No website files move.
- Typed API client with an injectable base URL and auth header.
- Auth: `@better-auth/expo` server plugin, `neville://` in `trustedOrigins`,
  `APPLE_APP_BUNDLE_ID=pckg.neville`, native Sign in with Apple by ID token,
  Google through the system browser. Settle #62 so native requests still pass.
- Audio spike on a real phone: voice plus looped music with the screen locked
  and lock-screen controls. Decide how ducking works natively.

### Phase 1: first TestFlight build (5 to 8)

Screens:

- Create: wish, script, recording.
- Player: background audio and lock-screen controls.
- Library: list and detail, saved on the device.
- Settings: voice, pace, tone.
- Account: Sign in with Apple, Google, delete account.

The music bed is included only if the spike is clean.

### Phase 2: parity (5 to 8)

Playlists and "Play all", account library sync and "move device work", music
bed with ducking, mix voices, onboarding, re-record.

### Phase 3: store and convergence (5 or more)

In-app purchase through RevenueCat, App Store submission (#64), the decision
on one UI codebase, Android.

## App Review

- 4.2 minimum functionality: do not submit a WebView shell.
- 4.8 login: Google sign-in requires Sign in with Apple, as the native sheet.
- 5.1.1(v): account deletion must be in the app.
- 3.1.1: digital subscriptions sold in the app use in-app purchase.

## Risks

- Scheduled ducking and the gapless music loop may not match the web version.
  Fallback: a fixed music level, or mix the bed into the file.
- Slow test loop: EAS build, TestFlight, Tim's phone. No simulator in cloud
  sessions.
- Features are built twice in the UI until the one-codebase decision is made.
  Keep feature logic in `lib/`.

## Open questions

See #71. Each has a default.
