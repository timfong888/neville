import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { type AudioPlayer, type AudioPlaylist, createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from "expo-audio";
import { type Mode, makeFiles } from "../src/spike";

// Audio spike (#85). Three ways to loop a short refrain, with the screen locked.
// What to listen for: a gap or click at each repeat, lock-screen controls, and
// whether it keeps going for minutes with the phone locked.
const REPEATS = 80; // long file: 80 x 1.5 s = 2 minutes, or about 4.4 minutes with the bell (each gap grows to the 1.8 s bell)

export default function Spike() {
  const [bellOn, setBellOn] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const player = useRef<AudioPlayer | null>(null);
  const list = useRef<AudioPlaylist | null>(null);
  const say = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 12));

  useEffect(() => {
    // Background playback and lock-screen controls need this mode (doNotMix).
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" })
      .then(() => say("audio mode set"))
      .catch((e) => say(`audio mode failed: ${e}`));
    return () => stop();
  }, []);

  const stop = () => {
    try {
      player.current?.pause();
      player.current?.clearLockScreenControls();
      player.current?.remove();
      list.current?.pause();
      list.current?.clearLockScreenControls();
      list.current?.destroy();
    } catch {}
    player.current = null;
    list.current = null;
    setMode(null);
  };

  const start = (m: Mode) => {
    stop();
    try {
      const f = makeFiles(m, REPEATS, bellOn);
      const meta = { title: `Spike: ${m}${bellOn ? " + bell" : ""}`, artist: "Neville" };
      if (m === "playlist") {
        // Native gapless sequencing: refrain, (bell), refrain, ... looping the whole list.
        const l = createAudioPlaylist({ sources: f.sources, loop: "all", updateInterval: 250 });
        l.setActiveForLockScreen(true, meta);
        l.play();
        list.current = l;
      } else {
        const p = createAudioPlayer(f.sources[0], { updateInterval: 250 });
        p.loop = m === "loop";
        p.setActiveForLockScreen(true, meta, { showSeekBackward: false, showSeekForward: false });
        p.addListener("playbackStatusUpdate", (s) => {
          if (s.didJustFinish) say("finished");
        });
        p.play();
        player.current = p;
      }
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
