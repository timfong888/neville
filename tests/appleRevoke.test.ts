import { describe, expect, it } from "vitest";
import { appleSubject, exchangeAppleCode, readAppleCode, revokeAppleGrants, revokeAppleToken } from "@/lib/server/appleRevoke";

const web = { clientId: "com.example.web", clientSecret: "web-secret" };
const app = { clientId: "pckg.neville", clientSecret: "app-secret" };
const idToken = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`;

type Call = { path: string; form: Record<string, string> };
/** A stand-in for Apple: records each form post and answers by path. */
function apple(answer: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c = { path: new URL(url).pathname, form: Object.fromEntries(new URLSearchParams(String(init.body))) };
    calls.push(c);
    expect(new URL(url).origin).toBe("https://appleid.apple.com");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return answer(c);
  }) as unknown as typeof fetch;
  return { calls, f };
}
const ok = () => new Response(null, { status: 200 });

describe("Sign in with Apple revocation (#98)", () => {
  it("posts the token, its hint and the client's id and secret to Apple's revoke endpoint", async () => {
    const { calls, f } = apple(ok);
    expect(await revokeAppleToken(web, "rt", "refresh_token", f)).toBe(true);
    expect(calls).toEqual([{ path: "/auth/revoke", form: { client_id: "com.example.web", client_secret: "web-secret", token: "rt", token_type_hint: "refresh_token" } }]);
  });

  it("reports failure for a refusal, and for a network error, without throwing", async () => {
    expect(await revokeAppleToken(web, "rt", "refresh_token", apple(() => new Response("{}", { status: 400 })).f)).toBe(false);
    const down = (async () => {
      throw new Error("unreachable");
    }) as unknown as typeof fetch;
    expect(await revokeAppleToken(web, "rt", "refresh_token", down)).toBe(false);
    expect(await exchangeAppleCode(app, "code", down)).toBeNull();
  });

  it("exchanges an authorization code for a refresh token and its Apple user", async () => {
    const { calls, f } = apple(() => Response.json({ refresh_token: "new-rt", id_token: idToken("apple-user-1") }));
    expect(await exchangeAppleCode(app, "the-code", f)).toEqual({ refreshToken: "new-rt", subject: "apple-user-1" });
    expect(calls[0]).toEqual({ path: "/auth/token", form: { client_id: "pckg.neville", client_secret: "app-secret", grant_type: "authorization_code", code: "the-code" } });
    expect(appleSubject("not-a-token")).toBeNull();
  });

  it("accepts only a plausible code from the request body", () => {
    expect(readAppleCode({ appleAuthorizationCode: "c.1" })).toBe("c.1");
    for (const bad of [null, {}, { appleAuthorizationCode: 5 }, { appleAuthorizationCode: "" }, { appleAuthorizationCode: "x".repeat(2000) }]) {
      expect(readAppleCode(bad)).toBeUndefined();
    }
  });

  it("revokes the app's grant from a fresh code, with the app's client id", async () => {
    const { calls, f } = apple((c) => (c.path === "/auth/token" ? Response.json({ refresh_token: "new-rt", id_token: idToken("apple-user-1") }) : ok()));
    const links = [{ accountId: "apple-user-1", refreshToken: null, accessToken: null }];
    expect(await revokeAppleGrants({ links, code: "the-code", web, app, fetch: f })).toBe("revoked");
    expect(calls.map((c) => `${c.path} ${c.form.client_id} ${c.form.token ?? c.form.code}`)).toEqual(["/auth/token pckg.neville the-code", "/auth/revoke pckg.neville new-rt"]);
  });

  it("does not revoke with a code that belongs to a different Apple user", async () => {
    const { calls, f } = apple(() => Response.json({ refresh_token: "someone-elses", id_token: idToken("apple-user-2") }));
    const links = [{ accountId: "apple-user-1", refreshToken: null, accessToken: null }];
    expect(await revokeAppleGrants({ links, code: "the-code", web, app, fetch: f })).toBe("failed");
    expect(calls.map((c) => c.path)).toEqual(["/auth/token"]);
  });

  it("revokes the website's grant from its stored token, preferring the refresh token", async () => {
    const { calls, f } = apple(ok);
    expect(await revokeAppleGrants({ links: [{ accountId: "a", refreshToken: "rt", accessToken: "at" }], web, app, fetch: f })).toBe("revoked");
    expect(await revokeAppleGrants({ links: [{ accountId: "a", refreshToken: null, accessToken: "at" }], web, app, fetch: f })).toBe("revoked");
    expect(calls.map((c) => `${c.form.client_id} ${c.form.token} ${c.form.token_type_hint}`)).toEqual(["com.example.web rt refresh_token", "com.example.web at access_token"]);
  });

  it("says failed when Apple refuses or no client is configured, and nothing-to-revoke without an Apple sign-in", async () => {
    const refuse = apple(() => new Response("{}", { status: 400 })).f;
    const links = [{ accountId: "a", refreshToken: "rt", accessToken: null }];
    expect(await revokeAppleGrants({ links, web, app, fetch: refuse })).toBe("failed");
    expect(await revokeAppleGrants({ links, web: null, app: null, fetch: apple(ok).f })).toBe("failed");
    expect(await revokeAppleGrants({ links: [], code: "c", web, app, fetch: apple(ok).f })).toBe("nothing-to-revoke");
  });

  it("says failed, not nothing-to-revoke, for an app sign-in deleted without a code: the grant is still there", async () => {
    const { calls, f } = apple(ok);
    expect(await revokeAppleGrants({ links: [{ accountId: "a", refreshToken: null, accessToken: null }], web, app, fetch: f })).toBe("failed");
    expect(calls).toEqual([]);
  });
});
