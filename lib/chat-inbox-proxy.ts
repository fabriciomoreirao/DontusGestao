import { apiRequestSignal } from "./api-request.ts";
import { apiResponse } from "./api-response.ts";

export async function chatInboxProxy(request: Request, path = "") {
  const headers = new Headers({ accept: "application/json" });
  headers.set("x-user-email", encodeURIComponent(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
  headers.set("x-user-name", encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  headers.set("x-user-role", encodeURIComponent(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"));
  const session = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (session) headers.set("x-local-session", decodeURIComponent(session));
  try {
    const base = (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
    const response = await fetch(`${base}/api/chat/${path}${new URL(request.url).search}`, {
      headers, cache: "no-store", signal: apiRequestSignal(request),
    });
    return apiResponse(request, response);
  } catch {
    return Response.json({ detail: "Não foi possível carregar o atendimento. Tente novamente." }, { status: 503 });
  }
}
