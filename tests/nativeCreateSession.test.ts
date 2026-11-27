// Tests the invariant that the session race fix relies on:
// pickSpeed/pickCadence update in-memory state synchronously, so generate()
// reads the new value from state before the async settings.write() completes.
import { describe, it, expect, vi, beforeAll } from "vitest";

const { mockSettingsWrite } = vi.hoisted(() => ({
  mockSettingsWrite: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/native/src/accountStore", () => ({
  currentView: () => ({ account: null, checked: true }),
}));
vi.mock("@/native/src/api", () => ({ api: { manifest: vi.fn() } }));
vi.mock("@/native/src/config", () => ({ PAYWALL_ENABLED: false }));
vi.mock("@/native/src/seams/kv", () => ({
  kv: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(true), remove: vi.fn() },
}));
vi.mock("@/native/src/seams/library", () => ({
  library: { save: vi.fn(), subscribe: vi.fn(() => () => {}) },
}));
vi.mock("@/native/src/seams/settings", () => ({
  settings: {
    read: vi.fn().mockResolvedValue({
      voiceId: "gemini-sulafat", pace: "slow", tone: "calm",
      speedStep: "slower", cadenceStep: "natural",
    }),
    write: mockSettingsWrite,
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

let pickSpeed: (id: string) => Promise<boolean>;
let pickCadence: (id: string) => Promise<boolean>;
let getCreateState: () => { speedStep: string; cadenceStep: string };

beforeAll(async () => {
  ({ pickSpeed, pickCadence, getCreateState } = await import("@/native/src/create/session"));
});

describe("native create session — speed/cadence state update", () => {
  it("pickSpeed updates speedStep in state synchronously before settings.write resolves", async () => {
    let resolveWrite!: (v: boolean) => void;
    mockSettingsWrite.mockImplementationOnce(() => new Promise<boolean>((r) => { resolveWrite = r; }));

    const writePromise = pickSpeed("faster");

    // State must reflect the new choice immediately — the race fix relies on this
    expect(getCreateState().speedStep).toBe("faster");

    resolveWrite(true);
    await writePromise;
  });

  it("pickCadence updates cadenceStep in state synchronously before settings.write resolves", async () => {
    let resolveWrite!: (v: boolean) => void;
    mockSettingsWrite.mockImplementationOnce(() => new Promise<boolean>((r) => { resolveWrite = r; }));

    const writePromise = pickCadence("short");

    expect(getCreateState().cadenceStep).toBe("short");

    resolveWrite(true);
    await writePromise;
  });
});
