"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PlaylistPlayer from "@/app/components/PlaylistPlayer";
import { addItem, cleanTitle, linesFromText, makePlaylist, MAX_TITLE, sameLines } from "@/lib/library/model";
import { useLibrary } from "@/lib/library/useLibrary";

export default function ManifestationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lib, ready, store } = useLibrary();
  const m = lib.manifestations.find((x) => x.id === id);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (m && !editing) {
      setTitle(m.title);
      setText(m.lines.join("\n"));
    }
  }, [m, editing]);

  if (!ready) return null;
  if (!m) {
    return (
      <>
        <h1>Not found</h1>
        <p className="lede">This manifestation is not saved on this device.</p>
        <Link href="/library">← My manifestations</Link>
      </>
    );
  }

  const newLines = linesFromText(text);
  const scriptChanged = !sameLines(newLines, m.lines);

  const saveEdits = async () => {
    const t = cleanTitle(title);
    if (!t || !newLines.length) {
      setMsg("A title and at least one line are needed.");
      return;
    }
    try {
      // A recording of the old words would no longer match the script, so it goes.
      await store.updateManifestation(
        { ...m, title: t, lines: newLines, updatedAt: Date.now() },
        scriptChanged ? null : undefined,
      );
      setEditing(false);
      setMsg(scriptChanged && m.hasAudio ? "Saved. Your device's voice now reads the new words." : "Saved.");
    } catch {
      setMsg("Could not save on this device.");
    }
  };

  const addTo = async () => {
    try {
      if (target === "new") {
        const p = addItem(makePlaylist(`Playlist ${lib.playlists.length + 1}`), m.id);
        await store.savePlaylist(p);
        router.push(`/playlists/${p.id}`);
        return;
      }
      const p = lib.playlists.find((x) => x.id === target);
      if (!p) return;
      if (p.itemIds.includes(m.id)) {
        setMsg(`Already in “${p.name}”.`);
        return;
      }
      await store.savePlaylist(addItem(p, m.id));
      setMsg(`Added to “${p.name}”.`);
    } catch {
      setMsg("Could not save on this device.");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${m.title}”? It is also removed from your playlists.`)) return;
    await store.deleteManifestation(m.id);
    router.push("/library");
  };

  const inPlaylists = lib.playlists.filter((p) => p.itemIds.includes(m.id));

  return (
    <>
      <p className="small">
        <Link href="/library">← My manifestations</Link>
      </p>
      <h1>{m.title}</h1>
      <p className="lede">“{m.want || "A general affirmation"}”</p>

      {!editing && (
        <div className="card">
          <PlaylistPlayer items={[m]} />
        </div>
      )}

      {editing ? (
        <div className="card">
          <label htmlFor="title">Title</label>
          <input id="title" type="text" value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} />
          <div className="field">
            <label htmlFor="script">Script, one line per row</label>
            <textarea id="script" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {scriptChanged && m.hasAudio && (
            <p className="notice">
              The recording has the AI draft&apos;s words. Saving new words removes it, and your device&apos;s own
              voice reads them instead.
            </p>
          )}
          <div className="controls">
            <button className="btn primary" onClick={saveEdits}>
              Save changes
            </button>
            <button className="btn sm ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="controls">
          <button className="btn sm" onClick={() => setEditing(true)}>
            Edit title and script
          </button>
          <select aria-label="Add to playlist" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Add to playlist…</option>
            {lib.playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="new">+ New playlist</option>
          </select>
          <button className="btn sm" disabled={!target} onClick={addTo}>
            Add
          </button>
          <button className="btn sm ghost danger" onClick={remove}>
            Delete
          </button>
        </div>
      )}
      {msg && (
        <p className="small muted" role="status">
          {msg}
        </p>
      )}
      {inPlaylists.length > 0 && (
        <p className="small muted">
          In:{" "}
          {inPlaylists.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link href={`/playlists/${p.id}`}>{p.name}</Link>
            </span>
          ))}
        </p>
      )}
      <p className="small muted">
        {m.hasAudio ? `Recorded in the voice of ${m.voiceName}.` : "Read by your device's own voice."}{" "}
        {store.kind === "device" ? "Saved on this device." : "Saved in your account."}
      </p>
    </>
  );
}
