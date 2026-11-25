import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import { DEFAULT_PACE_ID, DEFAULT_TONE_ID, PACES, TONES } from "@/lib/delivery";
import { DEFAULT_VOICE_ID, ENABLED_VOICES, TIER_LABEL, resolveVoice, voiceBlurb } from "@/lib/voices";
import { paceSupport } from "@/lib/voiceMix";
import { API_URL } from "../../src/config";
import { settings, useSettings, type Settings } from "../../src/seams/settings";
import { OptionRow, SmallButton } from "../../src/ui/OptionRow";
import { Screen } from "../../src/ui/Screen";
import { space, type } from "../../src/theme";

const PACE_LABEL = { honours: "", ignores: "Ignores pace", untested: "Pace untested" } as const;

// Voice, pace and tone: the same options, defaults and wording as the website's Settings page.
export default function SettingsScreen() {
  const { settings: chosen } = useSettings();
  const [note, setNote] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  const stop = useCallback(() => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    setPlaying(null);
  }, []);
  useEffect(() => stop, [stop]);

  const toggle = (id: string, sample: string) => {
    if (playing === id) return stop();
    stop();
    try {
      const p = createAudioPlayer(`${API_URL}${sample}`);
      player.current = p;
      p.addListener("playbackStatusUpdate", (st) => {
        if (st.didJustFinish && player.current === p) stop();
      });
      p.play();
      setPlaying(id);
      setNote("");
    } catch {
      stop();
      setNote("That sample could not be played.");
    }
  };

  const save = async (patch: Partial<Settings>, what: string) => {
    const ok = await settings.write(patch);
    setNote(ok ? `Saved. ${what} on this device.` : `${what} for now. This device would not save it, so it resets when you leave.`);
  };

  return (
    <Screen title="Settings">
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
        <Text style={type.muted}>{ENABLED_VOICES.length} voices. Samples are pre-made, so listening is free.</Text>
        {ENABLED_VOICES.map((v) => (
          <OptionRow
            key={v.id}
            label={v.name}
            note={[v.generate ? "" : "Sample only", voiceBlurb(v), v.provider, TIER_LABEL[v.tier], v.generate ? PACE_LABEL[paceSupport(v)] : ""].filter(Boolean).join(" · ")}
            isDefault={v.id === DEFAULT_VOICE_ID}
            selected={chosen.voiceId === v.id}
            disabled={!v.generate}
            onPress={() => save({ voiceId: v.id }, `${resolveVoice(v.id).name} is your voice`)}
            right={<SmallButton label={playing === v.id ? "Stop" : "Play"} a11y={`${playing === v.id ? "Stop" : "Play"} sample of ${v.name}`} onPress={() => toggle(v.id, v.sample)} />}
          />
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={type.body}>{note}</Text>
      <Text style={type.muted}>
        Your choices are kept on this device only. No account is needed. New manifestations are recorded in the voice you choose. Voices marked sample only can be heard here but not chosen yet.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({ list: { gap: space.sm } });
