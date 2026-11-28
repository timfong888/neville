import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import { colors } from "../../src/theme";
import { isActive } from "../../src/player/nowPlaying";
import { useNowPlaying } from "../../src/player/nowPlayingStore";

const TABS = [
  { name: "create", title: "Create", glyph: "＋" },
  { name: "library", title: "Library", glyph: "≡" },
  { name: "settings", title: "Settings", glyph: "◐" },
  { name: "account", title: "Account", glyph: "○" },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LibraryGlyph({ color }: { color: any }) {
  const c: string | undefined = typeof color === "string" ? color : undefined;
  const np = useNowPlaying();
  return (
    <View>
      <Text style={{ color: c, fontSize: 17, lineHeight: 20 }}>≡</Text>
      {isActive(np) && (
        <View style={{ position: "absolute", top: -2, right: -4, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />
      )}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
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
            tabBarIcon: t.name === "library"
              ? ({ color }) => <LibraryGlyph color={color} />
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : ({ color }: { color: any }) => <Text style={{ color: typeof color === "string" ? color : undefined, fontSize: 17, lineHeight: 20 }}>{t.glyph}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}
