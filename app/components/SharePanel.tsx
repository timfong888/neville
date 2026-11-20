"use client";

import { useEffect, useState } from "react";
import type { Manifestation } from "@/lib/library/model";
import { type HeldShare, readHeld, writeHeld } from "@/lib/share";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Revokes the public link this device made for a manifestation, if any.
 * Called when the manifestation is deleted, so its page stops being public.
 * Returns false only if a link exists and could not be revoked.
 */
export async function revokeShareFor(manifestationId: string): Promise<boolean> {
  try {
    // Links the signed-in account made of it, from any device. Signed out or
    // with accounts off this revokes nothing and answers 200.
    const all = await fetch(`/api/share?manifestation=${encodeURIComponent(manifestationId)}`, { method: "DELETE" });
    if (!all.ok && all.status !== 400) return false;
    // The link this device made, by its owner token.
    const held = readHeld(storage())[manifestationId];
    if (held) {
      const res = await fetch(`/api/share/${held.shareId}`, {
        method: "DELETE",
        headers: { "X-Owner-Token": held.ownerToken },
      });
      if (!res.ok && res.status !== 404) return false;
      writeHeld(storage(), manifestationId, null);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Make a public link to one manifestation, copy it, and revoke it. The link
 * is a frozen copy of the title and script at the time it was made. The
 * owner token that allows revoking stays on this device.
 */
export default function SharePanel({ m }: { m: Manifestation }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [held, setHeld] = useState<HeldShare | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setHeld(readHeld(storage())[m.id] ?? null);
    fetch("/api/share")
      .then((r) => r.json())
      .then((j: { enabled?: boolean }) => setEnabled(!!j.enabled))
      .catch(() => setEnabled(false));
  }, [m.id]);

  const url = held ? `${window.location.origin}/s/${held.shareId}` : "";

  const make = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: m.title, lines: m.lines, voiceName: m.hasAudio ? m.voiceName : "", manifestationId: m.id }),
      });
      const j = (await res.json().catch(() => null)) as { id?: string; ownerToken?: string; error?: string } | null;
      if (!res.ok || !j?.id || !j.ownerToken) {
        setMsg(j?.error ?? "The link could not be made just now.");
        return;
      }
      const h = { shareId: j.id, ownerToken: j.ownerToken, createdAt: Date.now() };
      if (!writeHeld(storage(), m.id, h)) {
        setMsg("Link made, but this browser would not remember it, so it can't be revoked from here.");
      }
      setHeld(h);
    } catch {
      setMsg("The link could not be made just now.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!held || !window.confirm("Stop sharing? The link will stop working for everyone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/share/${held.shareId}`, {
        method: "DELETE",
        headers: { "X-Owner-Token": held.ownerToken },
      });
      // 404: already revoked. Either way it no longer works.
      if (res.ok || res.status === 404) {
        writeHeld(storage(), m.id, null);
        setHeld(null);
        setMsg("Link revoked.");
      } else {
        setMsg("Could not revoke just now. Try again.");
      }
    } catch {
      setMsg("Could not revoke just now. Try again.");
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

  if (enabled === null) return null;
  return (
    <div className="card share">
      <h3>Public link</h3>
      {held ? (
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
      ) : enabled ? (
        <>
          <p className="small muted">Make a read-only page of this manifestation that anyone can open, signed in or not. You can revoke it.</p>
          <button className="btn sm" onClick={make} disabled={busy}>
            {busy ? "Making link…" : "Share publicly"}
          </button>
        </>
      ) : (
        <p className="small muted">Public links are not switched on yet.</p>
      )}
      {msg && (
        <p className="small muted" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
