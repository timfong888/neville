import { createAuthClient } from "better-auth/react";
import type { AuthSeam } from "./types";

// On the web the session is a browser cookie on this origin; /api is rewritten to the Next deployment.
export const authClient = createAuthClient();

export const auth: AuthSeam = {
  async sessionHeaders() {
    return {};
  },
  async signInWithApple() {
    // Web redirect flow: leaves the page, and comes back signed in.
    const res = await authClient.signIn.social({ provider: "apple", callbackURL: "/" });
    return res.error ? { ok: false, cancelled: false, message: res.error.message ?? "Sign-in was refused." } : { ok: true };
  },
  async signOut() {
    await authClient.signOut();
  },
};
