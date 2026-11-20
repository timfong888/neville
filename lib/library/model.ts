// Framework-free: no Next, React or browser APIs, so a native app and the
// server store can import it. The saved library: manifestations and playlists.

export type Manifestation = {
  id: string;
  /** Generated from the wish; editable. */
  title: string;
  /** What the person typed. */
  want: string;
  firstName: string;
  /** The script, one spoken line per entry. */
  lines: string[];
  voiceId: string;
  voiceName: string;
  /** True when a recording is stored with it. False plays the device's own voice. */
  hasAudio: boolean;
  createdAt: number;
  updatedAt: number;
};

/** A named, ordered set of manifestations. */
export type Playlist = {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type Library = { manifestations: Manifestation[]; playlists: Playlist[] };

export const EMPTY_LIBRARY: Library = { manifestations: [], playlists: [] };

export const MAX_TITLE = 80;
export const MAX_LINE = 400;
export const MAX_LINES = 40;
export const MAX_PLAYLIST_NAME = 60;
export const MAX_PLAYLIST_ITEMS = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for the id format the server accepts. */
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}

/**
 * Always a version-4 UUID, which the account store requires. Browsers without
 * crypto.randomUUID (older Safari, plain-http pages) get one built from
 * getRandomValues, or from Math.random as a last resort.
 */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function cleanTitle(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
}

/** Script text from an editor: one line per non-empty row, capped. */
export function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim().slice(0, MAX_LINE))
    .filter(Boolean)
    .slice(0, MAX_LINES);
}

export function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

/** Newest first: the order of the library list and of "Play all". */
export function newestFirst(ms: Manifestation[]): Manifestation[] {
  return [...ms].sort((a, b) => b.createdAt - a.createdAt);
}

export function makePlaylist(name: string, now = Date.now()): Playlist {
  return {
    id: newId(),
    name: cleanTitle(name).slice(0, MAX_PLAYLIST_NAME) || "My playlist",
    itemIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function renamePlaylist(p: Playlist, name: string, now = Date.now()): Playlist {
  const n = cleanTitle(name).slice(0, MAX_PLAYLIST_NAME);
  return n ? { ...p, name: n, updatedAt: now } : p;
}

/** Adds once; a manifestation already in the playlist stays where it is. */
export function addItem(p: Playlist, id: string, now = Date.now()): Playlist {
  if (p.itemIds.includes(id) || p.itemIds.length >= MAX_PLAYLIST_ITEMS) return p;
  return { ...p, itemIds: [...p.itemIds, id], updatedAt: now };
}

export function removeItem(p: Playlist, index: number, now = Date.now()): Playlist {
  if (index < 0 || index >= p.itemIds.length) return p;
  return { ...p, itemIds: p.itemIds.filter((_, i) => i !== index), updatedAt: now };
}

/** Moves the item at `index` by `by` places (-1 up, +1 down), clamped to the ends. */
export function moveItem(p: Playlist, index: number, by: number, now = Date.now()): Playlist {
  const to = Math.max(0, Math.min(p.itemIds.length - 1, index + by));
  if (index < 0 || index >= p.itemIds.length || to === index) return p;
  const ids = [...p.itemIds];
  const [it] = ids.splice(index, 1);
  ids.splice(to, 0, it);
  return { ...p, itemIds: ids, updatedAt: now };
}

/** The manifestations a playlist plays, in order, skipping any since deleted. */
export function resolveItems(p: Playlist, ms: Manifestation[]): Manifestation[] {
  const byId = new Map(ms.map((m) => [m.id, m]));
  return p.itemIds.map((id) => byId.get(id)).filter((m): m is Manifestation => !!m);
}

/** Removes a manifestation everywhere it is referenced. */
export function withoutManifestation(lib: Library, id: string, now = Date.now()): Library {
  return {
    manifestations: lib.manifestations.filter((m) => m.id !== id),
    playlists: lib.playlists.map((p) =>
      p.itemIds.includes(id) ? { ...p, itemIds: p.itemIds.filter((x) => x !== id), updatedAt: now } : p,
    ),
  };
}

/** Accepts only well-formed stored data; anything else is dropped, not trusted. */
export function parseLibrary(raw: unknown): Library {
  if (!raw || typeof raw !== "object") return EMPTY_LIBRARY;
  const r = raw as { manifestations?: unknown; playlists?: unknown };
  const str = (v: unknown) => typeof v === "string";
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const manifestations = (Array.isArray(r.manifestations) ? r.manifestations : []).filter(
    (m): m is Manifestation =>
      !!m &&
      str(m.id) &&
      str(m.title) &&
      str(m.want) &&
      str(m.firstName) &&
      Array.isArray(m.lines) &&
      m.lines.every(str) &&
      str(m.voiceId) &&
      str(m.voiceName) &&
      typeof m.hasAudio === "boolean" &&
      num(m.createdAt) &&
      num(m.updatedAt),
  );
  const ids = new Set(manifestations.map((m) => m.id));
  const playlists = (Array.isArray(r.playlists) ? r.playlists : [])
    .filter(
      (p): p is Playlist =>
        !!p && str(p.id) && str(p.name) && Array.isArray(p.itemIds) && p.itemIds.every(str) && num(p.createdAt) && num(p.updatedAt),
    )
    .map((p) => ({ ...p, itemIds: p.itemIds.filter((id) => ids.has(id)) }));
  return { manifestations, playlists };
}
