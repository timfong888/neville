import { useCallback, useEffect } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { MAX_TITLE, type Manifestation, cleanTitle, linesFromText, sameLines } from "@/lib/library/model";
import { displayTitle } from "@/lib/script";
import { shouldShowPaywall } from "@/lib/paywall";
import { library } from "../../src/seams/library";
import { Button } from "../../src/ui/Button";
import { Screen } from "../../src/ui/Screen";
import { colors, radius, space, type } from "../../src/theme";
import { ImageGallery } from "../../src/image/Gallery";
import { PAYWALL_ENABLED } from "../../src/config";
import { refreshCredits, useCredits } from "../../src/creditsStore";
import { mockPurchaseClient } from "../../src/paywall/mockPurchase";
import { PaywallSheet } from "../../src/paywall/PaywallSheet";
import { editSaved, initSession, startRecording, useRerecordState } from "../../src/rerecordSession";
import { VoiceSection } from "../../src/ui/VoiceSection";
import { DEFAULT_CADENCE_STEP, DEFAULT_SPEED_STEP, resolveCadence, resolveSpeed, type CadenceStep, type SpeedStep } from "@/lib/voice/options";
import { resolveVoice } from "@/lib/voices";
import { useState, useRef } from "react";

/** Off unless the build sets EXPO_PUBLIC_IMAGES=1. */
const IMAGES_ENABLED = process.env.EXPO_PUBLIC_IMAGES === "1";

