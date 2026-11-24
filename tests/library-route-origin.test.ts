// A write with a missing, null or foreign Origin must be refused before it does
// anything: no body read, no Blob upload, no tombstone row, no database use.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls: string[] = [];
const note = (n: string) => () => {
  calls.push(n);
  throw new Error(`${n} must not run`);
};

vi.mock("@/lib/server/accounts", () => ({
  PRIMARY_ORIGIN: "https://getneville.vercel.app",
  LEGACY_ORIGINS: ["https://neville-delta.vercel.app"],
  MAX_AUDIO_BYTES: 8 * 1024 * 1024,
  audioType: note("audioType"),
  currentUser: note("currentUser"),
  purgeAudio: note("purgeAudio"),
  reserveAudioKey: note("reserveAudioKey"),
  storeAudio: note("storeAudio"),
  withTx: note("withTx"),
  accountsEnabled: () => true,
  missingVars: () => [],
}));
vi.mock("@/lib/server/db", () => ({ getPool: note("getPool") }));
vi.mock("@/lib/server/libraryDb", () => ({
  addTombstones: note("addTombstones"),
  audioUsage: note("audioUsage"),
  clearTombstones: note("clearTombstones"),
  cleanManifestation: note("cleanManifestation"),
  deleteManifestation: note("deleteManifestation"),
  deletePlaylist: note("deletePlaylist"),
  deleteAccount: note("deleteAccount"),
  ensureProfile: note("ensureProfile"),
  isId: () => true,
  putManifestation: note("putManifestation"),
  putPlaylist: note("putPlaylist"),
  uploadRefusal: note("uploadRefusal"),
  MAX_ACCOUNT_AUDIO_BYTES: 1,
  MAX_ACCOUNT_RECORDINGS: 1,
}));

const URL_BASE = "https://getneville.vercel.app";
const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };

function put(origin: string | null, body: BodyInit, path = `/api/library/manifestations/${ID}`) {
  const headers: Record<string, string> = {};
  if (origin !== null) headers.origin = origin;
  return new Request(URL_BASE + path, { method: "PUT", headers, body });
}
const upload = () => {
  const f = new FormData();
  f.append("meta", JSON.stringify({ title: "t", lines: ["a"] }));
  f.append("audio", new Blob([new Uint8Array(16)]), "audio");
  return f;
};

beforeEach(() => {
  calls.length = 0;
});

describe("library writes refuse a bad Origin before doing any work", () => {
  const bad: Array<[string, string | null]> = [
    ["no Origin", null],
    ["null Origin", "null"],
    ["a foreign site", "https://evil.example"],
    ["a lookalike host", "https://getneville.vercel.app.evil.example"],
  ];
  for (const [label, origin] of bad) {
    it(`PUT manifestation with ${label}: 403, nothing touched`, async () => {
      const { PUT } = await import("@/app/api/library/manifestations/[id]/route");
      const req = put(origin, upload());
      const formData = vi.spyOn(req, "formData");
      const res = await PUT(req, ctx);
      expect(res.status).toBe(403);
      expect(formData).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    });
    it(`PUT playlist with ${label}: 403, nothing touched`, async () => {
      const { PUT } = await import("@/app/api/library/playlists/[id]/route");
      const req = put(origin, JSON.stringify({ name: "n", itemIds: [] }), `/api/library/playlists/${ID}`);
      const json = vi.spyOn(req, "json");
      const res = await PUT(req, ctx);
      expect(res.status).toBe(403);
      expect(json).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    });
    it(`DELETE manifestation with ${label}: 403, nothing touched`, async () => {
      const { DELETE } = await import("@/app/api/library/manifestations/[id]/route");
      const headers: Record<string, string> = {};
      if (origin !== null) headers.origin = origin;
      const res = await DELETE(new Request(URL_BASE + `/api/library/manifestations/${ID}`, { method: "DELETE", headers }), ctx);
      expect(res.status).toBe(403);
      expect(calls).toEqual([]);
    });
  }
});
