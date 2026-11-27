"use client";

import LibraryError from "@/app/components/LibraryError";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useReducer, useState } from "react";
import PlaylistPlayer from "@/app/components/PlaylistPlayer";
import SharePanel from "@/app/components/SharePanel";
import { addItem, cleanTitle, linesFromText, makePlaylist, MAX_TITLE, sameLines } from "@/lib/library/model";
import { useLibrary } from "@/lib/library/useLibrary";
import { type Manifestation } from "@/lib/library/model";
import { resolveVoice } from "@/lib/voices";
import { INITIAL_STATE, savedNotRecorded, transition } from "@/lib/rerecordState";
import { ApiError } from "@/lib/api/client";
import { CURATED_VOICE_IDS, SPEED_OPTIONS, CADENCE_OPTIONS, resolveSpeed, resolveCadence, type SpeedStep, type CadenceStep } from "@/lib/voice/options";

export default function ManifestationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lib, ready, store, error, reload } = useLibrary();
  const m = lib.manifestations.find((x) => x.id === id);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [target, setTarget] = useState("");
  const [rrState, dispatch] = useReducer(transition, m?.hasAudio === false ? savedNotRecorded() : INITIAL_STATE);
  const [rrVoiceId, setRrVoiceId] = useState("");
  const [rrSpeed, setRrSpeed] = useState<SpeedStep>(resolveSpeed(undefined).id);
  const [rrCadence, setRrCadence] = useState<CadenceStep>(resolveCadence(undefined).id);

  useEffect(() => {
    if (m && !editing) {
      setTitle(m.title);
      setText(m.lines.join("\n"));
    }
  }, [m, editing]);

  useEffect(() => {
    if (m) {
      setRrVoiceId(m.voiceId || "");
      setRrSpeed(resolveSpeed(m.speedStep).id);
      setRrCadence(resolveCadence(m.cadenceStep).id);
    }
  }, [m?.id]);

  if (!ready) return null;
  if (error) return <LibraryError error={error} retry={reload} />;
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
  // The voice a re-recording uses: the one it was saved with, or the default
  // if that voice is no longer offered.
  const voice = resolveVoice(m.voiceId);

  /** Records `base`'s script with the selected voice/speed/cadence and stores it. */
  const rerecord = async (base: Manifestation) => {
    dispatch({ type: "record_tap" });
    // If guard rejected, do nothing (double-tap).
    // We read the latest state from rrState after dispatch, but React batches,
    // so we check the transition directly.
    const after = transition(rrState, { type: "record_tap" });
    if (after.status !== "recording") return;

    const selectedVoiceId = rrVoiceId || voice.id;
    try {
      const res = await fetch("/api/rerecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: base.lines, voiceId: selectedVoiceId, speedStep: rrSpeed, cadenceStep: rrCadence }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
          creditReturned?: boolean;
          hint?: string;
        } | null;
        if (res.status === 402) {
          dispatch({ type: "server_402" });
          return;
        }
        const reason = j?.error ?? "The recording could not be made just now.";
        const creditReturned = j?.creditReturned === true;
        dispatch({ type: "server_failed", reason, creditReturned, code: j?.code, hint: j?.hint });
        return;
      }
      const creditsBalanceHeader = res.headers.get("X-Credits-Balance");
      dispatch({ type: "server_charged", balance: creditsBalanceHeader });

      const used = resolveVoice(res.headers.get("X-Voice-Id"));
      const blob = await res.blob();
      try {
        await store.updateManifestation(
          { ...base, voiceId: used.id, voiceName: used.name, speedStep: rrSpeed, cadenceStep: rrCadence, updatedAt: Date.now() },
          blob,
        );
      } catch {
        dispatch({ type: "server_failed", reason: "The new recording was made but this browser could not save it. Free some space and try again.", creditReturned: false });
        return;
      }
      dispatch({ type: "server_done" });
    } catch (e) {
      const reason = e instanceof ApiError ? e.message : "The recording could not be made just now.";
      const creditReturned = e instanceof ApiError && e.data?.creditReturned === true;
      dispatch({ type: "server_failed", reason, creditReturned });
    }
  };

  const saveEdits = async (andRecord = false) => {
    const t = cleanTitle(title);
    if (!t || !newLines.length) {
      setMsg("A title and at least one line are needed.");
      return;
    }
    const next = { ...m, title: t, lines: newLines, updatedAt: Date.now() };
    try {
      await store.updateManifestation(next, scriptChanged ? null : undefined);
      setEditing(false);
      if (scriptChanged) {
        dispatch({ type: "edit_saved" });
        setMsg("");
      } else {
        setMsg("Saved.");
      }
    } catch {
      setMsg("Could not save on this device.");
      return;
    }
    if (andRecord) await rerecord({ ...next, hasAudio: false });
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
        setMsg(`Already in "${p.name}".`);
        return;
      }
      await store.savePlaylist(addItem(p, m.id));
      setMsg(`Added to "${p.name}".`);
    } catch {
      setMsg("Could not save on this device.");
    }
  };

  const remove = async () => {
    const note = store.kind === "account" ? " Its public link, if any, stops working." : "";
    if (!window.confirm(`Delete "${m.title}"? It is also removed from your playlists.${note}`)) return;
    await store.deleteManifestation(m.id);
    router.push("/library");
  };

  const inPlaylists = lib.playlists.filter((p) => p.itemIds.includes(m.id));
  const isRecording = rrState.status === "recording";
  const rrMsg = (() => {
    switch (rrState.status) {
      case "saved_not_recorded": return "Script saved. Record it to hear your edit.";
      case "recording": return "Recording in progress. This takes up to half a minute.";
      case "charged": return rrState.balance === "unlimited"
        ? "Unlimited recordings."
        : rrState.balance !== null ? `1 credit used. ${rrState.balance} left.` : "1 credit used.";
      case "done": return "Recording done.";
      case "failed": {
        const msg = rrState.failReason ?? "";
        return msg && rrState.creditReturned ? `${msg} Your credit was returned.` : msg;
      }
      case "no_credits": return "You have no recordings left. Get more to keep going.";
      default: return "";
    }
  })();

  return (
    <>
      <p className="small">
        <Link href="/library">← My manifestations</Link>
      </p>
      <h1>{m.title}</h1>
      <p className="lede">"{m.want || "A general affirmation"}"</p>

      {!editing && (
        <div className="card">
          <PlaylistPlayer items={[m]} />
        </div>
      )}

      {rrMsg && (
        <p className="small muted" role="status">
          {rrMsg}
        </p>
      )}
      {rrState.status === "failed" && rrState.failHint && (
        <p className="small muted" role="note">
          {rrState.failHint}
        </p>
      )}

      {!editing && (
        <div className="card">
          <div className="field">
            <label htmlFor="rr-voice">Voice</label>
            <select id="rr-voice" value={rrVoiceId} onChange={(e) => setRrVoiceId(e.target.value)}>
              {CURATED_VOICE_IDS.map((vid) => {
                const v = resolveVoice(vid);
                return <option key={vid} value={vid}>{v.name}</option>;
              })}
            </select>
          </div>
          <div className="row">
            <span className="small muted">Speed</span>
            {SPEED_OPTIONS.map((o) => (
              <button key={o.id} type="button" className={`chip${rrSpeed === o.id ? " active" : ""}`} aria-pressed={rrSpeed === o.id} onClick={() => setRrSpeed(o.id as SpeedStep)}>{o.label}</button>
            ))}
          </div>
          <div className="row">
            <span className="small muted">Cadence</span>
            {CADENCE_OPTIONS.map((o) => (
              <button key={o.id} type="button" className={`chip${rrCadence === o.id ? " active" : ""}`} aria-pressed={rrCadence === o.id} onClick={() => setRrCadence(o.id as CadenceStep)}>{o.label}</button>
            ))}
          </div>
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
              The recording has the old words. Save and re-record makes a new one in the voice of {voice.name};
              saving without recording removes it, and your device&apos;s own voice reads the new words.
            </p>
          )}
          <div className="controls">
            {scriptChanged ? (
              <>
                <button className="btn primary" onClick={() => saveEdits(true)} disabled={isRecording}>
                  Save and re-record
                </button>
                <button className="btn sm" onClick={() => saveEdits()} disabled={isRecording}>
                  Save without recording
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={() => saveEdits()}>
                Save changes
              </button>
            )}
            <button className="btn sm ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="controls">
          <button className="btn sm" onClick={() => setEditing(true)} disabled={isRecording}>
            Edit title and script
          </button>
          {(rrState.status === "saved_not_recorded" || rrState.status === "idle" || rrState.status === "failed" || rrState.status === "no_credits") && (
            <button className="btn sm primary" onClick={() => void rerecord(m)} disabled={isRecording}>
              Re-record
            </button>
          )}
          {/* Edit script: shown when recording was refused for content (issue 252's editor will replace setEditing when it ships). */}
          {rrState.status === "failed" && rrState.failCode === "not_recordable" && (
            <button className="btn sm" onClick={() => setEditing(true)}>
              Edit script
            </button>
          )}
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
      {!editing && <SharePanel m={m} fromDevice={store.kind === "device"} />}
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
