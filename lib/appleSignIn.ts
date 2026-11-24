// Sign in with Apple, the parts that are plain logic (the native app supplies the platform calls).
// Framework-free so it runs in tests and in React Native.

/** A fresh nonce as hex, from random bytes the caller got from the platform's secure generator. */
export function nonceFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error("A nonce needs at least 16 random bytes.");
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Apple puts the nonce it was given into the identity token. We give Apple the SHA-256 of the raw
 * value and give Better Auth the raw value, which it hashes and compares with the token's claim.
 * A token stolen from another sign-in cannot be replayed without the raw nonce.
 */
export type NoncePair = { raw: string; hashed: string };

export async function makeNoncePair(bytes: Uint8Array, sha256Hex: (s: string) => Promise<string>): Promise<NoncePair> {
  const raw = nonceFromBytes(bytes);
  return { raw, hashed: await sha256Hex(raw) };
}

/** What Apple returns for the person's name; only on the very first authorisation for an app. */
export type AppleFullName = { givenName?: string | null; familyName?: string | null } | null | undefined;

/** The `user` field Better Auth takes with an ID token, or undefined when Apple sent no name. */
export function appleUserFromFullName(
  name: AppleFullName,
): { name: { firstName?: string; lastName?: string } } | undefined {
  const firstName = name?.givenName?.trim() || undefined;
  const lastName = name?.familyName?.trim() || undefined;
  if (!firstName && !lastName) return undefined;
  return { name: { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) } };
}
