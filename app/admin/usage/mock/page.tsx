import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ADMIN_COOKIE, adminToken, isAdminCookie } from "@/lib/server/admin";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cost Dashboard (mock) — Neville",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function MockUsagePage({ searchParams }: { searchParams: Promise<{ wrong?: string }> }) {
  if (!adminToken()) notFound();
  if (!isAdminCookie((await cookies()).get(ADMIN_COOKIE)?.value)) {
    const wrong = (await searchParams).wrong === "1";
    return (
      <>
        <h1>Cost Dashboard</h1>
        <form className="card" method="post" action="/api/admin/login?next=/admin/usage/mock">
          <label htmlFor="token">Admin token</label>
          <input id="token" name="token" type="password" autoComplete="current-password" required />
          {wrong && <p className="small danger">That token is not right.</p>}
          <button className="btn primary block" type="submit">
            Open
          </button>
        </form>
      </>
    );
  }

  return <Dashboard />;
}
