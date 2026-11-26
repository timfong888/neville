import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { canCreate, isSignedIn } from "@/lib/createGate";
import { useAccount } from "../../src/accountStore";
import { CLOSING } from "@/lib/prompt";
import { type Playback, play } from "../../src/create/playback";
import { pauseWatch } from "../../src/create/pauseWatch";
import { canSpeak, leave, newVariation, save, useCreate } from "../../src/create/session";
import { Button, Gate, s } from "../../src/create/ui";
import { setBell, useBell } from "../../src/player/bellStore";
import { musicNow, useMusic } from "../../src/player/musicStore";
import { PlayOptions } from "../../src/ui/PlayOptions";
import { Screen } from "../../src/ui/Screen";

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
  const music = useMusic();
  const bell = useBell();
  const stopper = useRef<Playback | null>(null);
  // For the reason shown when the system paused playback while the app was away.
  const pausedRef = useRef(false);

  // The pause note is on screen, so Resume takes it away; other messages stay.
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
  // Leaving the step always ends playback.
  useEffect(() => stop, [stop]);
  // The device voice and the timed lines cannot run in the background. Say so rather than go silent.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      // Not `inactive`: iOS sends it for Control Center and call banners while the app is still in front.
      const pb = stopper.current;
      watch.appState(st, !!pb?.active() && !pausedRef.current, pausedRef.current);
      // A browser keeps reading and running timers in a hidden tab; only a phone suspends them.
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
    }, { loop, bell, music: musicNow(music) });
  };
  const again = () => {
    stop();
    if (newVariation()) router.back();
  };
  // Saves once and stays here, as the website does. Once saved, the button opens the item in the player.
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
  const back = () => {
    stop();
    leave();
    router.dismissTo("/create");
  };

  return (
    <Screen title={made.title}>
      <Stack.Screen options={{ title: "Your recording" }} />
      <Text style={s.muted}>{done ? "Finished. Play it again, or try a new variation." : "Tap play, close your eyes."}</Text>
      {made.note ? <Text style={s.muted}>{made.note}</Text> : null}
      <View style={[s.card, s.stage]} accessibilityLiveRegion="polite">
        <Text style={s.spoken}>{done ? CLOSING : idx >= 0 ? made.lines[idx] : ""}</Text>
      </View>
      <View style={s.row}>
        {paused ? <Button label="▶ Resume" onPress={() => (setPaused(false), clearPauseNote(), stopper.current?.resume())} /> : null}
        {playing ? <Button label="■ Stop" onPress={stop} /> : <Button label={done ? "▶ Play again" : "▶ Play"} onPress={start} />}
        <Button small label={c.savedId ? "✓ Saved · Open" : saving ? "Saving…" : "Save"} onPress={keep} />
        <Button small label="New variation" onPress={again} />
      </View>
      {made.recording ? <PlayOptions loop={{ value: loop, onChange: setLoop }} bell={{ value: bell, onChange: (v) => void setBell(v), disabled: !loop }} disabled={playing} /> : null}
      {toast ? <Text accessibilityRole="alert" style={s.muted}>{toast}</Text> : null}
      {!made.recording && !canSpeak() ? <Text style={s.muted}>This device has no built-in speech here, so the lines are shown in time instead.</Text> : null}
      <View style={s.card}>
        {made.lines.map((l, i) => (
          <Text key={i} style={[s.line, i === idx && s.now]}>{l}</Text>
        ))}
      </View>
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
