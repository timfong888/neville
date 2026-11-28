import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
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
import { SHOW_VOICE_MODEL } from "../../src/config";
import { filterVoicesByLanguage, voiceRowNote } from "@/lib/voiceDisplay";

// Create: choose the voice for the next recording. The same voices and samples as Settings.
export default function VoicePicker() {
  const c = useCreate();
  const router = useRouter();
  const np = useNowPlaying();
  const { settings: saved } = useSettings();
  const { playing, error, toggle, stop, clearError } = useSample();
  const [note, setNote] = useState("");
  const { voices, defaultId, ready } = useVoices();
  useEffect(() => void load(), []);
  const isDefault = c.voiceId === saved.voiceId;

  const filteredVoices = filterVoicesByLanguage(voices, saved.language);

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
        {filteredVoices.map((v) => (
          <OptionRow
            key={v.id}
            label={v.name}
            note={[v.generate ? "" : "Sample only", v.id === saved.voiceId ? "Your Settings voice" : "", voiceRowNote(v, SHOW_VOICE_MODEL)].filter(Boolean).join(" · ")}
            selected={c.voiceId === v.id}
            disabled={!v.generate}
            onPress={() => (setNote(""), clearError(), void pickVoice(v.id))}
            right={<SmallButton label={playing === v.id ? "Stop" : "Play"} a11y={`${playing === v.id ? "Stop" : "Play"} sample of ${v.name}`} onPress={() => toggle(v.id, v.sample)} />}
          />
        ))}
      </View>
      {!ready && <Text style={type.muted}>{defaultId}</Text>}
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.md, alignItems: "center" },
});
