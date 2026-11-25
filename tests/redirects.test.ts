import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("site redirects", () => {
  it("sends the removed /architecture page to the home page, permanently", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules).toContainEqual({ source: "/architecture", destination: "/", permanent: true });
  });
  it("redirects nothing else", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules.map((r) => r.source)).toEqual(["/architecture"]);
  });
});
