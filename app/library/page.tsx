"use client";

import LibraryError from "@/app/components/LibraryError";
import Link from "next/link";
import PlaylistPlayer from "@/app/components/PlaylistPlayer";
import { retryPendingRevokes } from "@/app/components/SharePanel";
import { newestFirst } from "@/lib/library/model";
import { useLibrary } from "@/lib/library/useLibrary";
import { useEffect, useState } from "react";

export default function LibraryPage() {
  const { lib, ready, store, error, reload } = useLibrary();
  const [playAll, setPlayAll] = useState(false);
  // Links whose revoke could not reach the server when their item was deleted.
  useEffect(() => void retryPendingRevokes(), []);
  const items = newestFirst(lib.manifestations);

  return (
    <>
      <h1>My manifestations</h1>
      <p className="lede">
        Everything you have saved, newest first. Play them all, or put them into a{" "}
        <Link href="/playlists">playlist</Link>.
      </p>
      {store.kind === "device" && (
        <p className="small muted">Saved on this device only. <Link href="/account">An account</Link> keeps them on every device.</p>
      )}

      {!ready ? null : error ? (
        <LibraryError error={error} retry={reload} />
      ) : items.length === 0 ? (
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
