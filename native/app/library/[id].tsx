import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MAX_TITLE, type Manifestation, cleanTitle, linesFromText, sameLines } from "@/lib/library/model";
import { displayTitle } from "@/lib/script";
import { library } from "../../src/seams/library";
import { Button } from "../../src/ui/Button";
import { Screen } from "../../src/ui/Screen";
import { colors, radius, space, type } from "../../src/theme";
import { ImageGallery } from "../../src/image/Gallery";
import { useAccountView } from "../../src/accountStore";

/** Off unless the build sets EXPO_PUBLIC_IMAGES=1. */
const IMAGES_ENABLED = process.env.EXPO_PUBLIC_IMAGES === "1";

// One saved item: play it, edit its title and script, or delete it. Re-record comes in Phase 2.
export default function LibraryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { account } = useAccountView();
  // The tabs are always underneath this screen. Go back to them; `replace` would put a second tabs screen on the stack.
  const toLibrary = () => router.dismissTo("/library");
  const [m, setM] = useState<Manifestation | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState("");
  // Set while this screen deletes its own item, so it does not flash "Not found" on the way out.
  const deleting = useRef(false);

  useEffect(() => {
    let live = true;
    // Re-read on every library change, so an edit or delete made elsewhere shows here too.
    const load = () => library.get(id).then((x) => live && !(deleting.current && !x) && setM(x), () => live && !deleting.current && setM(null));
    load();
    const off = library.subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, [id]);

  if (m === undefined) return <Screen />;
  if (m === null) {
    return (
      <Screen title="Not found">
        <Text style={type.muted}>This item is not saved on this device.</Text>
        <Button label="Back to the library" onPress={() => toLibrary()} />
      </Screen>
    );
  }

  const newLines = linesFromText(script);
  const scriptChanged = editing && !sameLines(newLines, m.lines);
  const losesAudio = scriptChanged && m.hasAudio;

  const startEdit = () => {
    setTitle(m.title);
    setScript(m.lines.join("\n"));
    setMsg("");
    setEditing(true);
  };
  const save = async () => {
    if (!newLines.length) return setMsg("The script needs at least one line.");
    const next: Manifestation = { ...m, title: cleanTitle(title) || m.title, lines: newLines, updatedAt: Date.now() };
    try {
      // New words no longer match the recording, so it is removed, as on the website.
      await library.save(next, scriptChanged ? null : undefined);
      setM({ ...next, hasAudio: scriptChanged ? false : m.hasAudio });
      setEditing(false);
      setMsg(losesAudio ? "Saved. The old recording was removed." : "Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save. The device may be full.");
    }
  };
  const remove = async () => {
    deleting.current = true;
    try {
      await library.remove(m.id);
      toLibrary();
    } catch (e) {
      deleting.current = false;
      setMsg(e instanceof Error ? e.message : "Could not delete.");
    }
  };

  return (
    <Screen title={editing ? "Edit" : displayTitle(m.title)}>
      {editing ? (
        <>
          <Text style={type.muted}>Title</Text>
          <TextInput accessibilityLabel="Title" value={title} onChangeText={setTitle} maxLength={MAX_TITLE} style={s.input} placeholderTextColor={colors.muted} />
          <Text style={type.muted}>Script, one line per row</Text>
          <TextInput accessibilityLabel="Script" value={script} onChangeText={setScript} multiline style={[s.input, s.area]} placeholderTextColor={colors.muted} />
          {losesAudio ? <Text style={s.warn}>Changing the words removes the recording. Recording again arrives in a later version.</Text> : null}
          <View style={s.acts}>
            <Button kind="primary" label={losesAudio ? "Save and remove recording" : "Save"} onPress={save} />
            <Button label="Cancel" onPress={() => (setEditing(false), setMsg(""))} />
          </View>
        </>
      ) : (
        <>
          <Text style={type.muted}>
            {m.hasAudio ? `Recorded in the voice of ${m.voiceName}.` : `Voice: ${m.voiceName || "none"}. No recording is saved with this script.`} Saved {new Date(m.createdAt).toLocaleDateString()}.
          </Text>
          <Button kind="primary" label="Play" onPress={() => router.push(`/player/${m.id}`)} />
          {IMAGES_ENABLED ? <ImageGallery wish={m.want} relaxed={account?.relaxed ?? false} /> : null}
          <View style={s.script}>
            {m.lines.map((l, i) => (
              <Text key={i} style={type.body}>{l}</Text>
            ))}
          </View>
          {confirming ? (
            <View style={s.acts}>
              <Text style={[type.body, { flexBasis: "100%" }]}>Delete “{m.title}” from this device? This cannot be undone.</Text>
              <Button kind="danger" label="Delete for good" onPress={remove} />
              <Button label="Keep" onPress={() => setConfirming(false)} />
            </View>
          ) : (
            <View style={s.acts}>
              <Button label="Edit" onPress={startEdit} />
              <Button kind="danger" label="Delete" onPress={() => setConfirming(true)} />
            </View>
          )}
        </>
      )}
      <Text accessibilityLiveRegion="polite" style={type.muted}>{msg}</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: space.md, backgroundColor: colors.card },
  area: { minHeight: 220, textAlignVertical: "top", lineHeight: 24 },
  script: { gap: space.md, padding: space.lg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  warn: { color: colors.warn, fontSize: 14, lineHeight: 20 },
});
