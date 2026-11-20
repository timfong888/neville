import { toNextJsHandler } from "better-auth/next-js";
import { accountsEnabled, getAuth } from "@/lib/server/accounts";

export const dynamic = "force-dynamic";

const off = () => new Response("Not found", { status: 404 });

// Better Auth's own endpoints (sign-in, callback, session, sign-out). 404 while accounts are off.
export async function GET(req: Request) {
  return accountsEnabled() ? toNextJsHandler(getAuth()).GET(req) : off();
}
export async function POST(req: Request) {
  return accountsEnabled() ? toNextJsHandler(getAuth()).POST(req) : off();
}
