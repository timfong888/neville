import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { lineForProgress } from "@/lib/create";
import { lineStarts as charLineStarts } from "@/lib/audio";
import { activePhrase, MAX_PHRASE_WORDS, progressWithinLine } from "@/lib/phraseBox";
import { displayTitle } from "@/lib/script";
import { buildQueue, gapClip, roundAt } from "@/lib/playerQueue";
import { planSession } from "@/lib/session/planSession";
import { audio } from "../../src/seams/audio";
import type { Manifestation } from "@/lib/library/model";
import { nowPlaying, useNowPlaying } from "../../src/player/nowPlayingStore";
import { inOrder } from "../../src/player/copies";
import { MUSIC_ENABLED } from "../../src/player/musicStore";
import { DEMO_ID, demoAudioUri, demoItem } from "../../src/player/demo";
import { LOOP_GAP_MS, loopQueue, playerGapName } from "../../src/player/loop";
import { kv } from "../../src/seams/kv";
import { library } from "../../src/seams/library";
import { colors } from "../../src/theme";
import { PhraseBox } from "../../src/ui/PhraseBox";
import { PlayOptions } from "../../src/ui/PlayOptions";
import { Screen } from "../../src/ui/Screen";
import {
  DEFAULT_LOOPS,
  DEFAULT_SESSION_MODE,
  DEFAULT_TIME,
  MAX_LOOPS,
  SESSION_MODES,
  TIME_OPTIONS,
  makeSessionStore,
  type SessionMode,
} from "../../src/player/sessionStore";

const sessionStore = makeSessionStore(kv);

const SESSION_LABEL: Record<SessionMode, string> = { "until-stopped": "Until I stop", loops: "Loops", time: "Time" };

