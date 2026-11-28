// Profile name store: idempotent save, one reader path.
import { describe, expect, it, vi, beforeEach } from "vitest";

const kvStore: Record<string, string> = {};
const kvMock = {
  get: vi.fn(async (k: string) => kvStore[k] ?? null),
  set: vi.fn(async (k: string, v: string) => { kvStore[k] = v; return true; }),
  remove: vi.fn(),
};
vi.mock("@/native/src/seams/kv", () => ({ kv: kvMock }));
vi.mock("@/native/src/accountStore", () => ({ currentView: () => ({ account: null, checked: true }) }));
vi.mock("@/native/src/api", () => ({
  api: { profileName: vi.fn().mockResolvedValue({ firstName: "", plan: "free" }), saveProfileName: vi.fn() },
}));

let save: (n: string) => Promise<void>;
let load: () => Promise<void>;
let get: () => string;

beforeEach(async () => {
  vi.resetModules();
  Object.keys(kvStore).forEach((k) => delete kvStore[k]);
  kvMock.set.mockClear();
  ({ saveProfileName: save, loadProfileName: load, getFirstName: get } = await import("@/native/src/profileNameStore"));
});

describe("idempotent save", () => {
  it("same name twice → one kv write", async () => {
    await save("Maria");
    await save("Maria");
    expect(kvMock.set).toHaveBeenCalledTimes(1);
  });
  it("different name → two writes", async () => {
    await save("Maria");
    await save("Ana");
    expect(kvMock.set).toHaveBeenCalledTimes(2);
  });
});

describe("one reader path", () => {
  it("getFirstName reflects what was saved", async () => {
    await save("Tim");
    expect(get()).toBe("Tim");
  });
  it("loadProfileName reads device kv when signed out", async () => {
    kvStore["nv_first_name"] = "Loaded";
    await load();
    expect(get()).toBe("Loaded");
  });
});
