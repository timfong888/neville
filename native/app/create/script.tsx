import { useEffect, useState } from "react";
import { Share, Text, TextInput, View } from "react-native";
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
import { charOverage, editEnablesRerecord, editScriptFromMade, linesFromText, rrErrorMessage } from "@/lib/scriptEdit";
import { deriveReviewStatus, showTopNote } from "@/lib/reviewStatus";
import { api } from "../../src/api";
import { ApiError } from "@/lib/api/client";
import { colors, space } from "../../src/theme";

type RrStatus = { message: string; code?: string; refused: boolean } | null;

// Create, step 2: review the generated script before recording. Edits are recorded exactly.
export default function ReviewScript() {
  const c = useCreate();
  const signedIn = isSignedIn(useAccount());
  const router = useRouter();
  const np = useNowPlaying();
  // Fix #298: initialize from c.made if already set, "" if the screen was pushed before
  // generate() completed (non-paywall path). The useEffect below syncs when c.made populates.
  const [editScript, setEditScript] = useState(() => editScriptFromMade(c.made));
  const [rerecording, setRerecording] = useState(false);
  const [rrStatus, setRrStatus] = useState<RrStatus>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");

  // Fix #298: sync editScript whenever c.made changes (null→populated or new variation).
  useEffect(() => {
    if (c.made) setEditScript(editScriptFromMade(c.made));
  }, [c.made]);

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

  // Fix #301: derive a single status from the current state.
  const status = deriveReviewStatus({
    rrMessage: rrStatus?.message ?? "",
    rrCode: rrStatus?.code,
    rrRefused: rrStatus?.refused ?? false,
    scriptDiffers,
    over,
  });

  // Fix #301: top note shown only when it describes the current content of the box.
  const topNote = showTopNote(c.made.note, rrStatus?.message ?? "", scriptDiffers)
    ? c.made.note
    : null;

  const recordThis = async () => {
    if (rerecording) return;
    if (!scriptDiffers) {
      router.push("/create/recording");
      return;
    }
    const lines = linesFromText(editScript);
    if (!lines.length || over > 0) return;
    setRerecording(true);
    setRrStatus(null);
    try {
      const r = await api.rerecord(lines, c.voiceId, { speedStep: c.speedStep, cadenceStep: c.cadenceStep });
      await updateMade(r.audio, r.mime, r.voiceId, lines);
      router.push("/create/recording");
    } catch (e) {
      const apiCode = e instanceof ApiError ? e.code : undefined;
      const support = e instanceof ApiError
        ? (e.data?.supportCode ?? e.data?.attemptId ?? c.made?.supportCode ?? c.made?.attemptId)
        : (c.made?.supportCode ?? c.made?.attemptId);
      setRrStatus({
        message: rrErrorMessage(apiCode, e instanceof ApiError ? e.message : undefined),
        code: support,
        refused: apiCode === "not_recordable",
      });
    } finally {
      setRerecording(false);
    }
  };

  const handleCopy = async (code: string) => {
    await Share.share({ message: `Code: ${code}` });
    setCopyLabel("Copied");
    setTimeout(() => setCopyLabel("Copy"), 2000);
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
      {/* Fix #301: top note only when it truthfully describes the box contents. */}
      {topNote ? <Text style={s.muted}>{topNote}</Text> : null}
      <Text style={[s.muted, { fontSize: 12 }]}>✏ Tap to edit any word.</Text>
      <TextInput
        accessibilityLabel="Script"
        value={editScript}
        onChangeText={(t) => { setEditScript(t); setRrStatus(null); }}
        multiline
        style={[s.card, { color: colors.text, minHeight: 120, textAlignVertical: "top", lineHeight: 22, padding: space.md, ...(scriptDiffers ? { borderColor: colors.accent } : {}) }]}
      />
      {over > 0 ? (
        <Text style={[s.muted, { color: colors.warn, fontSize: 12 }]}>{over} character{over !== 1 ? "s" : ""} to cut.</Text>
      ) : null}
      {/* Fix #301: single status slot — one message, never two contradicting ones. */}
      {status.message ? (
        <View>
          <Text
            accessibilityRole="alert"
            style={[s.muted, { fontSize: 12 }, status.isError ? { color: colors.warn } : {}]}
          >
            {status.message}
            {status.code ? `  Code: ${status.code}` : ""}
          </Text>
          {status.code ? (
            <Button small label={copyLabel} onPress={() => void handleCopy(status.code!)} />
          ) : null}
        </View>
      ) : null}
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
