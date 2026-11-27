import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { DEFAULT_MUSIC_VOLUME, MUSIC_TRACKS, type MusicChoice } from "@/lib/music";
import { showsBar } from "../player/nowPlaying";
import { nowPlaying, useNowPlaying } from "../player/nowPlayingStore";
import { MUSIC_ENABLED, musicStore, useMusic, useMusicView } from "../player/musicStore";
import { colors, radius, space } from "../theme";

const CHOICES: { id: MusicChoice; label: string }[] = [{ id: "none", label: "Off" }, ...MUSIC_TRACKS.map((t) => ({ id: t.id, label: t.title }))];
const STEP = 0.1;

function MusicRow() {
  const m = useMusic();
  const view = useMusicView();
  const shown: MusicChoice = view.active ? view.choice : (m?.choice ?? "none");
  const volume = m?.volume ?? DEFAULT_MUSIC_VOLUME;
  const nudge = (d: number) => void musicStore.write({ volume: Math.round(Math.min(1, Math.max(0, volume + d)) * 10) / 10 });
  return (
    <View style={s.musicRow}>
      <View style={s.chips}>
        {CHOICES.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="radio"
            accessibilityLabel={`Music ${c.label}`}
            accessibilityState={{ selected: shown === c.id }}
            style={[s.chip, shown === c.id && s.chipOn]}
            onPress={() => void musicStore.write({ choice: c.id })}
          >
            <Text style={s.chipText}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      {shown !== "none" && (
        <View style={s.chips}>
          <Pressable accessibilityRole="button" accessibilityLabel="Music quieter" style={s.chip} onPress={() => nudge(-STEP)}>
            <Text style={s.chipText}>−</Text>
          </Pressable>
          <Text style={s.dimText}>{Math.round(volume * 100)}%</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Music louder" style={s.chip} onPress={() => nudge(STEP)}>
            <Text style={s.chipText}>+</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** The bar above the tabs while audio plays: title, music picker, and Stop. */
export function NowPlayingBar() {
  const np = useNowPlaying();
  const router = useRouter();
  if (!showsBar(np)) return null;
  return (
    <View style={s.container} accessibilityRole="toolbar" accessibilityLabel="Now playing">
      <View style={s.bar}>
        <Pressable style={s.title} accessibilityRole="link" accessibilityLabel={`Now playing: ${np.title}. Open`} onPress={() => router.push(np.route as never)}>
          <Text style={s.text} numberOfLines={1}>{np.title}</Text>
        </Pressable>
        <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel="Stop" onPress={() => nowPlaying.stop()}>
          <Text style={s.text}>Stop</Text>
        </Pressable>
      </View>
      {MUSIC_ENABLED && <MusicRow />}
    </View>
  );
}

const s = StyleSheet.create({
  container: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md },
  musicRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm },
  title: { flex: 1, minHeight: 44, justifyContent: "center" },
  btn: { minHeight: 44, minWidth: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  text: { color: colors.text, fontSize: 15, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
  chipOn: { borderColor: colors.accent, backgroundColor: "rgba(16, 93, 251, 0.08)" },
  chipText: { color: colors.text, fontSize: 13 },
  dimText: { color: colors.text, fontSize: 13, opacity: 0.6 },
});
