// A typed client for Neville's own /api routes. Framework-free: it needs only
// `fetch` and `FormData`, so the native app and tests can use it. The base URL
// and the auth headers are injected, because a phone has no page origin and
// keeps its session in secure storage rather than in a browser cookie jar.
import { type Library, type Manifestation, type Playlist, parseLibrary } from "@/lib/library/model";

export type PackInfo = { id: string; credits: number; price: string };
export type CreditsResponse = {
  balance: number;
  unlimited: boolean;
  paywallEnabled: boolean;
  signInRequired: boolean;
  packs: PackInfo[];
};

/** Safe fields retained from an unsuccessful API response. */
export type ApiErrorData = {
  code?: string;
  balance?: number;
  creditReturned?: boolean;
};

export type AccountState = {
  enabled: boolean;
  user: { id: string; name: string; email: string; image: string | null } | null;
  missing?: string[];
  providers?: ("google" | "apple")[];
};

/** What a `POST /api/manifest` or `/api/rerecord` returns: the recording and what it was made from. */
export type Recording = {
  /** The audio bytes. The caller writes them to a file or hands them to a player. */
  audio: ArrayBuffer;
  mime: string;
  lines: string[];
  voiceId: string;
  source: string;
  /** Line start times as fractions of the clip, when the server sent sound ones. */
  starts?: number[];
};

/** Thrown for any non-2xx response. `lines` is the written script when only the voice failed. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly lines?: string[],
    readonly data?: ApiErrorData,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * A file to upload: a Blob on the web; on a phone, a Blob or an object with `bytes()` (Expo's `File`
 * from expo-file-system). Expo SDK 58's fetch rejects React Native's `{ uri, name, type }` shape.
 */
export type FileLike = Blob | { bytes(): Promise<Uint8Array> | Uint8Array };

export type ApiOptions = {
  /** For example `https://getneville.vercel.app`. No trailing slash needed. */
  baseUrl: string;
  /** Extra headers for every request: the session cookie, and the origin on a phone. May be async. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** `"omit"` on a phone: its cookie jar must not add a second Cookie header to the one we send. */
  credentials?: RequestCredentials;
  /** Defaults to the global `fetch`. Tests inject their own. */
  fetch?: typeof fetch;
};

export type WishRequest = {
  want: string;
  name?: string;
  voiceId?: string;
  variant?: number;
  pace?: unknown;
  tone?: unknown;
};

/** Line start times from the `X-Line-Starts` header, or undefined unless they are all sound. */
export function readStarts(header: string | null, count: number): number[] | undefined {
  try {
    const v = JSON.parse(header ?? "null");
    const ok = Array.isArray(v) && v.length === count && v.every((n) => typeof n === "number" && n >= 0 && n <= 1);
    return ok ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The script from the `X-Script` header: base64 of UTF-8 JSON, an array of strings. */
export function readScript(header: string | null): string[] {
  const bin = atob(header ?? "");
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const lines = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(lines) || !lines.every((l) => typeof l === "string")) throw new Error("bad script");
  return lines;
}

export function createApi(opts: ApiOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const extra = (await opts.headers?.()) ?? {};
    const res = await doFetch(`${base}${path}`, { cache: "no-store", ...(opts.credentials ? { credentials: opts.credentials } : {}), ...init, headers: { ...extra, ...(init.headers as Record<string, string>) } });
    if (res.ok) return res;
    const j = (await res.json().catch(() => null)) as { error?: string; code?: string; lines?: unknown; balance?: unknown; creditReturned?: unknown } | null;
    const lines = Array.isArray(j?.lines) && j.lines.every((l) => typeof l === "string") ? (j.lines as string[]) : undefined;
    const data = j
      ? {
          ...(typeof j.code === "string" ? { code: j.code } : {}),
          ...(typeof j.balance === "number" ? { balance: j.balance } : {}),
          ...(j.creditReturned === true ? { creditReturned: true } : {}),
        }
      : undefined;
    throw new ApiError(j?.error ?? `Request failed (${res.status}).`, res.status, j?.code, lines, data);
  }

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  /** `lines` is the script already known to the caller; `/api/rerecord` does not send `X-Script` back. */
  async function recording(res: Response, lines?: string[]): Promise<Recording> {
    const script = lines ?? readScript(res.headers.get("X-Script"));
    return {
      audio: await res.arrayBuffer(),
      mime: res.headers.get("Content-Type") ?? "audio/mpeg",
      lines: script,
      voiceId: res.headers.get("X-Voice-Id") ?? "",
      source: res.headers.get("X-Script-Source") ?? "",
      starts: readStarts(res.headers.get("X-Line-Starts"), script.length),
    };
  }

  return {
    /** Whether accounts are on, and who is signed in. */
    async account(): Promise<AccountState> {
      return (await (await call("/api/account")).json()) as AccountState;
    },
    /**
     * Deletes the signed-in account and everything in it. `appleAuthorizationCode` is a fresh code from
     * the Sign in with Apple sheet; with it the server can revoke the Apple grant (#98).
     */
    async deleteAccount(opts: { appleAuthorizationCode?: string } = {}): Promise<void> {
      const code = opts.appleAuthorizationCode;
      await call("/api/account", code ? { ...json({ appleAuthorizationCode: code }), method: "DELETE" } : { method: "DELETE" });
    },

    /** A wish in; a script and its recording out. One paid request. */
    async manifest(req: WishRequest): Promise<Recording> {
      return recording(await call("/api/manifest", json(req)));
    },
    /** Records an existing script again, in one voice. */
    async rerecord(lines: string[], voiceId: string): Promise<Recording> {
      return recording(await call("/api/rerecord", json({ lines, voiceId })), lines);
    },

    async credits(): Promise<CreditsResponse> {
      return (await (await call("/api/credits")).json()) as CreditsResponse;
    },

    async voices(): Promise<unknown> {
      return (await call("/api/voices")).json();
    },
    async status(): Promise<unknown> {
      return (await call("/api/status")).json();
    },

    library: {
      async load(): Promise<Library> {
        return parseLibrary(await (await call("/api/library")).json());
      },
      /** `audio` undefined keeps the stored recording; null removes it. */
      async putManifestation(m: Manifestation, audio?: FileLike | null): Promise<void> {
        const form = new FormData();
        // `append`, not `set`: React Native's FormData has no `set`.
        form.append("meta", JSON.stringify(m));
        if (audio) (form as { append(k: string, v: unknown, name?: string): void }).append("audio", audio, "audio");
        if (audio === null) form.append("removeAudio", "1");
        await call(`/api/library/manifestations/${encodeURIComponent(m.id)}`, { method: "PUT", body: form });
      },
      async deleteManifestation(id: string): Promise<void> {
        await call(`/api/library/manifestations/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      /** The stored recording, or null when there is none. */
      async audio(id: string): Promise<ArrayBuffer | null> {
        try {
          return await (await call(`/api/library/manifestations/${encodeURIComponent(id)}/audio`)).arrayBuffer();
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }
      },
      async putPlaylist(p: Playlist): Promise<void> {
        await call(`/api/library/playlists/${encodeURIComponent(p.id)}`, { ...json(p), method: "PUT" });
      },
      async deletePlaylist(id: string): Promise<void> {
        await call(`/api/library/playlists/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
    },
  };
}

export type Api = ReturnType<typeof createApi>;
