"use client";

import { createAuthClient } from "better-auth/react";

/** Better Auth's browser client. Its calls 404 harmlessly while accounts are off. */
export const authClient = createAuthClient();
