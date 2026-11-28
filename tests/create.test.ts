import { describe, expect, it } from "vitest";
import { ApiError, type Recording, type WishRequest, readTitle } from "@/lib/api/client";
import { freeBanner, freeLeft, LIBRARY_TAB_ROUTE, LIBRARY_WEB_ROUTE, lineAt, makeManifestation, nextVariant, parseCount, NO_PICK, pickOnCreate, playlistLabel, seeSettingsVoice, toManifestation, voiceFor, wishRequest } from "@/lib/create";
import { parseDraft } from "@/lib/draftStore";
import { neutralScript } from "@/lib/script";
import { DEFAULT_VOICE_ID, ENABLED_VOICES, resolveVoice } from "@/lib/voices";

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
    const m = await makeManifestation(api(rec({ starts: [0, 0.3, 0.8], title: "I am calm" })), wish, true);
    expect(m.note).toBe("");
    expect(m.title).toBe("I am calm");
    expect(m.lines).toEqual(LINES);
    expect(m.recording).toMatchObject({ mime: "audio/wav", voiceName: resolveVoice(DEFAULT_VOICE_ID).name, starts: [0, 0.3, 0.8] });
  });
  it("estimates line starts when the server sent none", async () => {
    const m = await makeManifestation(api(rec()), wish, true);
    expect(m.recording?.starts).toHaveLength(LINES.length);
    expect(m.recording?.starts[0]).toBe(0);
  });
  it("says when the script is the general one (no reason)", async () => {
    const m = await makeManifestation(api(rec({ source: "template" })), wish, true);
    expect(m.note).toBe("A personal script could not be written just now, so this is a general one.");
  });

  it("uses FALLBACK_TITLE when the script is a template, never the typed wish", async () => {
    const m = await makeManifestation(api(rec({ source: "template" })), wish, true);
    expect(m.title).toBe("A moment of calm");
  });

  it("AT-4 (305): when the model returns no title, the client shows the generic fallback, not a clipped script line", async () => {
    // rec() has source:"model" but no title field — the server failed to generate one
    const m = await makeManifestation(api(rec()), wish, true);
    expect(m.title).toBe("A moment of calm"); // FALLBACK_TITLE, not displayTitle(toYouStatement(wish))
    expect(m.title).not.toBe("Calm"); // "Calm" = old clipped-wish fallback; must not appear
  });

  it("shows a withheld-specific note when reason is withheld", async () => {
    const m = await makeManifestation(api(rec({ source: "template", reason: "withheld" })), wish, true);
    expect(m.note).toBe("That wish was held back. Try describing adults only. This is a general script.");
    expect(m.title).toBe("A moment of calm");
  });

  it("includes the matched term in the withheld note when server sends one", async () => {
    const m = await makeManifestation(api(rec({ source: "template", reason: "withheld", term: "teen" })), wish, true);
    expect(m.note).toBe(`The word "teen" held this wish back. Try describing adults only. This is a general script.`);
  });

  it("shows the generic template note for all other failure reasons", async () => {
    for (const reason of ["timeout", "no_model", "http_status", "unusable_reply", "exception"]) {
      const m = await makeManifestation(api(rec({ source: "template", reason })), wish, true);
      expect(m.note).toBe("A personal script could not be written just now, so this is a general one.");
    }
  });
  it("says when the whole day's budget resets too", async () => {
    const m = await makeManifestation(api(new ApiError("Today's free recordings are used up. Try again tomorrow.", 429, "day_full")), wish, true);
    expect(m.note).toBe("Today's free recordings are used up. Try again tomorrow. It resets at midnight UTC. Here is a general version in your device's own voice.");
  });
  it("shows a limit refusal in the server's words and when it resets, with the general script", async () => {
    const m = await makeManifestation(api(new ApiError("You have used today's free recordings.", 429, "visitor_full")), wish, true);
    expect(m.recording).toBeNull();
    expect(m.note).toBe("You have used today's free recordings. It resets at midnight UTC. Here is a general version in your device's own voice.");
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
  });
  it("persists speedStep and cadenceStep so Library re-record can reuse them", async () => {
    const w = { want: "to be calm", name: "", speedStep: "faster", cadenceStep: "long" };
    const made = await makeManifestation({ manifest: async () => rec() }, w, false);
    const m = toManifestation(made, w, "id-sp", 5);
    expect(m.speedStep).toBe("faster");
    expect(m.cadenceStep).toBe("long");
  });
  it("omits speedStep/cadenceStep when not provided (backward-compat)", async () => {
    const w = { want: "to be calm", name: "" };
    const made = await makeManifestation({ manifest: async () => rec() }, w, false);
    const m = toManifestation(made, w, "id-no-sp", 5);
    expect(m).not.toHaveProperty("speedStep");
    expect(m).not.toHaveProperty("cadenceStep");
    const failed = await makeManifestation({ manifest: async () => { throw new Error("x"); } }, w, false);
    expect(toManifestation(failed, w, "id-2", 5)).toMatchObject({ title: "A moment of calm", voiceId: "", voiceName: "Device voice", hasAudio: false });
  });
  it("uses the AI title from the server when present", async () => {
    const m = await makeManifestation(api(rec({ title: "Magnetic confidence" })), wish, true);
    expect(m.title).toBe("Magnetic confidence");
  });
  it("falls back to FALLBACK_TITLE when the server sends no title on a model script", async () => {
    const m = await makeManifestation(api(rec()), wish, true);
    expect(m.title).toBe("A moment of calm"); // FALLBACK_TITLE — no clipped wish
    expect(m.title).not.toMatch(/…|\.\.\./);
  });
  it("uses FALLBACK_TITLE for template even when wish is set", async () => {
    const m = await makeManifestation(api(rec({ source: "template" })), wish, true);
    expect(m.title).toBe("A moment of calm");
  });

  it("uses the voice picked on Create, else the Settings voice (#150)", async () => {
    const other = ENABLED_VOICES.find((v) => v.generate && v.id !== DEFAULT_VOICE_ID)!;
    const sampleOnly = ENABLED_VOICES.find((v) => !v.generate);
    expect(voiceFor(other.id, DEFAULT_VOICE_ID)).toBe(other.id);
    expect(voiceFor(null, other.id)).toBe(other.id);
    expect(voiceFor("gone", "also-gone")).toBe(DEFAULT_VOICE_ID);
    if (sampleOnly) expect(voiceFor(sampleOnly.id, other.id)).toBe(other.id);
    // The pick reaches the request body and the Library item.
    let body: WishRequest | undefined;
    const w = { want: "to be calm", name: "Tim", voiceId: voiceFor(other.id, DEFAULT_VOICE_ID) };
    const made = await makeManifestation({ manifest: async (b) => ((body = b), rec({ voiceId: b.voiceId })) }, w, false);
    expect(body?.voiceId).toBe(other.id);
    expect(toManifestation(made, w, "id-3", 5)).toMatchObject({ voiceId: other.id, voiceName: other.name });
  });
  it("keeps a Create pick until the Settings voice changes (#150)", () => {
    const [a, b, c] = ENABLED_VOICES.filter((v) => v.generate).map((v) => v.id);
    // The first reading of Settings clears nothing and uses the Settings voice.
    const start = seeSettingsVoice(NO_PICK, a);
    expect(start).toEqual({ picked: null, settingsVoice: a, voiceId: a });
    // A pick wins, and survives re-reading the same Settings voice (a pace or tone change).
    const picked = pickOnCreate(start, b, start.voiceId);
    expect(picked).toEqual({ picked: b, settingsVoice: a, voiceId: b });
    expect(seeSettingsVoice(picked, a).voiceId).toBe(b);
    // A different Settings voice replaces the pick.
    expect(seeSettingsVoice(picked, c)).toEqual({ picked: null, settingsVoice: c, voiceId: c });
    // "Make this my default" is our own Settings write, so the pick stays.
    const made = pickOnCreate(start, b, start.voiceId, true);
    expect(seeSettingsVoice(made, b)).toEqual({ picked: b, settingsVoice: b, voiceId: b });
    // A pick made before Settings was ever read is kept by the first reading.
    expect(seeSettingsVoice(pickOnCreate(NO_PICK, b, a), a).voiceId).toBe(b);
    // A voice that may not be recorded is not picked.
    expect(pickOnCreate(start, "gone", a).voiceId).toBe(a);
  });
});

