import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (token) {
    await fetch(`${apiBase()}/api/auth/signout`, {
      method: "POST",
      headers: { "x-local-session": decodeURIComponent(token) },
      cache: "no-store",
    }).catch(() => undefined);
  }
  const result = new NextResponse(null, { status: 204 });
  result.cookies.set("dontus_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return result;
}
