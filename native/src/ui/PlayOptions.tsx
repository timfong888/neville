// The options shared by every screen that starts playback (#157, #163): repeat until stopped, and music under the voice.
// Each screen passes only what it offers. The music rows show only when the build has music on.
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { DEFAULT_MUSIC_VOLUME, MUSIC_TRACKS, type MusicChoice } from "@/lib/music";
import { MUSIC_ENABLED, musicStore, useMusic } from "../player/musicStore";
import { colors, radius, space, type } from "../theme";

const CHOICES: { id: MusicChoice; label: string }[] = [{ id: "none", label: "Off" }, ...MUSIC_TRACKS.map((t) => ({ id: t.id, label: t.title }))];
const STEP = 0.1;

type Toggle = { value: boolean; onChange(v: boolean): void; disabled?: boolean };

/** `bell` is the soft bell between recordings when looping (#177); its own `disabled` adds to the screen's. */
export function PlayOptions({ loop, bell, disabled }: { loop?: Toggle; bell?: Toggle; disabled?: boolean }) {
  const m = useMusic();
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
          <Text style={type.muted}>Music{disabled ? " (stop to change)" : ""}</Text>
          <View style={s.row}>
            {CHOICES.map((c) => (
              <Pressable
                key={c.id}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityLabel={`Music ${c.label}`}
                accessibilityState={{ selected: (m?.choice ?? "none") === c.id, disabled: !!disabled }}
                style={[s.chip, (m?.choice ?? "none") === c.id && s.on, disabled && s.off]}
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
                <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel="Music quieter" style={[s.chip, disabled && s.off]} onPress={() => nudge(-STEP)}>
                  <Text style={s.chipText}>Quieter</Text>
                </Pressable>
                <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel="Music louder" style={[s.chip, disabled && s.off]} onPress={() => nudge(STEP)}>
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
