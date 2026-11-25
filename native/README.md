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

## Routes (Phase 1)

| Route | Screen | File |
| --- | --- | --- |
| `/` | Opens Create | `app/(tabs)/index.tsx` |
| `/create` | Create (tab) | `app/(tabs)/create.tsx` |
| `/library` | Library list (tab) | `app/(tabs)/library.tsx` |
| `/library/[id]` | Library detail | `app/library/[id].tsx` |
| `/player/[id]` | Player, by Library item id | `app/player/[id].tsx` |
| `/settings` | Settings (tab) | `app/(tabs)/settings.tsx` |
| `/account` | Account (tab) | `app/(tabs)/account.tsx` |

- Colours and type come from `src/theme.ts`. Wrap a screen in `Screen` from `src/ui/Screen.tsx`.
- The web build is a single-page app (`web.output: "single"`), because screens read device storage.
- `/phase0` and `/spike` are the Phase 0 pages, kept until Account and Player replace them.
