import { describe, expect, it } from "vitest";
import { deleteDevicePrompt, deviceDataSummary } from "@/lib/deviceDataCopy";

describe("account page copy for data on this device (#100 follow-up)", () => {
  it("names the typed wish when it is the only thing saved", () => {
    expect(deviceDataSummary(0, 0, true)).toBe("Saved in this browser: the wish you were typing.");
    expect(deleteDevicePrompt(0, 0, true)).toBe("Delete the wish you were typing from this device?");
  });
  it("lists manifestations, playlists and the wish together", () => {
    expect(deviceDataSummary(1, 2, true)).toBe(
      "Saved in this browser: 1 manifestation, 2 playlists and the wish you were typing.",
    );
    expect(deleteDevicePrompt(3, 1, false)).toBe("Delete 3 manifestations and 1 playlist from this device?");
  });
  it("leaves out what is not there and says so when nothing is saved", () => {
    expect(deviceDataSummary(2, 0, false)).toBe("Saved in this browser: 2 manifestations.");
    expect(deviceDataSummary(0, 0, false)).toBe("Nothing is saved in this browser yet.");
  });
});

describe("native delete-account prompt (#121)", () => {
  it("says what is deleted and names what stays on the phone", async () => {
    const { deleteAccountPrompt } = await import("@/lib/deviceDataCopy");
    const p = deleteAccountPrompt({ manifestations: 2, playlists: 0, draft: true });
    expect(p).toContain("deletes your account");
    expect(p).toContain("It cannot be undone.");
    expect(p.endsWith("Staying on this phone: 2 manifestations and the wish you were typing.")).toBe(true);
  });
  it("says so when nothing is on the phone, or when it cannot be counted", async () => {
    const { deleteAccountPrompt } = await import("@/lib/deviceDataCopy");
    expect(deleteAccountPrompt({ manifestations: 0, playlists: 0, draft: false }).endsWith("Nothing is saved on this phone.")).toBe(true);
    expect(deleteAccountPrompt().endsWith("Anything saved on this phone stays on this phone.")).toBe(true);
  });
});
