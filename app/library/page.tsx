"use client";

import Link from "next/link";
import PlaylistPlayer from "@/app/components/PlaylistPlayer";
import { newestFirst } from "@/lib/library/model";
import { useLibrary } from "@/lib/library/useLibrary";
import { useState } from "react";

export default function LibraryPage() {
  const { lib, ready, store } = useLibrary();
  const [playAll, setPlayAll] = useState(false);
  const items = newestFirst(lib.manifestations);

  return (
    <>
      <h1>My manifestations</h1>
      <p className="lede">
        Everything you have saved, newest first. Play them all, or put them into a{" "}
        <Link href="/playlists">playlist</Link>.
      </p>
      {store.kind === "device" && (
        <p className="small muted">Saved on this device only. An account keeps them everywhere (coming soon).</p>
      )}

      {!ready ? null : items.length === 0 ? (
        <div className="card">
          <p>Nothing saved yet.</p>
          <p className="muted">
            Make a manifestation, then tap <b>Save</b> on the player.
          </p>
          <Link className="btn primary" href="/">
            Create one
          </Link>
        </div>
      ) : (
        <>
          {playAll ? (
            <div className="card">
              <PlaylistPlayer items={items} title="Library" />
              <p className="banner">
                <button className="chip" onClick={() => setPlayAll(false)}>
                  Close player
                </button>
              </p>
            </div>
          ) : (
            <button className="btn primary block" onClick={() => setPlayAll(true)}>
              ▶ Play all {items.length}
            </button>
          )}
          <ul className="items">
            {items.map((m) => (
              <li key={m.id}>
                <div className="grow">
                  <Link className="title" href={`/library/${m.id}`}>
                    {m.title}
                  </Link>
                  <span className="meta">
                    {m.lines.length} lines · {m.hasAudio ? m.voiceName : "device voice"} ·{" "}
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="acts">
                  <Link className="btn sm" href={`/library/${m.id}`}>
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
