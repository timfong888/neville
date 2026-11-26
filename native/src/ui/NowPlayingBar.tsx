import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { showsBar } from "../player/nowPlaying";
import { nowPlaying, useNowPlaying } from "../player/nowPlayingStore";
import { colors, radius, space } from "../theme";

/** The small bar above the tabs while audio plays or is paused (#161): title, pause or play, stop. Tapping the title opens it. */
export function NowPlayingBar() {
  const np = useNowPlaying();
  const router = useRouter();
  if (!showsBar(np)) return null;
  const playing = np.status === "playing";
  return (
    <View style={s.bar} accessibilityRole="toolbar" accessibilityLabel="Now playing">
      <Pressable style={s.title} accessibilityRole="link" accessibilityLabel={`Now playing: ${np.title}. Open`} onPress={() => router.push(np.route as never)}>
        <Text style={s.text} numberOfLines={1}>{np.title}</Text>
      </Pressable>
      <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"} onPress={nowPlaying.toggle}>
        <Text style={s.text}>{playing ? "Pause" : "Play"}</Text>
      </Pressable>
      <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel="Stop" onPress={() => nowPlaying.stop()}>
        <Text style={s.text}>Stop</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  title: { flex: 1, minHeight: 44, justifyContent: "center" },
  btn: { minHeight: 44, minWidth: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  text: { color: colors.text, fontSize: 15, fontWeight: "600" },
});
