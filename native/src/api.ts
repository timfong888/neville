import Constants from "expo-constants";
import { createApi } from "@/lib/api/client";

/** The site the app talks to. Override with EXPO_PUBLIC_API_URL for a preview deployment. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://getneville.vercel.app";

/** Headers every request carries. Auth adds the session cookie here. */
async function headers(): Promise<Record<string, string>> {
  return {};
}

export const api = createApi({ baseUrl: API_URL, headers });
export const appVersion = Constants.expoConfig?.version ?? "dev";
