"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Manifestation } from "@/lib/library/model";
import type { OwnLink } from "@/lib/share";

type State = { enabled: boolean; links: OwnLink[] } | null;

/**
 * Make a public link to one manifestation, copy it, and revoke it. Only a
 * signed-in person can make one, from the copy saved in their account; the
 * link belongs to the account, so it shows and can be revoked on any device.
 * Anyone with the link can open it, signed in or not. The link is a frozen
 * copy of the title and script at the time it was made. `fromDevice`: `m` is
 * a copy saved only on this device (signed out, or accounts off).
 */
export default function SharePanel({ m, fromDevice }: { m: Manifestation; fromDevice: boolean }) {
  const [state, setState] = useState<State>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const q = fromDevice ? "" : `?manifestation=${encodeURIComponent(m.id)}`;
      const res = await fetch(`/api/share${q}`, { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { enabled?: boolean; links?: OwnLink[]; error?: string } | null;
      if (!res.ok) {
        setState({ enabled: true, links: [] });
        setMsg(j?.error ?? "Could not load your links just now.");
        return;
      }
      setState({ enabled: !!j?.enabled, links: j?.links ?? [] });
    } catch {
      setState({ enabled: false, links: [] });
    }
  }, [m.id, fromDevice]);

  useEffect(() => {
    void load();
  }, [load]);

  const held = state?.links[0] ?? null;
  const url = held ? `${window.location.origin}/s/${held.id}` : "";

  const make = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: m.title, lines: m.lines, voiceName: m.hasAudio ? m.voiceName : "", manifestationId: m.id }),
      });
      const j = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !j?.id) {
        setMsg(j?.error ?? "The link could not be made just now.");
        return;
      }
      await load();
    } catch {
      setMsg("The link could not be made just now.");
    } finally {
      setBusy(false);
    }
  };

  // Stops every live link to this manifestation (another device may have made one too).
  const revoke = async () => {
    if (!state?.links.length || !window.confirm("Stop sharing? The link will stop working for everyone.")) return;
    setBusy(true);
    try {
      let left = 0;
      for (const l of state.links) {
        const res = await fetch(`/api/share/${l.id}`, { method: "DELETE" }).catch(() => null);
        if (!res || (res.status !== 200 && res.status !== 404)) left++; // 404: already gone
      }
      await load();
      setMsg(left ? "Could not revoke just now. Try again." : "Link revoked.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copied.");
    } catch {
      setMsg(url);
    }
  };

  if (!state) return null;
  return (
    <div className="card share">
      <h3>Public link</h3>
      {!state.enabled ? (
        <p className="small muted">Public links are not switched on yet.</p>
      ) : fromDevice ? (
        <>
          <p className="small muted">Sign in to make a public page of this manifestation. People you send it to don&apos;t need an account.</p>
          <Link className="btn sm" href="/account">
            Sign in to share
          </Link>
        </>
      ) : held ? (
        <>
          <p className="small muted">Anyone with this link can read and listen. It shows the words as they were when you shared.</p>
          <input type="text" readOnly value={url} aria-label="Public link" onFocus={(e) => e.target.select()} />
          <div className="controls">
            <button className="btn sm" onClick={copy}>
              Copy link
            </button>
            <a className="btn sm ghost" href={url} target="_blank" rel="noreferrer">
              Open
            </a>
            <button className="btn sm ghost danger" onClick={revoke} disabled={busy}>
              Stop sharing
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small muted">Make a read-only page of this manifestation that anyone can open, signed in or not. You can revoke it from any device.</p>
          <button className="btn sm" onClick={make} disabled={busy}>
            {busy ? "Making link…" : "Share publicly"}
          </button>
        </>
      )}
      {msg && (
        <p className="small muted" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
