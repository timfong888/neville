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
