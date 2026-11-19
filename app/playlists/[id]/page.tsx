"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import PlaylistPlayer from "@/app/components/PlaylistPlayer";
import {
  addItem,
  MAX_PLAYLIST_NAME,
  moveItem,
  newestFirst,
  type Playlist,
  removeItem,
  renamePlaylist,
  resolveItems,
} from "@/lib/library/model";
import { useLibrary } from "@/lib/library/useLibrary";

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lib, ready, store } = useLibrary();
  const [naming, setNaming] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [msg, setMsg] = useState("");
  const p = lib.playlists.find((x) => x.id === id);

  if (!ready) return null;
  if (!p) {
    return (
      <>
        <h1>Not found</h1>
        <p className="lede">This playlist is not saved on this device.</p>
        <Link href="/playlists">← Playlists</Link>
      </>
    );
  }

  // Deleted manifestations are dropped from the list, so indexes match what is shown.
  const live: Playlist = { ...p, itemIds: p.itemIds.filter((x) => lib.manifestations.some((m) => m.id === x)) };
  const items = resolveItems(live, lib.manifestations);
  const others = newestFirst(lib.manifestations).filter((m) => !live.itemIds.includes(m.id));

  const save = async (next: Playlist) => {
    try {
      await store.savePlaylist(next);
    } catch {
      setMsg("Could not save on this device.");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the playlist “${p.name}”? Its manifestations stay in your library.`)) return;
    await store.deletePlaylist(p.id);
    router.push("/playlists");
  };

  return (
    <>
      <p className="small">
        <Link href="/playlists">← Playlists</Link>
      </p>
      {naming === null ? (
        <h1>
          {p.name}{" "}
          <button className="iconbtn" aria-label="Rename playlist" onClick={() => setNaming(p.name)}>
            ✎
          </button>
        </h1>
      ) : (
        <div className="controls">
          <input
            type="text"
            aria-label="Playlist name"
            value={naming}
            maxLength={MAX_PLAYLIST_NAME}
            onChange={(e) => setNaming(e.target.value)}
            style={{ flex: "1 1 200px" }}
            autoFocus
          />
          <button
            className="btn primary"
            onClick={() => {
              void save(renamePlaylist(live, naming));
              setNaming(null);
            }}
          >
            Save name
          </button>
          <button className="btn sm ghost" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </div>
      )}

      {items.length > 0 ? (
        <div className="card">
          <PlaylistPlayer items={items} />
        </div>
      ) : (
        <p className="lede">Empty. Add manifestations from your library below.</p>
      )}

      <h2>Order</h2>
      <ul className="items">
        {items.map((m, i) => (
          <li key={m.id}>
            <div className="grow">
              <Link className="title" href={`/library/${m.id}`}>
                {i + 1}. {m.title}
              </Link>
              <span className="meta">{m.hasAudio ? m.voiceName : "device voice"}</span>
            </div>
            <div className="acts">
              <button className="iconbtn" aria-label={`Move ${m.title} up`} disabled={i === 0} onClick={() => save(moveItem(live, i, -1))}>
                ↑
              </button>
              <button
                className="iconbtn"
                aria-label={`Move ${m.title} down`}
                disabled={i === items.length - 1}
                onClick={() => save(moveItem(live, i, 1))}
              >
                ↓
              </button>
              <button className="iconbtn" aria-label={`Remove ${m.title} from playlist`} onClick={() => save(removeItem(live, i))}>
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="controls">
        {others.length > 0 ? (
          <>
            <select aria-label="Add a manifestation" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Add a manifestation…</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <button
              className="btn sm"
              disabled={!adding}
              onClick={() => {
                void save(addItem(live, adding));
                setAdding("");
              }}
            >
              Add
            </button>
          </>
        ) : (
          <p className="small muted">
            {lib.manifestations.length ? "Everything in your library is in this playlist." : ""}{" "}
            <Link href="/">Create a manifestation</Link>
          </p>
        )}
        <button className="btn sm ghost danger" onClick={remove}>
          Delete playlist
        </button>
      </div>
      {msg && <p className="small muted">{msg}</p>}
    </>
  );
}
