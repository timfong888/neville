import { describe, expect, it } from "vitest";
import type { AccountState } from "@/lib/api/client";
import { createAccountView } from "@/lib/accountView";

const user = { id: "u1", name: "Tim", email: "t@example.com", image: null };
const signedIn: AccountState = { enabled: true, user };
const signedOut: AccountState = { enabled: true, user: null };
const later = <T,>() => {
  let ok!: (v: T) => void;
  let no!: (e: Error) => void;
  const p = new Promise<T>((a, b) => ((ok = a), (no = b)));
  return { p, ok, no };
};

describe("the shared account view (#164)", () => {
  it("starts unknown, and a lookup records the answer", async () => {
    const v = createAccountView(async () => signedIn);
    expect(v.get()).toEqual({ account: null, checked: false });
    await v.refresh();
    expect(v.get()).toEqual({ account: signedIn, checked: true });
  });
  it("a failed lookup keeps the last answer, marks it checked, and rejects", async () => {
    let fail = false;
    const v = createAccountView(async () => {
      if (fail) throw new Error("offline");
      return signedIn;
    });
    await v.refresh();
    fail = true;
    await expect(v.refresh()).rejects.toThrow("offline");
    expect(v.get()).toEqual({ account: signedIn, checked: true });
  });
  it("only the latest lookup writes: a slow older answer is dropped", async () => {
    const slow = later<AccountState>();
    const fast = later<AccountState>();
    const answers = [slow, fast];
    const v = createAccountView(() => answers.shift()!.p);
    const first = v.refresh();
    const second = v.refresh();
    fast.ok(signedIn);
    await second;
    slow.ok(signedOut);
    await first;
    expect(v.get().account).toEqual(signedIn);
  });
  it("a stale failure does not mark or change anything", async () => {
    const slow = later<AccountState>();
    const answers = [slow.p, Promise.resolve(signedIn)];
    const v = createAccountView(() => answers.shift()!);
    const first = v.refresh().catch(() => undefined);
    await v.refresh();
    slow.no(new Error("late"));
    await first;
    expect(v.get()).toEqual({ account: signedIn, checked: true });
  });
  it("a first lookup that hangs is marked checked after the wait, with nothing known", async () => {
    const hang = later<AccountState>();
    const timers: (() => void)[] = [];
    const v = createAccountView(() => hang.p, { waitMs: 5000, setTimer: (f) => void timers.push(f) });
    void v.refresh();
    expect(v.get().checked).toBe(false);
    timers[0]();
    expect(v.get()).toEqual({ account: null, checked: true });
    hang.ok(signedIn);
    await Promise.resolve();
    await Promise.resolve();
    expect(v.get()).toEqual({ account: signedIn, checked: true });
  });
  it("signing out clears the user at once, without a lookup", async () => {
    const v = createAccountView(async () => signedIn);
    await v.refresh();
    v.clearUser();
    expect(v.get()).toEqual({ account: signedOut, checked: true });
  });
  it("a lookup already running when the user is cleared cannot bring the user back", async () => {
    const stale = later<AccountState>();
    const answers = [Promise.resolve(signedIn), stale.p];
    const v = createAccountView(() => answers.shift()!);
    await v.refresh();
    const running = v.refresh();
    v.clearUser();
    stale.ok(signedIn);
    await running;
    expect(v.get().account?.user).toBeNull();
  });
});
