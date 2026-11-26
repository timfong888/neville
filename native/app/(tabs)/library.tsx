import { useEffect } from "react";
import { Link, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type Manifestation, newestFirst } from "@/lib/library/model";
import { playlist, usePlaylist } from "../../src/player/playlist";
import { useLibrary } from "../../src/seams/useLibrary";
import { Button } from "../../src/ui/Button";
import { Screen } from "../../src/ui/Screen";
import { colors, radius, space, type } from "../../src/theme";

const itemMeta = (m: Manifestation) => `${m.lines.length} lines · ${m.hasAudio ? m.voiceName : "no recording"} · ${new Date(m.createdAt).toLocaleDateString()}`;

// Everything saved on this device, newest first. Playlists and account sync come in Phase 2.
export default function LibraryScreen() {
  const { lib, ready, error, reload } = useLibrary();
  const router = useRouter();
  const items = newestFirst(lib.manifestations);
  const now = usePlaylist();
  const recordings = items.filter((m) => m.hasAudio);
  // Copy the recordings ahead, and again when the Library changes, so Play all starts straight from the tap.
  const key = recordings.map((m) => `${m.id}:${m.updatedAt}`).join(",");
  useEffect(() => {
    playlist.reset();
    if (key) void playlist.prepare();
  }, [key]);
  const busy = now.status !== "idle";
  return (
    <Screen title="My manifestations">
      <Text style={type.muted}>Everything you have saved, newest first. Saved on this device only.</Text>
      {recordings.length > 0 ? (
        <View style={s.card}>
          {busy ? (
            <>
              <Text style={type.body} accessibilityLiveRegion="polite">
                {now.status === "preparing" ? "Getting your playlist ready…" : `${now.status === "paused" ? "Paused" : "Playing all on loop"}: ${now.title} (${now.position} of ${now.total})`}
              </Text>
              <Button label="Stop" onPress={playlist.stop} />
            </>
          ) : (
            <>
              <Button kind="primary" label="Play all on loop" onPress={() => void playlist.start()} />
              {now.error ? <Text style={type.muted}>{now.error}</Text> : <Text style={type.muted}>Plays every recording, newest first, and starts again after the last.</Text>}
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
          {items.map((m) => (
            <Link key={m.id} href={`/library/${m.id}`} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={m.title} style={s.row}>
                <Text style={type.body} numberOfLines={2}>{m.title}</Text>
                <Text style={type.muted}>{itemMeta(m)}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { gap: space.sm },
  card: { gap: space.md, padding: space.lg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card },
  row: { gap: 2, padding: space.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card },
});
