import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { buildQueue, gapClip, repeatsFor, roundAt } from "@/lib/playerQueue";
import { DEFAULT_REPEAT_MINUTES, REPEAT_MINUTES } from "@/lib/repetition";
import { audio } from "../../src/seams/audio";
import type { Manifestation } from "@/lib/library/model";
import { library } from "../../src/player/libraryStub";
import type { PlaySession } from "../../src/seams/types";

type Phase = "idle" | "playing" | "paused";

// The Player (#122): one saved item, opened by id. It plays the recording, then
// plays it again for the chosen minutes with an optional bell between plays.
// All audio goes through the audio seam, so this screen is the same on iOS and web.
export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Manifestation | null | undefined>(undefined);
  const [minutes, setMinutes] = useState<number>(DEFAULT_REPEAT_MINUTES);
  const [bellOn, setBellOn] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [index, setIndex] = useState(0);
  const [plays, setPlays] = useState(1);
  const [note, setNote] = useState("");
  const voice = useRef<{ src: string; seconds: number } | null>(null);
  const session = useRef<PlaySession | null>(null);

  const stop = (message = "") => {
    session.current?.stop();
    session.current = null;
    setPhase("idle");
    setIndex(0);
    setNote(message);
  };

  useEffect(() => {
    let live = true;
    let made = "";
    voice.current = null;
    setLoaded(undefined);
    audio.configure().catch(() => {});
    (async () => {
      const it = await library.get(String(id)).catch(() => null);
      const src = it?.hasAudio ? await library.audioUri(it.id).catch(() => null) : null;
      if (src) {
        made = src;
        // The length is read now, so Play does not wait and the browser still counts it as a tap.
        const seconds = await audio.duration(src);
        if (live) voice.current = { src, seconds };
      }
      if (live) setLoaded(it);
    })();
    return () => {
      live = false;
      session.current?.stop();
      session.current = null;
      if (made.startsWith("blob:")) URL.revokeObjectURL(made);
    };
  }, [id]);

  const play = async () => {
    if (session.current) return session.current.play();
    const v = voice.current;
    if (!v || !loaded) return;
    try {
      const repeats = repeatsFor(v.seconds, minutes);
      const gap = repeats ? await audio.save(bellOn ? "player-gap-bell.wav" : "player-gap.wav", gapClip(bellOn), "audio/wav") : "";
      setPlays(repeats + 1);
      setNote("");
      const s = audio.open(buildQueue(v.src, gap, repeats), {
        title: loaded.title || "Neville",
        onState: (st) => {
          if (session.current !== s) return;
          if (st.failed) return stop("This recording could not be played.");
          if (st.ended) return stop("Finished.");
          setIndex(st.index);
          setPhase(st.playing ? "playing" : "paused");
        },
      });
      session.current = s;
      setPhase("playing");
      s.play();
    } catch (e) {
      stop(`Could not play: ${e instanceof Error ? e.message : e}`);
    }
  };

  if (loaded === undefined) return <Shell><Text style={s.p}>Loading…</Text></Shell>;
  if (loaded === null) return <Shell><Text style={s.p}>This item is not saved on this device.</Text></Shell>;

  const item = loaded;
  const active = phase !== "idle";
  const at = roundAt(index);
  return (
    <Shell>
      <Text style={s.h1} accessibilityRole="header">{item.title || "Untitled"}</Text>
      {item.voiceName ? <Text style={s.dim}>Voice: {item.voiceName}</Text> : null}
      {voice.current ? (
        <View style={s.row}>
          <Pressable
            style={[s.btn, s.main]}
            accessibilityRole="button"
            accessibilityLabel={phase === "playing" ? "Pause" : "Play"}
            onPress={() => (phase === "playing" ? session.current?.pause() : play())}
          >
            <Text style={s.mainText}>{phase === "playing" ? "Pause" : phase === "paused" ? "Resume" : "Play"}</Text>
          </Pressable>
          {active ? (
            <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel="Stop" onPress={() => stop()}>
              <Text style={s.btnText}>Stop</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={s.p}>No recording is saved with this one, so there is nothing to play yet.</Text>
      )}
      {active ? (
        <Text style={s.p} accessibilityLiveRegion="polite">
          {plays > 1 ? `Play ${at.round} of ${plays}${at.inGap ? (bellOn ? ", bell" : ", pause") : ""}` : "Playing once"}
        </Text>
      ) : note ? (
        <Text style={s.p}>{note}</Text>
      ) : null}

      <Text style={s.label}>Repetition after the first play{active ? " (stop to change)" : ""}</Text>
      <View style={s.row}>
        {REPEAT_MINUTES.map((m) => (
          <Pressable
            key={m}
            disabled={active}
            style={[s.chip, minutes === m && s.on, active && s.off]}
            accessibilityRole="radio"
            accessibilityState={{ selected: minutes === m, disabled: active }}
            accessibilityLabel={m ? `${m} minutes` : "Off"}
            onPress={() => setMinutes(m)}
          >
            <Text style={s.btnText}>{m ? `${m} min` : "Off"}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.row, s.spread]}>
        <Text style={s.p}>A soft bell between plays</Text>
        <Switch accessibilityLabel="A soft bell between plays" value={bellOn} onValueChange={setBellOn} disabled={active || minutes === 0} />
      </View>

      <View style={s.script}>
        {item.lines.map((l, i) => (
          <Text key={i} style={s.line}>{l}</Text>
        ))}
      </View>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Link href="/" style={s.link}>Back</Link>
      {children}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 24, paddingTop: 64, gap: 14, backgroundColor: "#151820", minHeight: "100%" },
  h1: { color: "#fff", fontSize: 28, fontWeight: "600" },
  p: { color: "#c9ced8", fontSize: 16 },
  dim: { color: "#9aa3b5", fontSize: 14 },
  label: { color: "#9aa3b5", fontSize: 14, marginTop: 8 },
  link: { color: "#8ab4ff", fontSize: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  spread: { justifyContent: "space-between" },
  btn: { borderColor: "#c9ced8", borderWidth: 1, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 22, minWidth: 96, alignItems: "center" },
  main: { backgroundColor: "#fff", borderColor: "#fff", flexGrow: 1 },
  mainText: { color: "#151820", fontSize: 18, fontWeight: "600" },
  btnText: { color: "#fff", fontSize: 16 },
  chip: { borderColor: "#c9ced8", borderWidth: 1, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
  on: { backgroundColor: "#2a3142", borderColor: "#8ab4ff" },
  off: { opacity: 0.5 },
  script: { gap: 10, marginTop: 8 },
  line: { color: "#e6e9ef", fontSize: 18, lineHeight: 26 },
});
