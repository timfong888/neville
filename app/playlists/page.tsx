"use client";

import LibraryError from "@/app/components/LibraryError";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { makePlaylist, MAX_PLAYLIST_NAME, newestFirst, resolveItems } from "@/lib/library/model";
import { useLibrary } from "@/lib/library/useLibrary";

export default function PlaylistsPage() {
  const router = useRouter();
  const { lib, ready, store, error, reload } = useLibrary();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  const create = async () => {
    const p = makePlaylist(name || `Playlist ${lib.playlists.length + 1}`);
    try {
      await store.savePlaylist(p);
      router.push(`/playlists/${p.id}`);
    } catch {
      setMsg("Could not save on this device.");
    }
  };

  const playlists = [...lib.playlists].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <h1>Playlists</h1>
      <p className="lede">Put your manifestations in the order you want and play them back to back.</p>

      <div className="card">
        <label htmlFor="pname">New playlist</label>
        <div className="controls" style={{ marginTop: 0 }}>
          <input
            id="pname"
            type="text"
            value={name}
            maxLength={MAX_PLAYLIST_NAME}
            placeholder="Morning"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            style={{ flex: "1 1 200px" }}
          />
          <button className="btn primary" onClick={create}>
            Create
          </button>
        </div>
        {msg && <p className="small muted">{msg}</p>}
      </div>

      {ready && error && <LibraryError error={error} retry={reload} />}
      {ready && !error && (
        <ul className="items">
          <li>
            <div className="grow">
              <Link className="title" href="/library">
                All my manifestations
              </Link>
              <span className="meta">{lib.manifestations.length} · newest first · always up to date</span>
            </div>
            <div className="acts">
              <Link className="btn sm" href="/library">
                Open
              </Link>
            </div>
          </li>
          {playlists.map((p) => {
            const n = resolveItems(p, newestFirst(lib.manifestations)).length;
            return (
              <li key={p.id}>
                <div className="grow">
                  <Link className="title" href={`/playlists/${p.id}`}>
                    {p.name}
                  </Link>
                  <span className="meta">
                    {n} {n === 1 ? "manifestation" : "manifestations"}
                  </span>
                </div>
                <div className="acts">
                  <Link className="btn sm" href={`/playlists/${p.id}`}>
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {store.kind === "device" && <p className="small muted">Saved on this device only.</p>}
    </>
  );
}
