import Constants from "expo-constants";

/** The site the app talks to. Override with EXPO_PUBLIC_API_URL for a preview deployment. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://getneville.vercel.app";
export const appVersion = Constants.expoConfig?.version ?? "dev";
