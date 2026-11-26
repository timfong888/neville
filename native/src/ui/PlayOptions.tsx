// The options shared by every screen that starts playback (#157, #163): repeat until stopped, and music under the voice.
// Each screen passes only what it offers. The music rows show only when the build has music on.
// The music rows are never disabled: a choice made while a recording plays changes the music at once (#184).
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { DEFAULT_MUSIC_VOLUME, MUSIC_TRACKS, type MusicChoice } from "@/lib/music";
import { MUSIC_ENABLED, musicStore, useMusic, useMusicView } from "../player/musicStore";
import { colors, radius, space, type } from "../theme";

const CHOICES: { id: MusicChoice; label: string }[] = [{ id: "none", label: "Off" }, ...MUSIC_TRACKS.map((t) => ({ id: t.id, label: t.title }))];
const STEP = 0.1;

type Toggle = { value: boolean; onChange(v: boolean): void; disabled?: boolean };

/** `bell` is the soft bell between recordings when looping (#177); its own `disabled` adds to the screen's. `disabled` is for loop and bell, not music. */
export function PlayOptions({ loop, bell, disabled }: { loop?: Toggle; bell?: Toggle; disabled?: boolean }) {
  const m = useMusic();
  // While a session holds the music, show what the player really has, not only what was saved: a refused write
  // or a track that did not load must not look like it is playing.
  const view = useMusicView();
  const shown: MusicChoice = view.active ? view.choice : (m?.choice ?? "none");
  const volume = m?.volume ?? DEFAULT_MUSIC_VOLUME;
  const nudge = (d: number) => void musicStore.write({ volume: Math.round(Math.min(1, Math.max(0, volume + d)) * 10) / 10 });
  if (!loop && !bell && !MUSIC_ENABLED) return null;
  return (
    <View style={s.box}>
      {loop ? (
        <View style={s.spread}>
          <Text style={type.body}>Repeat until stopped</Text>
          <Switch accessibilityLabel="Repeat until stopped" value={loop.value} onValueChange={loop.onChange} disabled={disabled} />
        </View>
      ) : null}
      {bell ? (
        <View style={s.spread}>
          <Text style={type.body}>A soft bell between recordings</Text>
          <Switch accessibilityLabel="A soft bell between recordings" value={bell.value} onValueChange={bell.onChange} disabled={disabled || bell.disabled} />
        </View>
      ) : null}
      {MUSIC_ENABLED ? (
        <>
          <Text style={type.muted}>Music</Text>
          <View style={s.row}>
            {CHOICES.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityLabel={`Music ${c.label}`}
                accessibilityState={{ selected: shown === c.id }}
                style={[s.chip, shown === c.id && s.on]}
                onPress={() => void musicStore.write({ choice: c.id })}
              >
                <Text style={s.chipText}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          {m && m.choice !== "none" ? (
            <View style={s.spread}>
              <Text style={type.muted}>Volume {Math.round(volume * 100)}%</Text>
              <View style={s.row}>
                <Pressable accessibilityRole="button" accessibilityLabel="Music quieter" style={s.chip} onPress={() => nudge(-STEP)}>
                  <Text style={s.chipText}>Quieter</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Music louder" style={s.chip} onPress={() => nudge(STEP)}>
                  <Text style={s.chipText}>Louder</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: space.md },
  on: { borderColor: colors.accent, backgroundColor: colors.card },
  off: { opacity: 0.5 },
  chipText: { color: colors.text, fontSize: 14 },
});
