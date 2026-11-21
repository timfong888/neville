"use client";

import { useEffect, useState } from "react";
import type { Manifestation } from "@/lib/library/model";
import {
  type HeldShare,
  addHeld,
  claimTarget,
  linksShown,
  linksToRevoke,
  readHeld,
  removeHeld,
  revokeOutcome,
} from "@/lib/share";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Revokes one held link by its owner token. */
async function revokeOne(h: HeldShare): Promise<"gone" | "off" | "failed"> {
  try {
    const res = await fetch(`/api/share/${h.shareId}`, { method: "DELETE", headers: { "X-Owner-Token": h.ownerToken } });
    const j = (await res.json().catch(() => null)) as { code?: string } | null;
    return revokeOutcome(res.status, j?.code);
  } catch {
    return "failed";
  }
}

/**
 * Puts this device's links under the signed-in account (`userId`), around
 * moving device work into it and on each signed-in visit. The server claim
 * lets the account revoke them from any device and removes them with the
 * account. `renamed` (device id -> account id) re-points links whose item got
 * a new id. The re-point is recorded as pending for this account first, so
 * deleting the account copy revokes the link even before the claim lands, and
 * it only replaces the original id once the claim succeeds: a link this
 * account cannot claim (another account's) keeps its original id. Calls run
 * one at a time and each re-reads storage, so a slow sweep never overwrites
 * a newer one. A link it cannot claim keeps its token.
 */
let claiming: Promise<void> = Promise.resolve();
export function claimHeldShares(userId: string, renamed: Record<string, string> = {}): Promise<void> {
  claiming = claiming.then(() => claimOnce(userId, renamed)).catch(() => undefined);
  return claiming;
}

async function claimOnce(userId: string, renamed: Record<string, string>): Promise<void> {
  for (const held of readHeld(storage())) {
    const to = claimTarget(held, userId, renamed);
    if (to && renamed[held.manifestationId]) addHeld(storage(), { ...held, renameTo: { userId, manifestationId: to } });
    let status = 0;
    try {
      const res = await fetch(`/api/share/${held.shareId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Owner-Token": held.ownerToken },
        body: JSON.stringify({ manifestationId: to ?? held.manifestationId }),
      });
      status = res.status;
    } catch {
      /* retried on the next sweep */
    }
    if (!to) continue;
    const current = readHeld(storage()).find((x) => x.shareId === held.shareId);
    if (!current) continue;
    const { renameTo: _pending, ...rest } = current;
    void _pending;
    // Claimed: the link now belongs to the account copy under its new id.
    if (status >= 200 && status < 300) addHeld(storage(), { ...rest, manifestationId: to, from: "account" });
    // Not this account's (or gone): keep its original id; drop the re-point.
    else if (status === 404) addHeld(storage(), rest);
    // Otherwise the pending re-point stays for this account's next sweep.
  }
}

/**
 * Revokes the public links to a manifestation that is being deleted.
 * `fromDevice`: the device copy is being deleted, so links made from the
 * account's copy of the same id stay. Returns false if any link could not be
 * revoked, including while public links are switched off (the row would come
 * back with the database); nothing should be deleted then.
 */
export async function revokeShareFor(manifestationId: string, opts: { fromDevice?: boolean } = {}): Promise<boolean> {
  try {
    // Links the signed-in account made of it, from any device. Signed out or
    // with accounts off this revokes nothing and answers 200.
    const all = await fetch(`/api/share?manifestation=${encodeURIComponent(manifestationId)}`, { method: "DELETE" });
    if (!all.ok && all.status !== 400) return false;
    // Every link this device made of it, by owner token.
    for (const h of linksToRevoke(readHeld(storage()), manifestationId, !!opts.fromDevice)) {
      if ((await revokeOne(h)) !== "gone") return false;
      removeHeld(storage(), h.shareId);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Revokes the public links to the given manifestations, the ones about to be
 * wiped from this device. Returns false if any could not be revoked; nothing
 * should be deleted then.
 */
export async function revokeAllShares(manifestationIds: string[]): Promise<boolean> {
  for (const id of new Set(manifestationIds)) {
    if (!(await revokeShareFor(id, { fromDevice: true }))) return false;
  }
  return true;
}

/**
 * Make a public link to one manifestation, copy it, and revoke it. The link
 * is a frozen copy of the title and script at the time it was made. The
 * owner token that allows revoking stays on this device. `fromDevice` says
 * whether `m` is a device copy or the account's copy.
 */
export default function SharePanel({ m, fromDevice }: { m: Manifestation; fromDevice: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [shown, setShown] = useState<HeldShare[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = () => setShown(linksShown(readHeld(storage()), m.id, fromDevice));

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage); // another tab made or revoked a link
    fetch("/api/share")
      .then((r) => r.json())
      .then((j: { enabled?: boolean }) => setEnabled(!!j.enabled))
      .catch(() => setEnabled(false));
    return () => window.removeEventListener("storage", onStorage);
  }, [m.id, fromDevice]);

  const held = shown[0] ?? null;
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
      const h: HeldShare = {
        shareId: j.id,
        ownerToken: j.ownerToken,
        createdAt: Date.now(),
        manifestationId: m.id,
        from: fromDevice ? "device" : "account",
      };
      if (!addHeld(storage(), h)) {
        setMsg("Link made, but this browser would not remember it, so it can't be revoked from here.");
        setShown([h]);
        return;
      }
      refresh();
    } catch {
      setMsg("The link could not be made just now.");
    } finally {
      setBusy(false);
    }
  };

  // Stops every link this copy shows (a second tab may have made another).
  const revoke = async () => {
    if (!shown.length || !window.confirm("Stop sharing? The link will stop working for everyone.")) return;
    setBusy(true);
    try {
      let left = 0;
      let off = false;
      for (const h of shown) {
        const outcome = await revokeOne(h);
        if (outcome === "gone") removeHeld(storage(), h.shareId);
        else {
          left++;
          off ||= outcome === "off";
        }
      }
      refresh();
      if (!left) setMsg("Link revoked.");
      else if (off) setMsg("Public links are switched off right now, so the link could not be revoked. Try again later.");
      else setMsg("Could not revoke just now. Try again.");
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
