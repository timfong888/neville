import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { canCreate, isSignedIn } from "@/lib/createGate";
import { useAccount } from "../../src/accountStore";
import { leave, newVariation, useCreate, updateMade } from "../../src/create/session";
import { isActive } from "../../src/player/nowPlaying";
import { useNowPlaying } from "../../src/player/nowPlayingStore";
import { Button, Gate, s } from "../../src/create/ui";
import { PlaybackBar } from "../../src/ui/PlaybackBar";
import { WaitingPhrases } from "../../src/create/WaitingPhrases";
import { Screen } from "../../src/ui/Screen";
import { charOverage, editEnablesRerecord, linesFromText, rrErrorMessage } from "@/lib/scriptEdit";
import { api } from "../../src/api";
import { ApiError } from "@/lib/api/client";
import { colors, space } from "../../src/theme";

// Create, step 2: review the generated script before recording. Edits are recorded exactly.
export default function ReviewScript() {
  const c = useCreate();
  const signedIn = isSignedIn(useAccount());
  const router = useRouter();
  const np = useNowPlaying();
  const [editScript, setEditScript] = useState(() => (c.made?.lines ?? []).join("\n"));
  const [rerecording, setRerecording] = useState(false);
  const [rrError, setRrError] = useState("");

  if (c.making) {
    return (
      <Screen title="Making your script…" footer={isActive(np) ? <PlaybackBar np={np} /> : undefined}>
        <Stack.Screen options={{ title: "Review your script" }} />
        <Text style={s.muted}>This takes up to half a minute. Keep this page open.</Text>
        <WaitingPhrases />
      </Screen>
    );
  }

  if (!c.made) return <Redirect href="/create" />;

  const scriptDiffers = editEnablesRerecord(c.made.lines, editScript);
  const over = charOverage(editScript);

  const recordThis = async () => {
    if (rerecording) return;
    if (!scriptDiffers) {
      router.push("/create/recording");
      return;
    }
    const lines = linesFromText(editScript);
    if (!lines.length || over > 0) return;
    setRerecording(true);
    setRrError("");
    try {
      const r = await api.rerecord(lines, c.voiceId, { speedStep: c.speedStep, cadenceStep: c.cadenceStep });
      await updateMade(r.audio, r.mime, r.voiceId, lines);
      router.push("/create/recording");
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      const msg = e instanceof ApiError ? e.message : undefined;
      setRrError(rrErrorMessage(code, msg));
    } finally {
      setRerecording(false);
    }
  };

  if (rerecording) {
    return (
      <Screen title="Recording your edits…">
        <Stack.Screen options={{ title: "Review your script" }} />
        <Text style={s.muted}>This takes up to half a minute. Keep this screen open.</Text>
        <WaitingPhrases />
      </Screen>
    );
  }

  return (
    <Screen title="Review your script" footer={isActive(np) ? <PlaybackBar np={np} /> : undefined}>
      <Stack.Screen options={{ title: "Review your script" }} />
      {c.made.note ? <Text style={s.muted}>{c.made.note}</Text> : null}
      <Text style={[s.muted, { fontSize: 12 }]}>✏ Tap to edit any word. Edits are recorded exactly as written.</Text>
      <TextInput
        accessibilityLabel="Script"
        value={editScript}
        onChangeText={(t) => { setEditScript(t); setRrError(""); }}
        multiline
        style={[s.card, { color: colors.text, minHeight: 120, textAlignVertical: "top", lineHeight: 22, padding: space.md, ...(scriptDiffers ? { borderColor: colors.accent } : {}) }]}
      />
      {scriptDiffers && over === 0 ? (
        <Text style={[s.muted, { fontSize: 12 }]}>Recorded exactly as written. No rules are applied to your edits.</Text>
      ) : null}
      {over > 0 ? (
        <Text style={[s.muted, { color: colors.warn, fontSize: 12 }]}>{over} character{over !== 1 ? "s" : ""} to cut.</Text>
      ) : null}
      {rrError ? <Text accessibilityRole="alert" style={[s.muted, { color: colors.warn }]}>{rrError}</Text> : null}
      <View style={s.row}>
        <Text style={s.muted}>Voice: <Text style={s.p}>{c.voiceName}</Text></Text>
        <Button small label="Change" onPress={() => router.push("/create/voice")} />
      </View>
      <View style={s.row}>
        <Button
          label={scriptDiffers ? "Re-record with my edits" : "Record this"}
          onPress={() => void recordThis()}
          disabled={over > 0}
        />
        <Button small label="New version" onPress={newVariation} />
      </View>
      <View style={s.row}>
        <Button small label="← Create another" onPress={() => { leave(); router.dismissTo("/create"); }} />
      </View>
      {c.gate || !canCreate(signedIn, c.used) ? <Gate signedIn={signedIn} /> : null}
    </Screen>
  );
}
