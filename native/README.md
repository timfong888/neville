# Neville native (iOS)

Expo SDK 58 app for iPhone, bundle `pckg.neville`, EAS project `blockstitch/neville`.
It is a real React Native app, not a WebView. See issue #71 and `docs/specs/native-ios.md`.

- `@/lib/*` resolves to the repo's `lib/` (see `metro.config.js` and `tsconfig.json`). Only
  framework-free modules may be imported from native code.
- `src/api.ts` is the one place that knows the server URL. Set `EXPO_PUBLIC_API_URL` to point at a preview deployment.
- Cloud agents cannot run the iOS simulator. Check a change with `npx expo export --platform ios` (bundles), then an EAS build and TestFlight.

```
cd native && npm install
npm run typecheck
npm run export:ios
```

## One client, iOS and web

The same app builds for the web (`npm run export:web`, static export to `dist/`). Platform differences live in
four seams under `src/seams/` (audio, key-value settings, library, auth), each a `.native.ts` and a `.web.ts`
file. They are outside `app/` because Expo Router allows platform files inside the routes folder only
when a plain version exists too. Screens import the seam (`./seams/audio`), never a platform file.

### Two projects, one domain

`vercel.json` here serves the web build and rewrites `/api/*` to the Next deployment, so the browser sees one
origin and the session cookie is first-party. The rewrite destination is a literal URL; at cutover, point it at the
Next project's own hostname when the shared domain moves to this project. Sign-in needs the shared domain:
the Google and Apple redirect URIs are registered for it, so sign-in cannot be proven on a preview URL.
