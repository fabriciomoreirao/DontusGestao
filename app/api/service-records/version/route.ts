import { apiRequestSignal } from "../../../../lib/api-request.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim() || "";
  if (!/^\d{6}$/.test(clientId)) return Response.json({ detail: "Informe o ID público de 6 números do cliente." }, { status: 400 });
  try {
    const headers = new Headers({ accept: "application/json",
      "x-user-email": encodeURIComponent(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"),
      "x-user-name": encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
      "x-user-role": encodeURIComponent(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
    });
    const session = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
    if (session) headers.set("x-local-session", decodeURIComponent(session));
    const base = (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
    const response = await fetch(`${base}/api/operations/service-version?clientId=${encodeURIComponent(clientId)}`, {
      headers, cache: "no-store", signal: apiRequestSignal(request),
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    return Response.json({ detail: "Não foi possível consultar a versão. Tente novamente ou selecione manualmente." }, { status: 503 });
  }
}
