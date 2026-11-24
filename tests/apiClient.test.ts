import { describe, expect, it } from "vitest";
import { ApiError, createApi, readScript, readStarts } from "@/lib/api/client";

type Call = { url: string; init: RequestInit };

function fake(res: () => Response) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return res();
  }) as unknown as typeof fetch;
  return { calls, f };
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64");

describe("api client", () => {
  it("prefixes the base URL and adds the injected headers", async () => {
    const { calls, f } = fake(() => Response.json({ enabled: true, user: null }));
    const api = createApi({ baseUrl: "https://x.test/", fetch: f, headers: async () => ({ Cookie: "a=b", Origin: "neville://" }) });
    expect((await api.account()).enabled).toBe(true);
    expect(calls[0].url).toBe("https://x.test/api/account");
    expect(calls[0].init.headers).toMatchObject({ Cookie: "a=b", Origin: "neville://" });
  });

  it("reads a manifest recording from the response headers", async () => {
    const { f } = fake(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Script": b64(["One.", "Two."]),
            "X-Voice-Id": "v1",
            "X-Script-Source": "model",
            "X-Line-Starts": "[0,0.5]",
          },
        }),
    );
    const r = await createApi({ baseUrl: "https://x.test", fetch: f }).manifest({ want: "calm" });
    expect(r.lines).toEqual(["One.", "Two."]);
    expect(r.voiceId).toBe("v1");
    expect(r.starts).toEqual([0, 0.5]);
    expect(new Uint8Array(r.audio)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("raises ApiError with the server's message and any written script", async () => {
    const { f } = fake(() => Response.json({ code: "voice_failed", error: "No voice.", lines: ["A."] }, { status: 502 }));
    const err = await createApi({ baseUrl: "https://x.test", fetch: f }).manifest({ want: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: "voice_failed", message: "No voice.", lines: ["A."] });
  });

  it("returns null for a missing recording and sends writes as PUT and DELETE", async () => {
    const { calls, f } = fake(() => new Response("{}", { status: 404 }));
    const api = createApi({ baseUrl: "https://x.test", fetch: f });
    expect(await api.library.audio("abc")).toBeNull();
    await expect(api.library.deleteManifestation("abc")).rejects.toBeInstanceOf(ApiError);
    await expect(api.library.putPlaylist({ id: "p", name: "n", itemIds: [], createdAt: 1, updatedAt: 1 })).rejects.toBeInstanceOf(ApiError);
    expect(calls.map((c) => c.init.method)).toEqual([undefined, "DELETE", "PUT"]);
  });

  it("parses headers defensively", () => {
    expect(readStarts("[0,2]", 2)).toBeUndefined();
    expect(readStarts("nope", 2)).toBeUndefined();
    expect(() => readScript(b64({ no: 1 }))).toThrow();
  });
});
