import * as SecureStore from "expo-secure-store";
import * as AppleAuthentication from "expo-apple-authentication";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { API_URL } from "./config";

/** The URL scheme registered in app.json. The server trusts it as an origin. */
export const SCHEME = "neville";

/** Better Auth for the phone. The session cookie lives in the iOS keychain via SecureStore. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [expoClient({ scheme: SCHEME, storagePrefix: SCHEME, storage: SecureStore })],
});

/** What our own API calls must carry: the stored session cookie, and an Origin the server accepts. */
export async function sessionHeaders(): Promise<Record<string, string>> {
  const cookie = await authClient.getCookie();
  return { Origin: `${SCHEME}://`, ...(cookie ? { Cookie: cookie } : {}) };
}

export type AppleResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

/**
 * Sign in with Apple through the system sheet. Apple returns an identity token;
 * the server checks it against the bundle id (APPLE_APP_BUNDLE_ID) and opens a session.
 * No browser redirect is involved.
 */
export async function signInWithApple(): Promise<AppleResult> {
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) return { ok: false, cancelled: false, message: "Apple sent no identity token." };
    const res = await authClient.signIn.social({ provider: "apple", idToken: { token: cred.identityToken } });
    if (res.error) return { ok: false, cancelled: false, message: res.error.message ?? "Sign-in was refused." };
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { ok: false, cancelled: code === "ERR_REQUEST_CANCELED", message: e instanceof Error ? e.message : "Sign-in failed." };
  }
}
