import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APPLE_SECRET_TTL_S, appleClientSecret } from "@/lib/server/appleSecret";

describe("appleClientSecret", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("is an ES256 JWT with the claims Apple checks, signed by the key", () => {
    const jwt = appleClientSecret({ teamId: "TEAM123456", keyId: "KEY1234567", clientId: "com.example.web", privateKey: pem, nowS: 1000 });
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1000,
      exp: 1000 + APPLE_SECRET_TTL_S,
      aud: "https://appleid.apple.com",
      sub: "com.example.web",
    });
    expect(APPLE_SECRET_TTL_S).toBeLessThan(15_777_000);
    const ok = verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("accepts a key pasted with escaped newlines", () => {
    const escaped = pem.trim().replace(/\n/g, "\\n");
    expect(appleClientSecret({ teamId: "T", keyId: "K", clientId: "c", privateKey: escaped }).split(".")).toHaveLength(3);
  });
});
