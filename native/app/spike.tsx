import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { audio } from "../src/seams/audio";
import type { PlayHandle } from "../src/seams/types";
import { makeFiles } from "../src/spike";

// Audio spike (#85). Three ways to loop a short refrain, with the screen locked.
// What to listen for: a gap or click at each repeat, lock-screen controls, and
// whether it keeps going for minutes with the phone locked.
type Mode = "loop" | "playlist" | "long";
const REPEATS = 80; // 80 x 1.5 s = 2 minutes in the long file

export default function Spike() {
  const [bellOn, setBellOn] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const handle = useRef<PlayHandle | null>(null);
  const say = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 12));

  useEffect(() => {
    // Background playback and lock-screen controls need this mode (doNotMix).
    audio
      .configure()
      .then(() => say("audio mode set"))
      .catch((e) => say(`audio mode failed: ${e}`));
    return () => stop();
  }, []);

  const stop = () => {
    try {
      handle.current?.stop();
    } catch {}
    handle.current = null;
    setMode(null);
  };

  const start = async (m: Mode) => {
    stop();
    try {
      const f = await makeFiles(REPEATS, bellOn);
      const title = `Spike: ${m}${bellOn ? " + bell" : ""}`;
      // Native sequencing is gapless; the same list plays on the web with chained events.
      handle.current =
        m === "playlist"
          ? audio.playSequence(bellOn ? [f.single, f.bell] : [f.single], { title })
          : audio.play(m === "loop" ? f.single : f.long, { loop: m === "loop", title });
      setMode(m);
      say(`started: ${m}${bellOn ? " + bell" : ""}`);
    } catch (e) {
      say(`failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const Btn = ({ m, label, note }: { m: Mode; label: string; note: string }) => (
    <Pressable style={[s.btn, mode === m && s.on]} onPress={() => start(m)}>
      <Text style={s.btnText}>{label}</Text>
      <Text style={s.note}>{note}</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.h1}>Audio spike</Text>
      <Text style={s.p}>Start one, lock the phone, listen for gaps, check the lock screen.</Text>
      <View style={s.row}>
        <Text style={s.p}>Bell between repeats</Text>
        <Switch value={bellOn} onValueChange={setBellOn} />
      </View>
      <Btn m="loop" label="1. Loop flag" note="One 1.5 s file, player.loop = true" />
      <Btn m="playlist" label="2. Playlist, loop all" note="Native gapless sequencing" />
      <Btn m="long" label="3. One long file" note={`${REPEATS} repeats rendered into one WAV`} />
      <Pressable style={s.btn} onPress={stop}>
        <Text style={s.btnText}>Stop</Text>
      </Pressable>
      {log.map((l, i) => (
        <Text key={i} style={s.log}>{l}</Text>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 24, paddingTop: 64, gap: 12, backgroundColor: "#151820", minHeight: "100%" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "600" },
  p: { color: "#c9ced8", fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  btn: { borderColor: "#c9ced8", borderWidth: 1, borderRadius: 8, padding: 14, gap: 4 },
  on: { backgroundColor: "#2a3142" },
  btnText: { color: "#fff", fontSize: 17 },
  note: { color: "#9aa3b5", fontSize: 13 },
  log: { color: "#9aa3b5", fontSize: 12, fontFamily: "Menlo" },
});