// The Player (#122): one saved item, opened by id. It starts a job on the app-level controller (#161), which
// plays the recording, then again for the chosen minutes with an optional bell, or on a loop. The playing
// belongs to the controller, so it goes on when this screen closes and shows here again when it reopens.
export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Manifestation | null | undefined>(undefined);
  const [bellOn, setBellOn] = useState(true);
  const [sessionMode, setSessionMode] = useState<SessionMode>(DEFAULT_SESSION_MODE);
  const [sessionTarget, setSessionTarget] = useState<number>(DEFAULT_TIME);
  const picked = useRef(false);
  const voice = useRef<{ src: string; seconds: number } | null>(null);
  const lastLineRef = useRef(0);
  const np = useNowPlaying();
  // Use audio-based line starts when stored (new recordings); fall back to character-count.
  const starts = useMemo(
    () => (loaded ? (loaded.lineStarts ?? charLineStarts(loaded.lines)) : []),
    [loaded],
  );

  useEffect(() => {
    let live = true;
    voice.current = null;
    lastLineRef.current = 0;
    setLoaded(undefined);
    audio.configure().catch(() => {});
    picked.current = false;
    void sessionStore.readMode().then((m) => {
      if (!live || picked.current) return;
      setSessionMode(m);
      void sessionStore.readTarget(m).then((t) => live && !picked.current && setSessionTarget(t));
    });
    (async () => {
      const demo = String(id) === DEMO_ID;
      const it = demo ? demoItem : await library.get(String(id)).catch(() => null);
      const own = (u: string | null) => inOrder(() => (u && live ? audio.keep("player-voice", u) : Promise.resolve(null)));
      const src = !it?.hasAudio ? null : await (demo ? demoAudioUri() : library.audioUri(it.id).then(own)).catch(() => null);
      if (src) {
        const seconds = await audio.duration(src);
        if (live) voice.current = { src, seconds };
      }
      if (live) setLoaded(it);
    })();
    return () => void (live = false);
  }, [id]);

  const pickMode = (m: SessionMode) => {
    picked.current = true;
    setSessionMode(m);
    void sessionStore.writeMode(m);
    const t = m === "loops" ? DEFAULT_LOOPS : DEFAULT_TIME;
    setSessionTarget(t);
    void sessionStore.writeTarget(t);
  };

  const pickTarget = (t: number) => {
    setSessionTarget(t);
    void sessionStore.writeTarget(t);
  };

  const plan = (() => {
    const v = voice.current;
    if (!v || sessionMode === "until-stopped") return null;
    const gapSec = LOOP_GAP_MS / 1000;
    const loopDur = v.seconds + gapSec;
    return planSession([loopDur], sessionMode, sessionTarget, undefined, gapSec);
  })();

  const play = () => {
    const v = voice.current;
    if (!v || !loaded) return;
    const item = loaded;
    const looping = sessionMode === "until-stopped";
    const repeats = plan?.loops != null ? plan.loops - 1 : 0;
    void nowPlaying.play({
      id: item.id,
      title: item.title || "Neville",
      route: `/player/${item.id}`,
      empty: "",
      prepare: async () => {
        const hasGap = looping || repeats > 0;
        const gap = hasGap
          ? await audio.save(playerGapName(looping, bellOn), gapClip(bellOn, LOOP_GAP_MS), "audio/wav")
          : "";
        const clips = looping
          ? loopQueue("one", [], item.id, gap, { id: item.id, src: v.src, title: item.title }).clips
          : buildQueue(v.src, gap, repeats);
        const total = plan?.loops ?? 1;
        return { clips, loop: looping, music: MUSIC_ENABLED, at: (i) => ({ title: item.title, position: roundAt(i).round, total }) };
      },
    });
  };

  if (loaded === undefined) return <Screen><Text style={s.p}>Loading…</Text></Screen>;
  if (loaded === null) return <Screen><Text style={s.p}>This item is not saved on this device.</Text></Screen>;

  const item = loaded;
  const mine = np.id === item.id;
  const phase = mine && (np.status === "playing" || np.status === "stopped-mid") ? np.status : "idle";

  if (mine && phase !== "idle") {
    const l = lineForProgress(np.index, np.progress, starts);
    if (l !== null) lastLineRef.current = l;
  }
  const currentLine: number | null = mine && phase !== "idle" ? lastLineRef.current : null;
  const currentPhrase: string | null = (() => {
    if (currentLine === null) return null;
    const lineText = item.lines[currentLine] ?? "";
    if (!lineText.trim()) return null;
    // Show whole line (which is a short phrase in new recordings per issue 306).
    // Fall back to phrase-splitting for old recordings with long lines.
    if (lineText.trim().split(/\s+/).length <= MAX_PHRASE_WORDS) return lineText;
    const lineProg = progressWithinLine(currentLine, starts, np.progress);
    return activePhrase(lineText, lineProg);
  })();
  const busy = mine && np.status === "preparing";
  const rawNote = mine && np.status === "idle" ? np.note : "";
  const note = rawNote === "Finished." ? "Session complete." : rawNote;
  const active = phase !== "idle";
  const shownLoop = sessionMode === "until-stopped";
  const at = roundAt(mine ? np.index : 0);
  const plays = np.total;

  const loopsLeft = active && plan?.loops != null ? Math.max(0, plan.loops - at.round + (at.inGap ? 0 : 1)) : null;

  return (
    <Screen>
      <Text style={s.h1} accessibilityRole="header">{displayTitle(item.title) || "Untitled"}</Text>
      {item.voiceName ? <Text style={s.dim}>Voice: {item.voiceName}</Text> : null}
      {voice.current ? (
        <View style={s.row}>
          {phase === "stopped-mid" ? (
            <>
              <Pressable style={[s.btn, s.main]} accessibilityRole="button" accessibilityLabel="Resume" onPress={() => nowPlaying.resume()}>
                <Text style={s.mainText}>Resume</Text>
              </Pressable>
              <Pressable style={s.btn} accessibilityRole="button" accessibilityLabel="Start over" onPress={() => nowPlaying.stop()}>
                <Text style={s.btnText}>Start over</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[s.btn, s.main]}
              accessibilityRole="button"
              accessibilityLabel={phase === "playing" ? "Stop" : "Play"}
              onPress={() => (phase === "playing" ? nowPlaying.pause() : play())}
            >
              <Text style={s.mainText}>{phase === "playing" ? "Stop" : "Play"}</Text>
            </Pressable>
          )}
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
          {shownLoop
            ? `Repeating${at.inGap ? ", pause" : ""}`
            : loopsLeft !== null
              ? `${loopsLeft} loop${loopsLeft !== 1 ? "s" : ""} remaining`
              : plays > 1 ? `Play ${at.round} of ${plays}${at.inGap ? ", pause" : ""}` : "Playing once"}
        </Text>
      ) : note ? (
        <Text style={s.p}>{note}</Text>
      ) : null}

      {currentPhrase !== null ? <PhraseBox phrase={currentPhrase} /> : null}

      <Text style={s.label}>Session length{active ? " (stop to change)" : ""}</Text>
      <View style={s.row}>
        {SESSION_MODES.map((m) => (
          <Pressable
            key={m}
            disabled={active || busy}
            style={[s.chip, sessionMode === m && s.on, (active || busy) && s.off]}
            accessibilityRole="radio"
            accessibilityState={{ selected: sessionMode === m, disabled: active || busy }}
            accessibilityLabel={SESSION_LABEL[m]}
            onPress={() => pickMode(m)}
          >
            <Text style={s.btnText}>{SESSION_LABEL[m]}</Text>
          </Pressable>
        ))}
      </View>

      {sessionMode === "time" && !active ? (
        <>
          <View style={s.row}>
            {TIME_OPTIONS.map((m) => (
              <Pressable
                key={m}
                style={[s.chip, sessionTarget === m && s.on]}
                accessibilityRole="radio"
                accessibilityState={{ selected: sessionTarget === m }}
                accessibilityLabel={`${m} minutes`}
                onPress={() => pickTarget(m)}
              >
                <Text style={s.btnText}>{m} min</Text>
              </Pressable>
            ))}
          </View>
          <View style={[s.row, s.spread]}>
            <Pressable style={s.chip} accessibilityLabel="Less time" onPress={() => pickTarget(Math.max(1, sessionTarget - 1))}>
              <Text style={s.btnText}>−</Text>
            </Pressable>
            <TextInput
              style={[s.p, s.timeInput]}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={4}
              value={String(sessionTarget)}
              onChangeText={(v) => { const n = parseInt(v, 10); if (!Number.isNaN(n) && n >= 1) pickTarget(n); }}
              accessibilityLabel={`${sessionTarget} minutes, tap to edit`}
            />
            <Text style={s.p}>min</Text>
            <Pressable style={s.chip} accessibilityLabel="More time" onPress={() => pickTarget(sessionTarget + 1)}>
              <Text style={s.btnText}>+</Text>
            </Pressable>
          </View>
        </>
      ) : sessionMode === "loops" && !active ? (
        <View style={[s.row, s.spread]}>
          <Pressable style={s.chip} accessibilityLabel="Fewer loops" onPress={() => pickTarget(Math.max(1, sessionTarget - 1))}><Text style={s.btnText}>−</Text></Pressable>
          <Text style={s.p}>{sessionTarget} loop{sessionTarget !== 1 ? "s" : ""}</Text>
          <Pressable style={s.chip} accessibilityLabel="More loops" onPress={() => pickTarget(Math.min(MAX_LOOPS, sessionTarget + 1))}><Text style={s.btnText}>+</Text></Pressable>
        </View>
      ) : null}

      {!active && plan && voice.current ? (
        <Text style={s.dim}>About {plan.loops} loop{plan.loops !== 1 ? "s" : ""}{plan.endsAt ? `, ends at ${plan.endsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>
      ) : null}

      <PlayOptions disabled={active || busy} />
      <View style={[s.row, s.spread]}>
        <Text style={s.p}>A soft bell between plays</Text>
        <Switch
          accessibilityLabel="A soft bell between plays"
          value={bellOn}
          onValueChange={setBellOn}
          disabled={active || (sessionMode === "until-stopped" ? false : (plan?.loops ?? 0) <= 1)}
        />
      </View>

      <View style={s.script}>
        {item.lines.map((l, i) => (
          <Text key={i} style={[s.line, currentLine === i && s.activeLine]}>{l}</Text>
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
  timeInput: { minWidth: 56, textAlign: "center" },
  on: { backgroundColor: "#2a3142", borderColor: "#8ab4ff" },
  off: { opacity: 0.5 },
  script: { gap: 10, marginTop: 8 },
  line: { color: "#e6e9ef", fontSize: 15, lineHeight: 22 },
  activeLine: { color: colors.accentText, fontWeight: "600" },
});
