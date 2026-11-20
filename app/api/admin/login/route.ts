import { NextResponse } from "next/server";
import { sameSecret } from "@/lib/ledger";
import { ADMIN_COOKIE, adminCookieValue, adminToken } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

// Form post from /admin/usage. Exists only when ADMIN_TOKEN is set.
export async function POST(req: Request) {
  const want = adminToken();
  if (!want) return new NextResponse("Not found", { status: 404 });
  const self = new URL(req.url);
  const origin = req.headers.get("origin");
  if (origin && origin !== self.origin) return new NextResponse("Wrong origin", { status: 403 });

  const form = await req.formData().catch(() => null);
  const raw = form?.get("token");
  const given = typeof raw === "string" ? raw.trim() : "";
  const back = new URL("/admin/usage", self);
  if (!sameSecret(given, want)) {
    back.searchParams.set("wrong", "1");
    return NextResponse.redirect(back, 303);
  }
  const res = NextResponse.redirect(back, 303);
  res.cookies.set(ADMIN_COOKIE, adminCookieValue(want), {
    httpOnly: true,
    secure: self.protocol === "https:",
    sameSite: "strict",
    path: "/admin",
    maxAge: 12 * 60 * 60,
  });
  return res;
}
