import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ENABLED_VOICES, TIER_LABEL, voiceBlurb } from "@/lib/voices";
import { load, pickVoice, useCreate } from "../../src/create/session";
import { Button } from "../../src/create/ui";
import { useSample } from "../../src/create/useSample";
import { useSettings } from "../../src/seams/settings";
import { OptionRow, SmallButton } from "../../src/ui/OptionRow";
import { Screen } from "../../src/ui/Screen";
import { space, type } from "../../src/theme";

// Create: choose the voice for the next recording. The same voices and samples as Settings.
// A pick here lasts until the voice is changed in Settings; Settings keeps its choice unless "Make this my default" is tapped.
export default function VoicePicker() {
  const c = useCreate();
  const router = useRouter();
  const { settings: saved } = useSettings();
  const { playing, error, toggle, stop, clearError } = useSample();
  const [note, setNote] = useState("");
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
    <Screen title="Choose a voice">
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
        {ENABLED_VOICES.map((v) => (
          <OptionRow
            key={v.id}
            label={v.name}
            // "Default" in Settings marks the app's own default, so the saved choice is named differently here.
            note={[v.generate ? "" : "Sample only", v.id === saved.voiceId ? "Your Settings voice" : "", voiceBlurb(v), TIER_LABEL[v.tier]].filter(Boolean).join(" · ")}
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
