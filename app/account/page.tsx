"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/account/authClient";
import { fetchAccount, useAccount } from "@/lib/account/useAccount";
import { AccountStore } from "@/lib/library/accountStore";
import { EMPTY_LIBRARY, type Library } from "@/lib/library/model";
import { getDeviceStore } from "@/lib/library/useLibrary";
import { moveDeviceWork } from "@/lib/account/moveDeviceWork";

export default function AccountPage() {
  const { account, ready } = useAccount();
  const [deviceLib, setDeviceLib] = useState<Library>(EMPTY_LIBRARY);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState("");
  const moved = useRef(false);

  const refreshDevice = useCallback(() => void getDeviceStore().load().then(setDeviceLib), []);
  useEffect(refreshDevice, [refreshDevice]);

  const signedIn = account.enabled && !!account.user;
  const deviceCount = deviceLib.manifestations.length;

  const userId = account.user?.id ?? "";
  const move = useCallback(async () => {
    if (!userId) return;
    setBusy("Moving your saved work into your account…");
    try {
      const r = await moveDeviceWork(getDeviceStore(), new AccountStore(), userId, (d, t) =>
        setBusy(`Moving your saved work into your account… ${d} of ${t}`),
      );
      const movedLine = `Moved ${r.moved} ${r.moved === 1 ? "manifestation" : "manifestations"} from this device into your account.`;
      setMsg(
        r.kept.length
          ? `${movedLine} Still on this device, try again later: ${r.kept.map((k) => `“${k.title}” (${k.reason})`).join("; ")}.`
          : movedLine,
      );
    } catch (e) {
      setMsg(`Your saved work could not be moved: ${e instanceof Error ? e.message : "unknown error"}. It is still on this device.`);
    }
    setBusy("");
    refreshDevice();
  }, [refreshDevice, userId]);

  // First visit after signing in: bring device work across once.
  useEffect(() => {
    if (signedIn && deviceCount > 0 && !moved.current) {
      moved.current = true;
      void move();
    }
  }, [signedIn, deviceCount, move]);

  const signIn = async (provider: "google" | "apple") => {
    setBusy(provider === "apple" ? "Opening Apple…" : "Opening Google…");
    const r = await authClient.signIn.social({ provider, callbackURL: "/account" }).catch(() => null);
    if (!r || r.error) {
      setBusy("");
      setMsg("Sign-in could not start. Try again in a moment.");
    }
  };

  const signOut = async () => {
    await authClient.signOut().catch(() => undefined);
    await fetchAccount(true);
    window.location.assign("/account");
  };

  const deleteAccount = async () => {
    setBusy("Deleting your account…");
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setBusy("");
      setMsg("Your account could not be deleted just now. Nothing was removed.");
      return;
    }
    await authClient.signOut().catch(() => undefined);
    await fetchAccount(true);
    window.location.assign("/account?deleted=1");
  };

  const clearDevice = async () => {
    if (!window.confirm("Delete every manifestation and playlist saved on this device?")) return;
    const d = getDeviceStore();
    for (const p of deviceLib.playlists) await d.deletePlaylist(p.id);
    for (const m of deviceLib.manifestations) await d.deleteManifestation(m.id);
    try {
      window.localStorage.removeItem("nv_free");
      window.localStorage.removeItem("nv_voice");
    } catch {
      /* nothing stored */
    }
    refreshDevice();
    setMsg("Everything saved on this device has been deleted.");
  };

  const [deleted, setDeleted] = useState(false);
  useEffect(() => setDeleted(new URLSearchParams(window.location.search).has("deleted")), []);

  if (!ready) return null;

  return (
    <>
      <h1>{signedIn ? "Your account" : "Create a free account"}</h1>
      {deleted && !signedIn && (
        <p className="notice" role="status">
          Your account, manifestations, recordings and playlists have been deleted.
        </p>
      )}

      {signedIn ? (
        <div className="card">
          <p>
            Signed in as <b>{account.user!.name}</b>
            <span className="muted"> ({account.user!.email})</span>
          </p>
          <p className="muted">
            Your <Link href="/library">manifestations</Link> and <Link href="/playlists">playlists</Link> are saved in
            your account and follow you to any device.
          </p>
          {deviceCount > 0 && !busy && (
            <button className="btn sm" onClick={move}>
              Move {deviceCount} from this device into my account
            </button>
          )}
          <div className="controls">
            <button className="btn sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="lede">Keep what you make, and play it back to back on any device. Free.</p>
          <div className="card">
            <ul className="steps">
              <li className="done">
                <span>✓ Everything you saved here moves into your account</span>
              </li>
              <li className="done">
                <span>✓ Your manifestations and playlists on your phone and computer</span>
              </li>
              <li className="done">
                <span>✓ Delete it all, any time</span>
              </li>
            </ul>
            <button className="btn primary block" onClick={() => signIn("google")} disabled={!account.enabled || !!busy}>
              Continue with Google
            </button>
            {account.providers?.includes("apple") && (
              <button className="btn block apple" onClick={() => signIn("apple")} disabled={!!busy}>
                <svg aria-hidden="true" width="14" height="17" viewBox="0 0 814 1000" style={{ marginRight: 8, verticalAlign: "-2px" }}>
                  <path
                    fill="currentColor"
                    d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-58-156-128C44 790 0 669 0 554c0-184 120-282 238-282 63 0 115 41 155 41 38 0 97-44 168-44 27 0 124 3 188 94zM554 157c30-35 51-84 51-133 0-7-1-14-2-19-48 2-105 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 2 14 2 43 0 97-29 128-70z"
                  />
                </svg>
                Continue with Apple
              </button>
            )}
            {!account.enabled && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Sign-in is not switched on here yet, so for now your work is saved on this device and you can keep
                using everything without an account.
                {account.missing?.length ? ` Waiting on: ${account.missing.join(", ")}.` : ""}
              </p>
            )}
          </div>
        </>
      )}

      {busy && (
        <p className="small muted" role="status">
          {busy}
        </p>
      )}
      {msg && (
        <p className="small muted" role="status">
          {msg}
        </p>
      )}

      <h2>{signedIn ? "Delete my account" : "On this device"}</h2>
      {signedIn ? (
        <div className="card">
          <p className="muted">
            This deletes your account, every manifestation, recording and playlist, and signs you out. It cannot be
            undone.
          </p>
          <label htmlFor="confirm">Type DELETE to confirm</label>
          <input id="confirm" type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <button className="btn block danger" disabled={confirm !== "DELETE" || !!busy} onClick={deleteAccount}>
            Delete my account
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            {deviceCount} {deviceCount === 1 ? "manifestation" : "manifestations"} and {deviceLib.playlists.length}{" "}
            {deviceLib.playlists.length === 1 ? "playlist" : "playlists"} saved in this browser. No one else can see
            them, and they are lost if you clear this site&apos;s data.
          </p>
          <button className="btn sm ghost danger" onClick={clearDevice} disabled={!deviceCount && !deviceLib.playlists.length}>
            Delete everything on this device
          </button>
        </div>
      )}
    </>
  );
}
