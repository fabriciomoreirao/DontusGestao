import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const response = await fetch(`${apiBase()}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Serviço de autenticação indisponível." }, { status: 503 });
  }
}
