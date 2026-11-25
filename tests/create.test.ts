import { describe, expect, it } from "vitest";
import { ApiError, type Recording, type WishRequest } from "@/lib/api/client";
import { freeBanner, freeLeft, lineAt, makeManifestation, nextVariant, parseCount, toManifestation, wishRequest } from "@/lib/create";
import { parseDraft } from "@/lib/draftStore";
import { neutralScript } from "@/lib/script";
import { DEFAULT_VOICE_ID, resolveVoice } from "@/lib/voices";

const LINES = ["Tim, breathe in.", "You speak with calm.", "It is done."];
const rec = (over: Partial<Recording> = {}): Recording => ({ audio: new ArrayBuffer(4), mime: "audio/wav", lines: LINES, voiceId: DEFAULT_VOICE_ID, source: "model", ...over });
const api = (out: Recording | Error, seen: WishRequest[] = []) => ({
  manifest: async (r: WishRequest) => {
    seen.push(r);
    if (out instanceof Error) throw out;
    return out;
  },
});
const wish = { want: "  I want to be calm  ", name: " Tim " };

describe("the Create flow (#120)", () => {
  it("sends the trimmed wish, a known voice id and the Settings choices", async () => {
    const seen: WishRequest[] = [];
    await makeManifestation(api(rec(), seen), { ...wish, voiceId: "no-such-voice", variant: 2, pace: "slow", tone: "warm" }, true);
    expect(seen).toEqual([{ want: "I want to be calm", name: "Tim", voiceId: DEFAULT_VOICE_ID, variant: 2, pace: "slow", tone: "warm" }]);
  });
  it("cuts the wish and name to the web limits", () => {
    const r = wishRequest({ want: "w".repeat(400), name: "n".repeat(80) });
    expect([r.want.length, r.name?.length, r.variant]).toEqual([280, 40, 0]);
  });
  it("returns the recording with the server's line starts", async () => {
    const m = await makeManifestation(api(rec({ starts: [0, 0.3, 0.8] })), wish, true);
    expect(m.note).toBe("");
    expect(m.title).toBe("You are calm");
    expect(m.lines).toEqual(LINES);
    expect(m.recording).toMatchObject({ mime: "audio/wav", voiceName: resolveVoice(DEFAULT_VOICE_ID).name, starts: [0, 0.3, 0.8] });
  });
  it("estimates line starts when the server sent none", async () => {
    const m = await makeManifestation(api(rec()), wish, true);
    expect(m.recording?.starts).toHaveLength(LINES.length);
    expect(m.recording?.starts[0]).toBe(0);
  });
  it("says when the script is the general one", async () => {
    const m = await makeManifestation(api(rec({ source: "template" })), wish, true);
    expect(m.note).toBe("A personal script could not be written just now, so this is a general one.");
  });
  it("shows a limit refusal in the server's words, with the general script", async () => {
    const m = await makeManifestation(api(new ApiError("You have used today's free recordings.", 429, "visitor_full")), wish, true);
    expect(m.recording).toBeNull();
    expect(m.note).toBe("You have used today's free recordings. Here is a general version in your device's own voice.");
    expect(m.lines).toEqual(neutralScript("Tim"));
  });
  it("keeps the server's script when only the voice failed", async () => {
    const m = await makeManifestation(api(new ApiError("The voice could not be recorded just now.", 502, "voice_failed", LINES)), wish, false);
    expect(m.lines).toEqual(LINES);
    expect(m.title).toBe("A moment of calm");
    expect(m.note).toBe("The voice could not be recorded just now. Here is your script to read.");
  });
  it("never reads the typed wish back when the request fails", async () => {
    for (const e of [new Error("offline"), new ApiError("Request failed (504).", 504)]) {
      const m = await makeManifestation(api(e), { want: "something unkind", name: "" }, true);
      expect(m.lines.join(" ")).not.toContain("unkind");
      expect(m.title).toBe("A moment of calm");
    }
    expect((await makeManifestation(api(new Error("offline")), wish, true)).note).toMatch(/^The recording could not be made just now\./);
    expect((await makeManifestation(api(new ApiError("Request failed (504).", 504)), wish, true)).note).toMatch(/^Recording is not available just now\./);
  });
  it("counts free creations like the website", () => {
    expect([parseCount(null), parseCount("2"), parseCount("x"), parseCount("-1")]).toEqual([0, 2, 0, 0]);
    expect([freeLeft(0), freeLeft(1), freeLeft(5)]).toEqual([2, 1, 0]);
    expect(freeBanner(1)).toBe("1 free creation left without an account.");
    expect(freeBanner(2)).toBe("You have used your free creations.");
  });
  it("cycles variants and finds the spoken line", () => {
    expect([nextVariant(0), nextVariant(2)]).toEqual([1, 0]);
    expect([0, 0.29, 0.3, 0.99].map((t) => lineAt([0, 0.3, 0.8], t))).toEqual([0, 0, 1, 2]);
  });
  it("reads a stored draft within the limits", () => {
    expect(parseDraft(JSON.stringify({ want: "w".repeat(300), name: 7 }))).toEqual({ want: "w".repeat(280), name: "" });
    expect(parseDraft("{bad")).toEqual({ want: "", name: "" });
  });
  it("builds the Library item as the website's Save does", async () => {
    const w = { want: " to be calm ", name: " Tim " };
    const made = await makeManifestation({ manifest: async () => rec() }, w, false);
    expect(toManifestation(made, w, "id-1", 5)).toEqual({
      id: "id-1", title: made.title, want: "to be calm", firstName: "Tim", lines: LINES,
      voiceId: made.recording?.voiceId, voiceName: made.recording?.voiceName, hasAudio: true, createdAt: 5, updatedAt: 5,
    });
    const failed = await makeManifestation({ manifest: async () => { throw new Error("x"); } }, w, false);
    expect(toManifestation(failed, w, "id-2", 5)).toMatchObject({ title: "A moment of calm", voiceId: "", voiceName: "Device voice", hasAudio: false });
  });
});
