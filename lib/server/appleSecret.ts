// Sign in with Apple wants a "client secret" that is a short JWT signed with
// the Sign in with Apple private key (ES256), valid for at most six months.
// Making it here from the key means nobody has to regenerate one by hand.
import { createPrivateKey, sign } from "node:crypto";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Apple's limit is 15,777,000 seconds (about six months); stay well under it. */
export const APPLE_SECRET_TTL_S = 60 * 60 * 24 * 150;

export function appleClientSecret(opts: {
  teamId: string;
  keyId: string;
  /** The Services ID, e.g. com.example.web */
  clientId: string;
  /** Contents of the .p8 file. Escaped "\n" sequences are accepted. */
  privateKey: string;
  nowS?: number;
}): string {
  const now = opts.nowS ?? Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: opts.keyId, typ: "JWT" };
  const claims = {
    iss: opts.teamId,
    iat: now,
    exp: now + APPLE_SECRET_TTL_S,
    aud: "https://appleid.apple.com",
    sub: opts.clientId,
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = createPrivateKey(opts.privateKey.replace(/\\n/g, "\n"));
  const sig = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}
