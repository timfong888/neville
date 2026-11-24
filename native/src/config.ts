import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * The server the app talks to. On a phone: the production site, or EXPO_PUBLIC_API_URL for a preview.
 * On the web: empty, so calls are same-origin and the host rewrites /api to the Next deployment.
 */
export const API_URL = Platform.OS === "web" ? "" : (process.env.EXPO_PUBLIC_API_URL ?? "https://getneville.vercel.app");
export const appVersion = Constants.expoConfig?.version ?? "dev";
