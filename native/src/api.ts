import { createApi } from "@/lib/api/client";
import { sessionHeaders } from "./auth";
import { API_URL } from "./config";

export { API_URL, appVersion } from "./config";

export const api = createApi({
  baseUrl: API_URL,
  // The session cookie and Origin (src/auth.ts). The server refuses writes without an Origin (#62).
  headers: () => sessionHeaders(),
  // The cookie is sent by hand; the iOS cookie jar must not add a second one.
  credentials: "omit",
});
