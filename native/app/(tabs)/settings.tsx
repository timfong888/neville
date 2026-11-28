import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { DEFAULT_PACE_ID, DEFAULT_TONE_ID, PACES, TONES } from "@/lib/delivery";
import { useVoices } from "../../src/seams/voiceList";
import { useSample } from "../../src/create/useSample";
import { settings, useSettings, type Settings } from "../../src/seams/settings";
import { isActive } from "../../src/player/nowPlaying";
import { useNowPlaying } from "../../src/player/nowPlayingStore";
import { OptionRow, SmallButton } from "../../src/ui/OptionRow";
import { PlaybackBar } from "../../src/ui/PlaybackBar";
import { Screen } from "../../src/ui/Screen";
import { space, type } from "../../src/theme";
import { SHOW_VOICE_MODEL } from "../../src/config";
import { filterVoicesByLanguage, resolveVoiceForLanguage, voiceRowNote } from "@/lib/voiceDisplay";

// Voice, pace and tone: the same options, defaults and wording as the website's Settings page.
export default function SettingsScreen() {
  const { settings: chosen } = useSettings();
  const { voices, defaultId, ready } = useVoices();
  const [note, setNote] = useState("");
  const { playing, error, toggle, stop, clearError } = useSample();
  const np = useNowPlaying();
  useFocusEffect(useCallback(() => stop, [stop]));

  const save = async (patch: Partial<Settings>, what: string) => {
    clearError();
    const ok = await settings.write(patch);
    setNote(ok ? `Saved. ${what} on this device.` : `${what} for now. This device would not save it, so it resets when you leave.`);
  };

  const filteredVoices = filterVoicesByLanguage(voices, chosen.language);
  const { id: resolvedVoiceId, notice: languageFallbackNotice } = resolveVoiceForLanguage(
    chosen.voiceId,
    voices.map((v) => ({ ...v, generate: v.generate ?? false })),
    chosen.language,
    defaultId,
  );

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

      <Text accessibilityRole="header" style={type.h2}>Language</Text>
      <View style={s.list}>
        <Text style={type.muted}>Voices are shown for the language you choose.</Text>
        <OptionRow
          label="English"
          note="All current voices"
          isDefault
          selected={chosen.language === "en"}
          onPress={() => save({ language: "en" }, "Language set to English")}
        />
      </View>

      <Text accessibilityRole="header" style={type.h2}>Voice</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Voice" style={s.list}>
        {ready
          ? <Text style={type.muted}>{filteredVoices.length} voices. Samples are pre-made, so listening is free.</Text>
          : <Text style={type.muted}>Loading voices…</Text>}
        {languageFallbackNotice ? <Text style={type.muted}>{languageFallbackNotice}</Text> : null}
        {filteredVoices.map((v) => (
          <OptionRow
            key={v.id}
            label={v.name}
            note={[v.generate ? "" : "Sample only", voiceRowNote(v, SHOW_VOICE_MODEL)].filter(Boolean).join(" · ")}
            isDefault={v.id === defaultId}
            selected={resolvedVoiceId === v.id}
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
