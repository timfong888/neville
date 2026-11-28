import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { nowPlaying } from "../player/nowPlayingStore";
import { MUSIC_ENABLED, useMusicView } from "../player/musicStore";
import { musicTrack } from "@/lib/music";
import type { NowPlayingState } from "../player/nowPlaying";
import { colors, radius, space, type } from "../theme";

/** Compact bar for screens that don't have the large playback card.
 *  Pass `np` only when `isActive(np)` is true; the parent decides when to render this. */
export function PlaybackBar({ np }: { np: NowPlayingState }) {
  const router = useRouter();
  const music = useMusicView();
  const isPlaying = np.status === "playing";
  const label = isPlaying ? "Stop" : "Resume";
  const onPress = isPlaying ? () => nowPlaying.pause() : () => nowPlaying.resume();
  const title = np.title + (np.total > 0 ? ` · ${np.position} of ${np.total}` : "");
  const track = MUSIC_ENABLED && music.active && music.choice !== "none" ? musicTrack(music.choice)?.title : null;
  return (
    <View style={s.bar}>
      <Pressable
        style={s.name}
        onPress={() => router.push(np.route as never)}
        accessibilityRole="link"
        accessibilityLabel={`Now playing: ${np.title}`}
      >
        <Text style={s.nameText} numberOfLines={1}>{title}</Text>
        {track ? <Text style={s.chip}>♪ {track}</Text> : null}
      </Pressable>
      <Pressable
        style={s.btn}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={s.btnText}>{label}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flex: 1, gap: 2 },
  nameText: { ...type.muted },
  chip: { color: colors.muted, fontSize: 11 },
  btn: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
