import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, TextInput, View } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { canCreate, isSignedIn } from "@/lib/createGate";
import { LIBRARY_TAB_ROUTE, playlistLabel } from "@/lib/create";
import { editEnablesRerecord, linesFromText, rrErrorMessage } from "@/lib/scriptEdit";
import { useAccount } from "../../src/accountStore";
import { CLOSING } from "@/lib/prompt";
import { type Playback, play } from "../../src/create/playback";
import { pauseWatch } from "../../src/create/pauseWatch";
import { canSpeak, leave, newVariation, save, updateMade, useCreate } from "../../src/create/session";
import { codeRef, copyLine } from "@/lib/attemptId";
import { Share } from "react-native";
import { Button, Gate, s } from "../../src/create/ui";
import { setBell, useBell } from "../../src/player/bellStore";
import { MUSIC_ENABLED } from "../../src/player/musicStore";
import { PlayOptions } from "../../src/ui/PlayOptions";
import { Screen } from "../../src/ui/Screen";
import { WaitingPhrases } from "../../src/create/WaitingPhrases";
import { api } from "../../src/api";
import { ApiError } from "@/lib/api/client";
import { colors, space } from "../../src/theme";

// Create, step 3: the recording. Plays it and follows the lines. Without a recording the
// device reads the script, or shows the lines in time.
export default function Recording() {
  const c = useCreate();
  const signedIn = isSignedIn(useAccount());
  const router = useRouter();
  const made = c.made;
  const [playing, setPlaying] = useState(false);
  // Playing was cut short from outside (a call, the lock screen, another app). Play resumes it.
  const [paused, setPaused] = useState(false);
  // -1 before the first play; lines.length once finished.
  const [idx, setIdx] = useState(-1);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [loop, setLoop] = useState(false);
  const bell = useBell();
  const stopper = useRef<Playback | null>(null);
  const pausedRef = useRef(false);

  // Script editing + re-record state.
  const [editScript, setEditScript] = useState(() => (made?.lines ?? []).join("\n"));
  const [rerecording, setRerecording] = useState(false);
  const [rrError, setRrError] = useState("");
  // One-step undo: the Made snapshot before the last re-record (D120).
  const [prevMade, setPrevMade] = useState<typeof made>(null);

  // Sync editScript when made changes externally (e.g. after a successful re-record),
  // but only when the edit matches the previous lines (user has not drifted further).
  const prevLinesRef = useRef<string[]>(made?.lines ?? []);
  useEffect(() => {
    if (!made) return;
    const prev = prevLinesRef.current.join("\n");
    if (editScript === prev) {
      setEditScript(made.lines.join("\n"));
    }
    prevLinesRef.current = made.lines;
  }, [made]); // eslint-disable-line react-hooks/exhaustive-deps

  const scriptDiffers = made ? editEnablesRerecord(made.lines, editScript) : false;

  const pauseNote = useRef(false);
  const clearPauseNote = () => {
    if (!pauseNote.current) return;
    pauseNote.current = false;
    setToast("");
  };
  const watch = useRef(
    pauseWatch(() => {
      pauseNote.current = true;
      setToast("Playback was paused while Neville was in the background. Tap Resume to continue.");
    }),
  ).current;
  const stop = useCallback(() => {
    stopper.current?.stop();
    stopper.current = null;
    pausedRef.current = false;
    watch.reset();
    pauseNote.current = false;
    setPlaying(false);
    setPaused(false);
  }, [watch]);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      const pb = stopper.current;
      watch.appState(st, !!pb?.active() && !pausedRef.current, pausedRef.current);
      if (Platform.OS === "web" || st !== "background" || !pb?.foregroundOnly || !pb.active()) return;
      stop();
      setToast("Playback stopped when you left Neville. Tap Play to start again.");
    });
    return () => sub.remove();
  }, [stop, watch]);

  if (c.making) return <Redirect href="/create/script" />;
  if (!made) return <Redirect href="/create" />;

  const done = idx >= made.lines.length;
  const start = () => {
    stop();
    setToast("");
    setIdx(0);
    setPlaying(true);
    stopper.current = play(made, {
      onLine: setIdx,
      onEnd: () => (setPlaying(false), setPaused(false), setIdx(made.lines.length)),
      onError: (m) => (setPlaying(false), setPaused(false), setToast(m)),
      onPlaying: (p) => ((pausedRef.current = !p), setPaused(!p), p && clearPauseNote(), watch.playing(p)),
      onWarn: setToast,
    }, { loop, bell, music: MUSIC_ENABLED });
  };
  const again = () => {
    stop();
    if (newVariation()) router.back();
  };
  const keep = async () => {
    if (saving) return;
    if (c.savedId) return stop(), router.push(`/player/${c.savedId}`);
    setSaving(true);
    try {
      await save();
      setToast("Saved to your library.");
    } catch (e) {
      setToast(e instanceof Error && e.message ? e.message : "Could not save on this device.");
    }
    setSaving(false);
  };
  const goToPlaylist = async () => {
    if (!c.savedId) {
      if (saving) return;
      setSaving(true);
      try {
        await save();
      } catch (e) {
        setToast(e instanceof Error && e.message ? e.message : "Could not save on this device.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    router.push(LIBRARY_TAB_ROUTE);
  };
  const back = () => {
    stop();
    leave();
    router.dismissTo("/create");
  };

  const rerecord = async () => {
    if (rerecording) return;
    const lines = linesFromText(editScript);
    if (!lines.length) return;
    stop();
    setRerecording(true);
    setRrError("");
    const snapshot = made; // capture before updateMade changes c.made
    try {
      const voiceId = made.recording?.voiceId ?? c.voiceId;
      const r = await api.rerecord(lines, voiceId);
      await updateMade(r.audio, r.mime, r.voiceId, lines);
      setPrevMade(snapshot);
      setToast("New recording ready. Tap Play to hear it.");
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      const msg = e instanceof ApiError ? e.message : undefined;
      setRrError(rrErrorMessage(code, msg));
    } finally {
      setRerecording(false);
    }
  };

  const undoNativeRerecord = async () => {
    if (!prevMade?.recording) return;
    const r = prevMade.recording;
    await updateMade(r.audio, r.mime, r.voiceId, prevMade.lines);
    setEditScript(prevMade.lines.join("\n"));
    setPrevMade(null);
    setToast("");
    setRrError("");
  };

  if (rerecording) {
    return (
      <Screen title={made.title}>
        <Stack.Screen options={{ title: "Your recording" }} />
        <Text style={s.muted}>Recording in progress. This takes up to half a minute.</Text>
        <WaitingPhrases />
        <Text style={s.muted}>Keep this screen open.</Text>
      </Screen>
    );
  }

  return (
    <Screen title={made.title}>
      <Stack.Screen options={{ title: "Your recording" }} />
      <Text style={s.muted}>{done ? "Finished. Play it again, or try a new variation." : "Tap play, close your eyes."}</Text>
      {made.note ? <Text style={s.muted}>{made.note}</Text> : null}
      {!made.recording && made.attemptId ? (
        <View style={s.row}>
          <Text style={s.muted}>Code: {codeRef(made.attemptId)}</Text>
          <Button small label="Copy" onPress={() => void Share.share({ message: copyLine(made.attemptId!, made.build ?? "") })} />
        </View>
      ) : null}
      <View style={[s.card, s.stage]} accessibilityLiveRegion="polite">
        <Text style={s.spoken} adjustsFontSizeToFit numberOfLines={3}>{done ? CLOSING : idx >= 0 ? made.lines[idx] : ""}</Text>
      </View>
      <View style={s.row}>
        {paused ? <Button label="▶ Resume" onPress={() => (setPaused(false), clearPauseNote(), stopper.current?.resume())} /> : null}
        {playing ? <Button label="■ Stop" onPress={stop} /> : <Button label={done ? "▶ Play again" : "▶ Play"} onPress={start} />}
        <Button small label={c.savedId ? "✓ Saved · Open" : saving ? "Saving…" : "Save"} onPress={keep} />
        <Button small label="New variation" onPress={again} />
        <Button small label={playlistLabel(c.savedId ?? "")} disabled={saving} onPress={goToPlaylist} />
      </View>
      {made.recording ? <PlayOptions loop={{ value: loop, onChange: setLoop }} bell={{ value: bell, onChange: (v) => void setBell(v), disabled: !loop }} disabled={playing} /> : null}
      {toast ? <Text accessibilityRole="alert" style={s.muted}>{toast}</Text> : null}
      {rrError ? <Text accessibilityRole="alert" style={[s.muted, { color: colors.warn }]}>{rrError}</Text> : null}
      {!made.recording && !canSpeak() ? <Text style={s.muted}>This device has no built-in speech here, so the lines are shown in time instead.</Text> : null}

      {/* Editable script */}
      <TextInput
        accessibilityLabel="Script"
        value={editScript}
        onChangeText={(t) => { setEditScript(t); setRrError(""); }}
        multiline
        style={[s.card, { color: colors.text, minHeight: 120, textAlignVertical: "top", lineHeight: 22, padding: space.md }]}
        editable={!playing}
      />
      {scriptDiffers && (
        <Button label="Re-record" onPress={() => void rerecord()} disabled={playing} />
      )}
      {prevMade && !scriptDiffers && (
        <Button small label="Undo re-record" onPress={() => void undoNativeRerecord()} />
      )}

      <Text style={s.muted}>
        {made.recording
          ? `Recorded in the voice of ${made.recording.voiceName}. ${c.savedId ? "Saved in your library." : "Not kept unless you tap Save."}`
          : canSpeak()
            ? "Read by your device's own voice. Nothing was recorded."
            : "Nothing was recorded."}
      </Text>
      <View style={s.row}>
        <Text style={s.muted}>
          Next variation: <Text style={s.p}>{c.voiceName}</Text>
        </Text>
        <Button small label="Change voice" onPress={() => (stop(), router.push("/create/voice"))} />
      </View>
      {c.gate || done || !canCreate(signedIn, c.used) ? <Gate signedIn={signedIn} /> : null}
      <View style={s.row}>
        <Button small label="← Create another" onPress={back} />
      </View>
    </Screen>
  );
}
