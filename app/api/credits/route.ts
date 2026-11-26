import { NextResponse } from "next/server";
import { CREDITS, availablePacks, isUnlimited, paywallEnabled } from "@/lib/credits";
import { accountsEnabled, currentUser } from "@/lib/server/accounts";
import { creditBalance, ensureFreeCredit, hasStarter, reconcileUnfulfilledSpends } from "@/lib/server/creditsDb";
import { dbConfigured, withTx } from "@/lib/server/db";

export const dynamic = "force-dynamic";

// What the signed-in account has left and which packs it may buy (#168). The free credit is given
// here on first sight (once per account), so the app can show it before the first recording.
// "unlimited" comes from the server's own list of tester emails and the session, never from the request.
export async function GET(req: Request) {
  if (!accountsEnabled() || !dbConfigured()) {
    return NextResponse.json({ code: "off", error: "Accounts are not set up here." }, { status: 503 });
  }
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ code: "sign_in_required", error: "Sign in first." }, { status: 401 });
  try {
    const { balance, starter } = await withTx(async (db) => {
      // A spend of this account's that a killed function left behind comes back here, so the balance shown is right.
      await reconcileUnfulfilledSpends(db, { userId: user.id });
      await ensureFreeCredit(db, user.id, CREDITS.freeCredits);
      return { balance: await creditBalance(db, user.id), starter: await hasStarter(db, user.id) };
    });
    return NextResponse.json(
      {
        balance,
        unlimited: isUnlimited(user),
        paywallEnabled: paywallEnabled(),
        signInRequired: CREDITS.signInRequired,
        packs: availablePacks(starter),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[credits] read failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ code: "credits_unavailable", error: "Credits are unavailable just now." }, { status: 503 });
  }
}
