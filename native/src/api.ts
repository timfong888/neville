import { Platform } from "react-native";
import { createApi } from "@/lib/api/client";
import { auth } from "./seams/auth";
import { API_URL } from "./config";

export { API_URL, appVersion } from "./config";

export const api = createApi({
  baseUrl: API_URL,
  // Native: the stored cookie and an Origin the server accepts (#62). Web: nothing, the browser adds both.
  headers: () => auth.sessionHeaders(),
  // Native sends its cookie by hand, so the cookie jar must not add a second one. Web needs the jar.
  credentials: Platform.OS === "web" ? "same-origin" : "omit",
});
