import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const response = await fetch(`${apiBase()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) return NextResponse.json(payload, { status: response.status });

    const result = NextResponse.json({ email: payload.email, displayName: payload.displayName });
    result.cookies.set("dontus_session", payload.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
      secure: request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:",
    });
    return result;
  } catch {
    return NextResponse.json({ detail: "Serviço de autenticação indisponível." }, { status: 503 });
  }
}
