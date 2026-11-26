// The paywall on /api/manifest (#168): sign-in, then one credit per recording.
// Off unless PAYWALL_ENABLED=true; then none of this runs and the route is as it was.
import "server-only";
import { NextResponse } from "next/server";
import { type Action, CREDITS, costOf, isUnlimited, paywallEnabled } from "@/lib/credits";
import { type SignedIn, accountsEnabled, currentUser } from "@/lib/server/accounts";
import { ensureFreeCredit, logTesterSpend, markFulfilled, reconcileUnfulfilledSpends, refundCredit, spendCredit } from "@/lib/server/creditsDb";
import { dbConfigured, getPool, withTx } from "@/lib/server/db";
import type { Db } from "@/lib/server/libraryDb";

export type Who = { enabled: false } | { enabled: true; user: SignedIn | null };

/** Step 1, before any guard counts the request: who is asking, or the refusal to send. */
export async function whoIsAsking(req: Request): Promise<Who | { response: Response }> {
  if (!paywallEnabled()) return { enabled: false };
  // With the paywall on, accounts and the database must both be there, or nobody could sign in or be charged.
  if (!accountsEnabled() || !dbConfigured()) {
    return { response: NextResponse.json({ code: "off", error: "Recording is not set up here." }, { status: 503 }) };
  }
  const user = await currentUser(req);
  if (!user && CREDITS.signInRequired) {
    return { response: NextResponse.json({ code: "sign_in_required", error: "Sign in to create a recording." }, { status: 401 }) };
  }
  return { enabled: true, user };
}

export type Charged = {
  /** Value for the X-Credits-Left header: a number, or "unlimited" for a tester. Null when nothing was charged. */
  left: string | null;
  /** Gives the credit back; safe to call more than once. */
  refund: () => Promise<void>;
  /** Marks the recording as delivered, so reconciliation never refunds this spend. Call it just before the success response. */
  fulfil: () => Promise<void>;
};
const nothing: Charged = { left: null, refund: async () => undefined, fulfil: async () => undefined };

/** Step 2, after the guards let the request through and before any paid call: spend one credit or refuse with 402. */
export async function charge(who: Who, action: Action): Promise<Charged | { response: Response }> {
  if (!who.enabled || !who.user) return nothing; // paywall off, or signed out where sign-in is not required
  const user = who.user;
  const c = { cost: costOf(action), route: `/api/${action}`, action };
  if (c.cost <= 0) return nothing; // a free action
  try {
    if (isUnlimited(user)) {
      await logTesterSpend(getPool() as unknown as Db, user.id, c);
      return { left: "unlimited", refund: async () => undefined, fulfil: async () => undefined };
    }
    const out = await withTx(async (db) => {
      // Heal first: a spend of this account's that a killed function left behind is refunded before the balance is read.
      await reconcileUnfulfilledSpends(db, { userId: user.id });
      await ensureFreeCredit(db, user.id, CREDITS.freeCredits);
      return spendCredit(db, user.id, c);
    });
    if (!out.ok) {
      return {
        response: NextResponse.json(
          { code: "no_credits", error: "You have no recordings left. Get more to keep going.", balance: out.balance },
          { status: 402 },
        ),
      };
    }
    let refunded = false;
    const spendId = out.spendId!;
    return {
      left: String(out.balance),
      fulfil: async () => {
        try {
          await markFulfilled(getPool() as unknown as Db, spendId);
        } catch (e) {
          // The recording is delivered either way; an unmarked spend could at worst be refunded by reconciliation.
          console.error("[credits] could not mark spend fulfilled", JSON.stringify({ spendId }), e instanceof Error ? e.message : e);
        }
      },
      // Done only when the insert succeeded. A database error is retried a few times (the insert is keyed to this
      // spend, so a retry can never refund twice); if every try fails the spend id is logged so it can be fixed by hand.
      refund: async () => {
        if (refunded) return;
        for (const wait of [0, 100, 400]) {
          if (wait) await new Promise((r) => setTimeout(r, wait));
          try {
            await refundCredit(getPool() as unknown as Db, user.id, c, spendId);
            refunded = true;
            return;
          } catch (e) {
            if (wait === 400) console.error("[credits] refund failed", JSON.stringify({ spendId, userId: user.id, action }), e instanceof Error ? e.message : e);
          }
        }
      },
    };
  } catch (e) {
    console.error("[credits] spend failed", e instanceof Error ? e.message : e);
    return { response: NextResponse.json({ code: "credits_unavailable", error: "Recording is paused for a moment." }, { status: 503 }) };
  }
}

/** What a paid route holds while it runs, so a deadline or an error can give the credit back. */
export type PaidState = { charged?: Charged; timedOut?: boolean };

/** The answer when the work did not finish before the deadline. */
export function timeoutResponse(creditReturned: boolean): Response {
  return NextResponse.json(
    { code: "timeout", error: creditReturned ? "The recording took too long. Your credit was returned." : "The recording took too long. Try again.", creditReturned },
    { status: 504 },
  );
}

/**
 * Runs a paid route's work with a deadline just under the platform's maxDuration (config deadlineMs, 50 s of 60). If the
 * deadline passes, the credit is refunded (keyed, so a late finish cannot refund twice) and a clear 504 is returned; an
 * error refunds too. Only with the paywall on: otherwise the route is exactly as it was. A function killed outright
 * (past maxDuration, or the host dies) is caught later by reconcileUnfulfilledSpends().
 */
export async function runPaid(work: (state: PaidState) => Promise<Response>): Promise<Response> {
  const state: PaidState = {};
  if (!paywallEnabled()) return work(state);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), CREDITS.deadlineMs);
  });
  try {
    const out = await Promise.race([work(state), deadline]);
    if (out === "timeout") {
      state.timedOut = true;
      await state.charged?.refund();
      return timeoutResponse(Boolean(state.charged && state.charged.left !== null && state.charged.left !== "unlimited"));
    }
    return out;
  } catch (e) {
    await state.charged?.refund();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
