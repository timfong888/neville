import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { TIER_LABEL } from "@/lib/voices";
import { useVoices } from "../../src/seams/voiceList";
import { load, pickVoice, useCreate } from "../../src/create/session";
import { Button } from "../../src/create/ui";
import { useSample } from "../../src/create/useSample";
import { useSettings } from "../../src/seams/settings";
import { isActive } from "../../src/player/nowPlaying";
import { useNowPlaying } from "../../src/player/nowPlayingStore";
import { OptionRow, SmallButton } from "../../src/ui/OptionRow";
import { PlaybackBar } from "../../src/ui/PlaybackBar";
import { Screen } from "../../src/ui/Screen";
import { space, type } from "../../src/theme";

// Create: choose the voice for the next recording. The same voices and samples as Settings.
// A pick here lasts until the voice is changed in Settings; Settings keeps its choice unless "Make this my default" is tapped.
export default function VoicePicker() {
  const c = useCreate();
  const router = useRouter();
  const np = useNowPlaying();
  const { settings: saved } = useSettings();
  const { playing, error, toggle, stop, clearError } = useSample();
  const [note, setNote] = useState("");
  const { voices, defaultId, ready } = useVoices();
  // Opened cold (a deep link, a refresh), the wish step has not read Settings yet.
  useEffect(() => void load(), []);
  const isDefault = c.voiceId === saved.voiceId;

  const makeDefault = async () => {
    clearError();
    const ok = await pickVoice(c.voiceId, true);
    setNote(ok ? `${c.voiceName} is now your default voice.` : "This device would not save it, so it applies until you leave.");
  };
  const done = () => {
    stop();
    router.back();
  };

  return (
    <Screen title="Choose a voice" footer={isActive(np) ? <PlaybackBar np={np} /> : undefined}>
      <Stack.Screen options={{ title: "Voice" }} />
      <Text style={type.muted}>For your next recording. Samples are pre-made, so listening is free.</Text>
      {/* Above the long list, so the choice and its buttons need no scrolling. */}
      <Text accessibilityLiveRegion="polite" style={type.body}>{error || note}</Text>
      <Text style={type.muted}>
        {isDefault ? `${c.voiceName} is your voice in Settings.` : `${c.voiceName} is used here until you change the voice in Settings. Settings stays as it is.`}
      </Text>
      <View style={s.row}>
        <Button label={`Use ${c.voiceName}`} onPress={done} />
        {isDefault ? null : <Button small label="Make this my default" onPress={() => void makeDefault()} />}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Voice" style={s.list}>
        {!ready && <Text style={type.muted}>Loading voices…</Text>}
        {voices.map((v) => (
          <OptionRow
            key={v.id}
            label={v.name}
            // "Default" in Settings marks the app's own default, so the saved choice is named differently here.
            note={[v.generate ? "" : "Sample only", v.id === saved.voiceId ? "Your Settings voice" : "", v.desc ?? v.label, TIER_LABEL[v.tier as keyof typeof TIER_LABEL]].filter(Boolean).join(" · ")}
            selected={c.voiceId === v.id}
            disabled={!v.generate}
            onPress={() => (setNote(""), clearError(), void pickVoice(v.id))}
            right={<SmallButton label={playing === v.id ? "Stop" : "Play"} a11y={`${playing === v.id ? "Stop" : "Play"} sample of ${v.name}`} onPress={() => toggle(v.id, v.sample)} />}
          />
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
});
