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
