import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { freeLeft } from "@/lib/create";
import { CLOSING } from "@/lib/prompt";
import { play } from "../../src/create/playback";
import { canSpeak, leave, newVariation, useCreate } from "../../src/create/session";
import { Button, Gate, s } from "../../src/create/ui";
import { Screen } from "../../src/ui/Screen";

// Create, step 3: the recording. Plays it and follows the lines. Without a recording the
// device reads the script, or shows the lines in time.
export default function Recording() {
  const c = useCreate();
  const router = useRouter();
  const made = c.made;
  const [playing, setPlaying] = useState(false);
  // -1 before the first play; lines.length once finished.
  const [idx, setIdx] = useState(-1);
  const [toast, setToast] = useState("");
  const stopper = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopper.current?.();
    stopper.current = null;
    setPlaying(false);
  }, []);
  // Leaving the step always ends playback.
  useEffect(() => stop, [stop]);

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
      onEnd: () => (setPlaying(false), setIdx(made.lines.length)),
      onError: (m) => (setPlaying(false), setToast(m)),
    });
  };
  const again = () => {
    stop();
    if (newVariation()) router.back();
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
        {playing ? <Button label="■ Stop" onPress={stop} /> : <Button label={done ? "▶ Play again" : "▶ Play"} onPress={start} />}
        <Button small label="New variation" onPress={again} />
      </View>
      {toast ? <Text accessibilityRole="alert" style={s.muted}>{toast}</Text> : null}
      {!made.recording && !canSpeak() ? <Text style={s.muted}>This device has no built-in speech here, so the lines are shown in time instead.</Text> : null}
      <View style={s.card}>
        {made.lines.map((l, i) => (
          <Text key={i} style={[s.line, i === idx && s.now]}>{l}</Text>
        ))}
      </View>
      <Text style={s.muted}>
        {made.recording
          ? `Recorded in the voice of ${made.recording.voiceName}. Not kept: saving comes with the Library.`
          : canSpeak()
            ? "Read by your device's own voice. Nothing was recorded."
            : "Nothing was recorded."}
      </Text>
      {c.gate || done || freeLeft(c.used) === 0 ? <Gate /> : null}
      <View style={s.row}>
        <Button small label="← Create another" onPress={back} />
      </View>
    </Screen>
  );
}
