import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { DEFAULT_PACE_ID, DEFAULT_TONE_ID, PACES, TONES } from "@/lib/delivery";
import { TIER_LABEL } from "@/lib/voices";
import { useVoices } from "../../src/seams/voiceList";
import { paceSupport } from "@/lib/voiceMix";
import { useSample } from "../../src/create/useSample";
import { settings, useSettings, type Settings } from "../../src/seams/settings";
import { isActive } from "../../src/player/nowPlaying";
import { useNowPlaying } from "../../src/player/nowPlayingStore";
import { OptionRow, SmallButton } from "../../src/ui/OptionRow";
import { PlaybackBar } from "../../src/ui/PlaybackBar";
import { Screen } from "../../src/ui/Screen";
import { space, type } from "../../src/theme";

const PACE_LABEL = { honours: "", ignores: "Ignores pace", untested: "Pace untested" } as const;

// Voice, pace and tone: the same options, defaults and wording as the website's Settings page.
export default function SettingsScreen() {
  const { settings: chosen } = useSettings();
  const { voices, defaultId, ready } = useVoices();
  const [note, setNote] = useState("");
  const { playing, error, toggle, stop, clearError } = useSample();
  const np = useNowPlaying();
  // Tabs stay mounted, so stop when the screen loses focus as well as when it unmounts.
  useFocusEffect(useCallback(() => stop, [stop]));

  const save = async (patch: Partial<Settings>, what: string) => {
    clearError();
    const ok = await settings.write(patch);
    setNote(ok ? `Saved. ${what} on this device.` : `${what} for now. This device would not save it, so it resets when you leave.`);
  };

  return (
    <Screen title="Settings" footer={isActive(np) ? <PlaybackBar np={np} /> : undefined}>
      <Text accessibilityRole="header" style={type.h2}>Delivery</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Pace" style={s.list}>
        <Text style={type.muted}>Pace</Text>
        {PACES.map((p) => (
          <OptionRow key={p.id} label={p.label} note={p.note} isDefault={p.id === DEFAULT_PACE_ID} selected={chosen.pace === p.id} onPress={() => save({ pace: p.id }, `${p.label} pace is set`)} />
        ))}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Tone" style={s.list}>
        <Text style={type.muted}>Tone</Text>
        {TONES.map((t) => (
          <OptionRow key={t.id} label={t.label} note={t.note} isDefault={t.id === DEFAULT_TONE_ID} selected={chosen.tone === t.id} onPress={() => save({ tone: t.id }, `${t.label} tone is set`)} />
        ))}
      </View>
      <Text style={type.muted}>
        Pace and tone shape the next recording: how the script is written, how slowly it is read and how long the pauses are. Voices differ in how much they follow.
      </Text>

      <Text accessibilityRole="header" style={type.h2}>Voice</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Voice" style={s.list}>
        {ready
          ? <Text style={type.muted}>{voices.length} voices. Samples are pre-made, so listening is free.</Text>
          : <Text style={type.muted}>Loading voices…</Text>}
        {voices.map((v) => (
          <OptionRow
            key={v.id}
            label={v.name}
            note={[v.generate ? "" : "Sample only", v.desc ?? v.label, v.provider, TIER_LABEL[v.tier as keyof typeof TIER_LABEL], v.generate ? PACE_LABEL[paceSupport(v)] : ""].filter(Boolean).join(" · ")}
            isDefault={v.id === defaultId}
            selected={chosen.voiceId === v.id}
            disabled={!v.generate}
            onPress={() => save({ voiceId: v.id }, `${v.name} is your voice`)}
            right={<SmallButton label={playing === v.id ? "Stop" : "Play"} a11y={`${playing === v.id ? "Stop" : "Play"} sample of ${v.name}`} onPress={() => (setNote(""), toggle(v.id, v.sample))} />}
          />
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={type.body}>{error || note}</Text>
      <Text style={type.muted}>
        Your choices are kept on this device only. No account is needed. New manifestations are recorded in the voice you choose. Voices marked sample only can be heard here but not chosen yet.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({ list: { gap: space.sm } });
