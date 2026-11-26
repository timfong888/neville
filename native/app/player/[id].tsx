import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { buildQueue, gapClip, repeatsFor, roundAt } from "@/lib/playerQueue";
import { DEFAULT_REPEAT_MINUTES, REPEAT_MINUTES } from "@/lib/repetition";
import { audio } from "../../src/seams/audio";
import type { Manifestation } from "@/lib/library/model";
import { nowPlaying, useNowPlaying } from "../../src/player/nowPlayingStore";
import { inOrder } from "../../src/player/copies";
import { DEMO_ID, demoAudioUri, demoItem } from "../../src/player/demo";
import { DEFAULT_LOOP, LOOP_GAP_MS, type LoopMode, loopQueue, makeLoopStore, playerGapName, playerLoop } from "../../src/player/loop";
import { kv } from "../../src/seams/kv";
import { library } from "../../src/seams/library";
import { colors } from "../../src/theme";
import { Screen } from "../../src/ui/Screen";

const loopStore = makeLoopStore(kv);
// The Player loops this one item. Looping the whole Library starts from the Library screen.
const PLAYER_LOOPS: readonly LoopMode[] = ["off", "one"];
const LOOP_LABEL: Record<LoopMode, string> = { off: "Off", one: "One", all: "All" };

// The Player (#122): one saved item, opened by id. It starts a job on the app-level controller (#161), which
// plays the recording, then again for the chosen minutes with an optional bell, or on a loop. The playing
// belongs to the controller, so it goes on when this screen closes and shows here again when it reopens.
export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Manifestation | null | undefined>(undefined);
  const [minutes, setMinutes] = useState<number>(DEFAULT_REPEAT_MINUTES);
  const [bellOn, setBellOn] = useState(true);
  // Off or one (#157): whether this item repeats until stopped.
  const [loop, setLoop] = useState<LoopMode>(DEFAULT_LOOP);
  // Set once the listener picks a mode, so the stored choice, read later, does not replace it.
  const picked = useRef(false);
  const voice = useRef<{ src: string; seconds: number } | null>(null);
  const np = useNowPlaying();

  useEffect(() => {
    let live = true;
    voice.current = null;
    setLoaded(undefined);
    audio.configure().catch(() => {});
    picked.current = false;
    void loopStore.read().then((m) => live && !picked.current && setLoop(playerLoop(m)));
    (async () => {
      // `/player/demo` is a built-in test tone. Every other id comes from the library seam.
      const demo = String(id) === DEMO_ID;
      const it = demo ? demoItem : await library.get(String(id)).catch(() => null);
      // The library owns its address and may free it at any time, so the Player plays its own copy.
      const own = (u: string | null) => inOrder(() => (u && live ? audio.keep("player-voice", u) : Promise.resolve(null)));
      const src = !it?.hasAudio ? null : await (demo ? demoAudioUri() : library.audioUri(it.id).then(own)).catch(() => null);
      if (src) {
        // The length is read now, so Play does not wait and the browser still counts it as a tap.
        const seconds = await audio.duration(src);
        if (live) voice.current = { src, seconds };
      }
      if (live) setLoaded(it);
    })();
    return () => void (live = false);
  }, [id]);

  const play = () => {
    const v = voice.current;
    if (!v || !loaded) return;
    const item = loaded;
    const looping = loop === "one";
    const repeats = looping ? 0 : repeatsFor(v.seconds, minutes);
    void nowPlaying.play({
      id: item.id,
      title: item.title || "Neville",
      route: `/player/${item.id}`,
      empty: "",
      prepare: async () => {
        const gap = repeats || looping ? await audio.save(playerGapName(looping, bellOn), gapClip(bellOn, looping ? LOOP_GAP_MS : undefined), "audio/wav") : "";
        const clips = looping ? loopQueue("one", [], item.id, gap, { id: item.id, src: v.src, title: item.title }).clips : buildQueue(v.src, gap, repeats);
        return { clips, loop: looping, at: (i) => ({ title: item.title, position: roundAt(i).round, total: repeats + 1 }) };
      },
    });
  };

  if (loaded === undefined) return <Screen><Text style={s.p}>Loading…</Text></Screen>;
  if (loaded === null) return <Screen><Text style={s.p}>This item is not saved on this device.</Text></Screen>;

  const item = loaded;
  // The controller plays one thing at a time; this screen shows it only when it is this item.
  const mine = np.id === item.id;
  const phase = mine && (np.status === "playing" || np.status === "paused") ? np.status : "idle";
  const busy = mine && np.status === "preparing";
  const note = mine && np.status === "idle" ? np.note : "";
  const active = phase !== "idle";
  const at = roundAt(mine ? np.index : 0);
  const plays = np.total;
  const pick = (m: LoopMode) => {
    picked.current = true;
    setLoop(m);
    void loopStore.write(m);
  };
  return (
    <Screen>
      <Text style={s.h1} accessibilityRole="header">{item.title || "Untitled"}</Text>
      {item.voiceName ? <Text style={s.dim}>Voice: {item.voiceName}</Text> : null}
      {voice.current ? (
        <View style={s.row}>
          <Pressable
            style={[s.btn, s.main]}
            accessibilityRole="button"
            accessibilityLabel={phase === "playing" ? "Pause" : "Play"}
            onPress={() => (phase === "idle" ? play() : nowPlaying.toggle())}
          >
            <Text style={s.mainText}>{phase === "playing" ? "Pause" : phase === "paused" ? "Resume" : "Play"}</Text>
          </Pressable>
          {active ? (
            <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel="Stop" onPress={() => nowPlaying.stop()}>
              <Text style={s.btnText}>Stop</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={s.p}>
          {loaded.hasAudio
            ? "This recording could not be loaded. Go back and open it again."
            : "No recording is saved with this one, so there is nothing to play yet."}
        </Text>
      )}
      {active ? (
        <Text style={s.p} accessibilityLiveRegion="polite">
          {loop === "one" ? `Repeating${at.inGap ? ", pause" : ""}`
            : plays > 1 ? `Play ${at.round} of ${plays}${at.inGap ? (bellOn ? ", bell" : ", pause") : ""}` : "Playing once"}
        </Text>
      ) : note ? (
        <Text style={s.p}>{note}</Text>
      ) : null}

      <Text style={s.label}>Loop{active ? " (stop to change)" : ""}</Text>
      <View style={s.row}>
        {PLAYER_LOOPS.map((m) => (
          <Pressable
            key={m}
            disabled={active || busy}
            style={[s.chip, loop === m && s.on, (active || busy) && s.off]}
            accessibilityRole="radio"
            accessibilityState={{ selected: loop === m, disabled: active || busy }}
            accessibilityLabel={`Loop ${LOOP_LABEL[m]}`}
            onPress={() => pick(m)}
          >
            <Text style={s.btnText}>{LOOP_LABEL[m]}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.dim}>{loop === "one" ? "Repeats this recording until you stop it. To loop everything, use Play all on loop in the Library." : "Plays once, then repeats for the minutes below."}</Text>
      <Text style={s.label}>Repetition after the first play{loop !== "off" ? " (Off while looping)" : active ? " (stop to change)" : ""}</Text>
      <View style={s.row}>
        {REPEAT_MINUTES.map((m) => (
          <Pressable
            key={m}
            disabled={active || loop !== "off"}
            style={[s.chip, minutes === m && s.on, (active || loop !== "off") && s.off]}
            accessibilityRole="radio"
            accessibilityState={{ selected: minutes === m, disabled: active || loop !== "off" }}
            accessibilityLabel={m ? `${m} minutes` : "Off"}
            onPress={() => setMinutes(m)}
          >
            <Text style={s.btnText}>{m ? `${m} min` : "Off"}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.row, s.spread]}>
        <Text style={s.p}>A soft bell between plays</Text>
        <Switch accessibilityLabel="A soft bell between plays" value={bellOn} onValueChange={setBellOn} disabled={active || (minutes === 0 && loop === "off")} />
      </View>

      <View style={s.script}>
        {item.lines.map((l, i) => (
          <Text key={i} style={s.line}>{l}</Text>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  h1: { color: colors.text, fontSize: 28, fontWeight: "600" },
  p: { color: "#c9ced8", fontSize: 16 },
  dim: { color: colors.muted, fontSize: 14 },
  label: { color: colors.muted, fontSize: 14, marginTop: 8 },
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
