import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "expo-router";
import { AccessibilityInfo, Animated, Platform, Pressable, type PressableInstance, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { type Manifestation, newestFirst } from "@/lib/library/model";
import { playingItemId } from "@/lib/playingItemId";
import { displayTitle } from "@/lib/script";
import { setBell, useBell } from "../../src/player/bellStore";
import { MUSIC_ENABLED } from "../../src/player/musicStore";
import { nowPlaying, playAll, useNowPlaying } from "../../src/player/nowPlayingStore";
import { DEFAULT_SESSION_MODE, DEFAULT_TIME, makeSessionStore, type SessionMode } from "../../src/player/sessionStore";
import { LOOP_GAP_MS } from "../../src/player/loop";
import { planSession } from "@/lib/session/planSession";
import { kv } from "../../src/seams/kv";
import { useLibrary } from "../../src/seams/useLibrary";
import { Button } from "../../src/ui/Button";
import { PlayOptions } from "../../src/ui/PlayOptions";
import { Screen } from "../../src/ui/Screen";
import { colors, radius, space, type } from "../../src/theme";

const sessionStore = makeSessionStore(kv);

const itemMeta = (m: Manifestation) => `${m.lines.length} lines · ${m.hasAudio ? m.voiceName : "no recording"} · ${new Date(m.createdAt).toLocaleDateString()}`;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** 10 px blue dot in the left gutter of the playing row. Pulses unless reduced motion is on; dims while paused. */
function PlayingDot({ paused }: { paused: boolean }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (paused || reducedMotion) {
      Animated.timing(opacity, { toValue: paused ? 0.4 : 1, duration: 150, useNativeDriver: Platform.OS !== "web" }).start();
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 900, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [paused, reducedMotion, opacity]);
  return <Animated.View accessible={false} style={[s.dot, !paused && !reducedMotion && s.dotGlow, { opacity }]} />;
}

// Everything saved on this device, newest first. Playlists and account sync come in Phase 2.
export default function LibraryScreen() {
  const { lib, ready, error, reload } = useLibrary();
  const router = useRouter();
  const items = newestFirst(lib.manifestations);
  const np = useNowPlaying();
  const bell = useBell();
  const [sessionMode, setSessionMode] = useState<SessionMode>(DEFAULT_SESSION_MODE);
  const [sessionLoops, setSessionLoops] = useState(3);
  const [sessionTarget, setSessionTarget] = useState(DEFAULT_TIME);
  useEffect(() => {
    void sessionStore.readMode().then((m) => {
      setSessionMode(m);
      void sessionStore.readTarget(m).then((t) => {
        if (m === "loops") setSessionLoops(t);
        else if (m === "time") setSessionTarget(t);
      });
    });
  }, []);
  // The controller plays one thing at a time; this card shows it only when it is the Library loop.
  const now = np.id === "all" ? np : { ...np, status: "idle" as const, note: "" };
  const recordings = items.filter((m) => m.hasAudio);
  // Copy the recordings ahead, and again when the Library changes, so Play all starts straight from the tap.
  const key = recordings.map((m) => `${m.id}:${m.updatedAt}`).join(",");
  // Play waits for the copies, so it starts inside the tap: on the web a wait after the tap loses its permission to play.
  const [copied, setCopied] = useState(false);
  // Any Library change drops the copies, whether or not the recordings' key changed.
  const [made, setMade] = useState(0);
  useEffect(() => playAll.subscribe(() => setMade((n) => n + 1)), []);
  useEffect(() => {
    if (!key) return;
    let live = true;
    setCopied(false);
    // A failed copy is tried again by the tap itself.
    const done = () => live && setCopied(true);
    playAll.prepare().then(done, done);
    return () => void (live = false);
  }, [key, made]);

  // Scroll the playing row into view (#204).
  const scrollRef = useRef<ScrollViewInstance>(null);
  const rowRefs = useRef(new Map<string, PressableInstance | null>());
  const isDragging = useRef(false);
  const playingId = playingItemId(np, items);
  const prevPlayingId = useRef<string | null>(null);
  useEffect(() => {
    if (playingId === prevPlayingId.current) return;
    prevPlayingId.current = playingId;
    if (!playingId || isDragging.current) return;
    const row = rowRefs.current.get(playingId);
    const sv = scrollRef.current;
    if (!row || !sv) return;
    const innerView = sv.getInnerViewRef();
    if (!innerView) return;
    row.measureLayout(
      innerView,
      (_x, y) => sv.scrollTo({ y: Math.max(0, y - 80), animated: true }),
      () => {},
    );
  }, [playingId]);

  const busy = now.status !== "idle";
  return (
    <Screen
      title="My manifestations"
      scrollRef={scrollRef}
      onScrollBeginDrag={() => { isDragging.current = true; }}
      onScrollEndDrag={() => { isDragging.current = false; }}
    >
      <Text style={type.muted}>Everything you have saved, newest first. Saved on this device only.</Text>
      {recordings.length > 0 ? (
        <View style={s.card}>
          {busy ? (
            <>
              <Text style={type.body} accessibilityLiveRegion="polite">
                {now.status === "preparing" ? "Getting your playlist ready…" : `${now.status === "paused" ? "Paused" : "Playing all on loop"}: ${now.title} (${now.position} of ${now.total})`}
              </Text>
              <Button label="Stop" onPress={() => nowPlaying.stop()} />
            </>
          ) : (
            <>
              <Button
                kind="primary"
                label={copied ? (sessionMode === "until-stopped" ? "Play all on loop" : sessionMode === "loops" ? `Play all · ${sessionLoops} loops` : `Play all · ${sessionTarget} min`) : "Preparing playlist…"}
                disabled={!copied}
                onPress={() => void nowPlaying.play({
                  ...playAll.job,
                  prepare: async () => {
                    const p = await playAll.job.prepare();
                    if (!p) return null;
                    if (sessionMode === "until-stopped") return { ...p, music: MUSIC_ENABLED };
                    if (sessionMode === "loops") {
                      const clips = Array.from({ length: sessionLoops }, () => p.clips).flat();
                      return { clips, loop: false, music: MUSIC_ENABLED, at: p.at };
                    }
                    // time mode: use playlist duration to compute how many full passes fit
                    if (p.durationSec && p.durationSec > 0) {
                      const gapSec = LOOP_GAP_MS / 1000;
                      const plan = planSession([p.durationSec], "time", sessionTarget, undefined, gapSec);
                      const loops = plan.loops ?? 1;
                      const clips = Array.from({ length: loops }, () => p.clips).flat();
                      return { clips, loop: false, music: MUSIC_ENABLED, at: p.at };
                    }
                    // duration unknown: fall back to until-stopped
                    return { ...p, loop: true, music: MUSIC_ENABLED };
                  },
                })}
              />
              {now.note ? <Text style={type.muted}>{now.note}</Text> : <Text style={type.muted}>Plays every recording, newest first, and starts again after the last.</Text>}
              <PlayOptions bell={{ value: bell, onChange: (v) => void setBell(v) }} disabled={np.status !== "idle"} />
            </>
          )}
        </View>
      ) : null}
      {!ready ? null : error ? (
        <View style={s.card}>
          <Text style={type.body}>{error}</Text>
          <Button label="Try again" onPress={reload} />
        </View>
      ) : items.length === 0 ? (
        <View style={s.card}>
          <Text style={type.body}>Nothing saved yet.</Text>
          <Text style={type.muted}>Make a manifestation, then save it.</Text>
          <Button kind="primary" label="Create one" onPress={() => router.push("/create")} />
        </View>
      ) : (
        <View accessibilityRole="list" style={s.list}>
          {items.map((m) => {
            const isPlaying = playingId === m.id;
            const isPaused = isPlaying && np.status === "paused";
            return (
              <Link key={m.id} href={`/library/${m.id}`} asChild>
                <Pressable
                  ref={(r) => { rowRefs.current.set(m.id, r); }}
                  accessibilityRole="link"
                  accessibilityLabel={isPlaying ? `${displayTitle(m.title)}, Playing` : displayTitle(m.title)}
                  accessibilityState={{ selected: isPlaying }}
                  style={[s.row, isPlaying && s.rowPlaying]}
                >
                  <View style={s.rowInner}>
                    <View style={s.dotSlot}>
                      {isPlaying && <PlayingDot paused={isPaused} />}
                    </View>
                    <View style={s.rowText}>
                      <Text style={type.body}>{displayTitle(m.title)}</Text>
                      <Text style={type.muted}>{itemMeta(m)}</Text>
                    </View>
                  </View>
                </Pressable>
              </Link>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { gap: space.sm },
  card: { gap: space.md, padding: space.lg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card },
  row: { padding: space.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card },
  // Accent outline + low-alpha tint; white text contrast on this bg is well above 4.5:1 (#204).
  rowPlaying: { borderColor: colors.accent, backgroundColor: "rgba(16, 93, 251, 0.12)" },
  rowInner: { flexDirection: "row", alignItems: "flex-start" },
  dotSlot: { width: 20, paddingTop: 7, alignItems: "center" },
  rowText: { flex: 1, gap: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  dotGlow: { shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
});
