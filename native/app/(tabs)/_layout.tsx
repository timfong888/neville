import { Tabs } from "expo-router";
import { BottomTabBar } from "expo-router/build/layouts/Tabs";
import { Platform, Text } from "react-native";
import { colors } from "../../src/theme";
import { NowPlayingBar } from "../../src/ui/NowPlayingBar";

const TABS = [
  { name: "create", title: "Create", glyph: "＋" },
  { name: "library", title: "Library", glyph: "≡" },
  { name: "settings", title: "Settings", glyph: "◐" },
  { name: "account", title: "Profile", glyph: "○" },
] as const;

export default function TabsLayout() {
  return (
    <Tabs
      // The now-playing bar (#161) sits just above the tab bar on every tab.
      tabBar={(props) => (
        <>
          <NowPlayingBar />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        // The web bar has no safe-area inset to grow into, so it needs its height stated.
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line, ...(Platform.OS === "web" ? { height: 60, paddingBottom: 6 } : null) },
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14 },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            // Text glyphs: no icon font to load, and the same on iOS and web.
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 17, lineHeight: 20 }}>{t.glyph}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}
