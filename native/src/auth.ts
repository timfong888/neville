import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as AppleAuthentication from "expo-apple-authentication";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { appleUserFromFullName, type DeletionCode, deletionCodeFromSheet, makeNoncePair } from "@/lib/appleSignIn";
import { API_URL } from "./config";
import { sessionStorage } from "./secureStorage";

/** The URL scheme registered in app.json. The server trusts it as an origin. */
export const SCHEME = "neville";

/** Better Auth for the phone. The session cookie lives in the iOS keychain via SecureStore. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [expoClient({ scheme: SCHEME, storagePrefix: SCHEME, storage: sessionStorage })],
});

/** What our own API calls must carry: the stored session cookie, and an Origin the server accepts. */
export async function sessionHeaders(): Promise<Record<string, string>> {
  // On the web the browser adds its own cookie and Origin, and SecureStore does not exist there.
  if (Platform.OS === "web") return {};
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
    // A fresh nonce per attempt: Apple gets its SHA-256, Better Auth gets the raw value to check against the token.
    const nonce = await makeNoncePair(await Crypto.getRandomBytesAsync(32), (v) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, v),
    );
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });
    if (!cred.identityToken) return { ok: false, cancelled: false, message: "Apple sent no identity token." };
    // Apple returns the name only on the first authorisation, so it goes along now or never.
    const user = appleUserFromFullName(cred.fullName);
    const res = await authClient.signIn.social({
      provider: "apple",
      idToken: { token: cred.identityToken, nonce: nonce.raw, ...(user ? { user } : {}) },
    });
    if (res.error) return { ok: false, cancelled: false, message: res.error.message ?? "Sign-in was refused." };
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { ok: false, cancelled: code === "ERR_REQUEST_CANCELED", message: e instanceof Error ? e.message : "Sign-in failed." };
  }
}

/**
 * A fresh Apple authorization code, asked for just before the account is deleted. The server
 * exchanges it and revokes the Apple grant (App Review 5.1.1(v), #98). On iOS, no code means no
 * deletion (see deletionCodeFromSheet); the web has no sheet and goes ahead without one.
 */
export function appleCodeForDeletion(): Promise<DeletionCode> {
  return deletionCodeFromSheet(Platform.OS === "ios" ? () => AppleAuthentication.signInAsync({ requestedScopes: [] }) : null);
}

/** On the web there is no system sheet: Apple sign-in is Better Auth's redirect, returning to `/account`. */
export async function signInWithAppleOnWeb(): Promise<AppleResult> {
  const res = await authClient.signIn.social({ provider: "apple", callbackURL: "/account" }).catch(() => null);
  if (!res || res.error) return { ok: false, cancelled: false, message: res?.error?.message ?? "Sign-in could not start. Try again in a moment." };
  return { ok: true };
}