export default function LibraryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toLibrary = () => router.dismissTo("/library");
  const [m, setM] = useState<Manifestation | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState("");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const deleting = useRef(false);
  const [rrVoiceId, setRrVoiceId] = useState<string | null>(null);
  const [rrSpeed, setRrSpeed] = useState<SpeedStep>(DEFAULT_SPEED_STEP);
  const [rrCadence, setRrCadence] = useState<CadenceStep>(DEFAULT_CADENCE_STEP);

  const credits = useCredits();
  const rrState = useRerecordState(id);

  // Refresh credits badge when screen focuses (paywall on).
  useFocusEffect(
    useCallback(() => {
      if (PAYWALL_ENABLED) void refreshCredits().catch(() => undefined);
    }, []),
  );

  useEffect(() => {
    let live = true;
    const load = () =>
      library.get(id).then(
        (x) => live && !(deleting.current && !x) && setM(x),
        () => live && !deleting.current && setM(null),
      );
    load();
    const off = library.subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, [id]);

  // Initialise (or reconnect to) the rerecord session once we know hasAudio.
  useEffect(() => {
    if (m != null) {
      initSession(id, m.hasAudio);
      setRrVoiceId(m.voiceId || null);
      setRrSpeed(resolveSpeed(m.speedStep).id);
      setRrCadence(resolveCadence(m.cadenceStep).id);
    }
  }, [id, m]);

  // Open the paywall sheet when the session signals no_credits.
  useEffect(() => {
    if (rrState.status === "no_credits" && PAYWALL_ENABLED && shouldShowPaywall(credits)) {
      setPaywallOpen(true);
    }
  }, [rrState.status, credits]);

  if (m === undefined) return <Screen />;
  if (m === null) {
    return (
      <Screen title="Not found">
        <Text style={type.muted}>This item is not saved on this device.</Text>
        <Button label="Back to the library" onPress={() => toLibrary()} />
      </Screen>
    );
  }

  const newLines = linesFromText(script);
  const scriptChanged = editing && !sameLines(newLines, m.lines);
  const losesAudio = scriptChanged && m.hasAudio;

  const startEdit = () => {
    setTitle(m.title);
    setScript(m.lines.join("\n"));
    setMsg("");
    setEditing(true);
  };

  const save = async () => {
    if (!newLines.length) return setMsg("The script needs at least one line.");
    const next: Manifestation = { ...m, title: cleanTitle(title) || m.title, lines: newLines, updatedAt: Date.now() };
    try {
      await library.save(next, scriptChanged ? null : undefined);
      setM({ ...next, hasAudio: scriptChanged ? false : m.hasAudio });
      setEditing(false);
      if (scriptChanged) {
        editSaved(id);
        setMsg(""); // state machine message replaces the save message
      } else {
        setMsg("Saved.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save. The device may be full.");
    }
  };

  const remove = async () => {
    deleting.current = true;
    try {
      await library.remove(m.id);
      toLibrary();
    } catch (e) {
      deleting.current = false;
      setMsg(e instanceof Error ? e.message : "Could not delete.");
    }
  };

  const recordLabel = (() => {
    if (!PAYWALL_ENABLED) return "Record";
    if (credits?.paywallEnabled && !credits.unlimited) return "Record · 1 credit";
    return "Record";
  })();

  const chargeMessage = (() => {
    const { balance } = rrState;
    if (balance === "unlimited") return "Unlimited recordings.";
    if (balance !== null) return `1 credit used. ${balance} left.`;
    return "1 credit used.";
  })();

  const failMessage = (() => {
    const { failReason, creditReturned } = rrState;
    if (!failReason) return "";
    return creditReturned ? `${failReason} Your credit was returned.` : failReason;
  })();

  const noCreditsMessage =
    !PAYWALL_ENABLED || shouldShowPaywall(credits)
      ? ""
      : "You have no recordings left. Get more to keep going.";

  const isRecording = rrState.status === "recording";

  return (
    <>
      <Screen title={editing ? "Edit" : displayTitle(m.title)}>
        {editing ? (
          <>
            <Text style={type.muted}>Title</Text>
            <TextInput
              accessibilityLabel="Title"
              value={title}
              onChangeText={setTitle}
              maxLength={MAX_TITLE}
              style={s.input}
              placeholderTextColor={colors.muted}
            />
            <Text style={type.muted}>Script, one line per row</Text>
            <TextInput
              accessibilityLabel="Script"
              value={script}
              onChangeText={setScript}
              multiline
              style={[s.input, s.area]}
              placeholderTextColor={colors.muted}
            />
            {losesAudio ? (
              <Text style={s.warn}>Changing the words removes the recording. Tap Record after saving to hear your edit.</Text>
            ) : null}
            <View style={s.acts}>
              <Button kind="primary" label={losesAudio ? "Save and remove recording" : "Save"} onPress={save} />
              <Button label="Cancel" onPress={() => (setEditing(false), setMsg(""))} />
            </View>
          </>
        ) : (
          <>
            <Text style={type.muted}>
              {m.hasAudio && rrState.status !== "saved_not_recorded"
                ? `Recorded in the voice of ${m.voiceName}.`
                : rrState.status === "done"
                  ? `Recorded in the voice of ${m.voiceName}.`
                  : `Voice: ${m.voiceName || "none"}. No recording is saved with this script.`}{" "}
              Saved {new Date(m.createdAt).toLocaleDateString()}.
            </Text>

            {/* Re-record state messages */}
            {rrState.status === "saved_not_recorded" ? (
              <Text accessibilityLiveRegion="polite" style={type.muted}>
                Script saved. Record it to hear your edit.
              </Text>
            ) : rrState.status === "recording" ? (
              <Text accessibilityLiveRegion="polite" style={type.muted}>
                Recording in progress. This takes up to half a minute.
              </Text>
            ) : rrState.status === "charged" ? (
              <Text accessibilityLiveRegion="polite" style={type.muted}>
                {chargeMessage}
              </Text>
            ) : rrState.status === "done" ? (
              <Text accessibilityLiveRegion="polite" style={type.muted}>
                Recording done.
              </Text>
            ) : rrState.status === "failed" ? (
              <>
                <Text accessibilityLiveRegion="polite" style={[type.muted, s.warn]}>
                  {failMessage}
                </Text>
                {rrState.failHint ? (
                  <Text accessibilityLiveRegion="polite" style={type.muted}>
                    {rrState.failHint}
                  </Text>
                ) : null}
                {/* Edit script: shown when recording was refused for content (issue 252's editor will replace startEdit when it ships). */}
                {rrState.failCode === "not_recordable" && (
                  <Button label="Edit script" onPress={startEdit} />
                )}
              </>
            ) : rrState.status === "no_credits" && noCreditsMessage ? (
              <Text accessibilityLiveRegion="polite" style={[type.muted, s.warn]}>
                {noCreditsMessage}
              </Text>
            ) : null}

            {/* Play button — hidden while recording, shown otherwise */}
            {rrState.status !== "recording" && rrState.status !== "charged" ? (
              <Button kind="primary" label="Play" onPress={() => router.push(`/player/${m.id}`)} />
            ) : null}

            {IMAGES_ENABLED ? <ImageGallery wish={m.want} /> : null}

            <View style={s.script}>
              {m.lines.map((l, i) => (
                <Text key={i} style={type.body}>{l}</Text>
              ))}
            </View>

            <VoiceSection
              voiceId={rrVoiceId ?? m.voiceId}
              voiceName={resolveVoice(rrVoiceId ?? m.voiceId).name}
              speedStep={rrSpeed}
              cadenceStep={rrCadence}
              onPickVoice={(id) => setRrVoiceId(id)}
              onPickSpeed={(id) => setRrSpeed(id)}
              onPickCadence={(id) => setRrCadence(id)}
            />

            {/* Record button: shown when no audio is saved, or when re-recording an existing item */}
            {(rrState.status === "saved_not_recorded" ||
              rrState.status === "idle" ||
              rrState.status === "failed" ||
              rrState.status === "no_credits") &&
            !isRecording ? (
              <Button
                kind="primary"
                label={recordLabel}
                disabled={isRecording}
                onPress={() => void startRecording({ ...m, voiceId: rrVoiceId ?? m.voiceId, speedStep: rrSpeed, cadenceStep: rrCadence })}
              />
            ) : null}

            {confirming ? (
              <View style={s.acts}>
                <Text style={[type.body, { flexBasis: "100%" }]}>
                  Delete "{m.title}" from this device? This cannot be undone.
                </Text>
                <Button kind="danger" label="Delete for good" onPress={remove} />
                <Button label="Keep" onPress={() => setConfirming(false)} />
              </View>
            ) : (
              <View style={s.acts}>
                <Button label="Edit" onPress={startEdit} disabled={isRecording} />
                <Button kind="danger" label="Delete" onPress={() => setConfirming(true)} />
              </View>
            )}
          </>
        )}
        <Text accessibilityLiveRegion="polite" style={type.muted}>{msg}</Text>
      </Screen>

      {PAYWALL_ENABLED && paywallOpen && credits !== null && shouldShowPaywall(credits) ? (
        <PaywallSheet
          credits={credits}
          purchaseClient={mockPurchaseClient}
          onClose={() => setPaywallOpen(false)}
          onPurchased={() => setPaywallOpen(false)}
        />
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  input: {
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: space.md,
    backgroundColor: colors.card,
  },
  area: { minHeight: 220, textAlignVertical: "top", lineHeight: 24 },
  script: {
    gap: space.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  warn: { color: colors.warn, fontSize: 14, lineHeight: 20 },
});
