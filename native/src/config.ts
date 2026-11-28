import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * The server the app talks to. On a phone: the production site, or EXPO_PUBLIC_API_URL for a preview.
 * On the web: empty, so calls are same-origin and the host rewrites /api to the Next deployment.
 */
export const API_URL = Platform.OS === "web" ? "" : (process.env.EXPO_PUBLIC_API_URL ?? "https://getneville.vercel.app");
export const appVersion = Constants.expoConfig?.version ?? "dev";
export const PAYWALL_ENABLED = process.env.EXPO_PUBLIC_PAYWALL === "1";
/** Off in production. Set EXPO_PUBLIC_SHOW_VOICE_MODEL=1 in a testing EAS profile to show provider names in voice rows. */
export const SHOW_VOICE_MODEL = process.env.EXPO_PUBLIC_SHOW_VOICE_MODEL === "1";