describe("exact mode (#229)", () => {
  it("sends scriptMode: exact in the request body when mode is exact", () => {
    const req = wishRequest({ want: "I am calm.", name: "", scriptMode: "exact" });
    expect(req).toMatchObject({ scriptMode: "exact" });
  });
  it("omits scriptMode when mode is enhance (default)", () => {
    const req = wishRequest({ want: "I am calm.", name: "" });
    expect(req).not.toHaveProperty("scriptMode");
    const req2 = wishRequest({ want: "I am calm.", name: "", scriptMode: "enhance" });
    expect(req2).not.toHaveProperty("scriptMode");
  });
  it("shows 'Your words, spoken to you.' as the note when source is exact", async () => {
    const m = await makeManifestation(api(rec({ source: "exact", scriptMode: "exact" })), wish, true);
    expect(m.note).toBe("Your words, spoken to you.");
    expect(m.scriptMode).toBe("exact");
  });
  it("a withheld wish in exact mode returns the template, same as enhance mode", async () => {
    const m = await makeManifestation(api(rec({ source: "template", reason: "withheld" })), { ...wish, scriptMode: "exact" }, true);
    expect(m.note).toBe("That wish was held back. Try describing adults only. This is a general script.");
    expect(m.scriptMode).toBeUndefined();
  });
});

describe("X-Title header round trip (#205)", () => {
  it("decodes a base64 UTF-8 title correctly", () => {
    const title = "Magnetic confidence";
    const b64 = btoa(unescape(encodeURIComponent(title)));
    expect(readTitle(b64)).toBe(title);
  });
  it("handles UTF-8 multi-byte characters", () => {
    const title = "Calm état";
    const bytes = new TextEncoder().encode(title);
    const b64 = btoa(String.fromCharCode(...bytes));
    expect(readTitle(b64)).toBe(title);
  });
  it("returns undefined for null or empty header", () => {
    expect(readTitle(null)).toBeUndefined();
    expect(readTitle("")).toBeUndefined();
  });
  it("returns undefined for a corrupt value, not an error", () => {
    expect(readTitle("not-valid-base64!!!")).toBeUndefined();
  });
});

describe("playlist button (#241)", () => {
  it("shows 'My playlist' when already saved", () => {
    expect(playlistLabel("some-saved-id")).toBe("My playlist");
  });
  it("shows 'Save and open playlist' when not yet saved", () => {
    expect(playlistLabel("")).toBe("Save and open playlist");
  });
  it("native route targets the library tab", () => {
    expect(LIBRARY_TAB_ROUTE).toBe("/(tabs)/library");
  });
  it("web route targets the library page", () => {
    expect(LIBRARY_WEB_ROUTE).toBe("/library");
  });
});
