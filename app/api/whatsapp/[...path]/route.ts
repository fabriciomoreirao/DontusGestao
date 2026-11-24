import { apiRequestSignal } from "@/lib/api-request";
import { apiResponse } from "@/lib/api-response";
export const dynamic = "force-dynamic";
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params; const route = path.join("/");
  const id = "[0-9a-f-]{36}";
  const allowed = request.method === "GET" ? /^(state|notifications)$/.test(route) || new RegExp(`^campaigns/${id}$`, "i").test(route)
    : /^(templates|campaigns|suite|send)$/.test(route) || new RegExp(`^(templates/${id}/refresh|media/${id}|campaigns/${id}/(schedule|cancel|delete))$`, "i").test(route);
  if (!allowed) return Response.json({ detail: "Rota não encontrada." }, { status: 404 });
  const headers = new Headers({ accept: "application/json" });
  const type = request.headers.get("content-type"); if (type) headers.set("content-type", type);
  headers.set("x-user-email", encodeURIComponent(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
  headers.set("x-user-name", encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  headers.set("x-user-role", encodeURIComponent(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"));
  const session = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (session) headers.set("x-local-session", decodeURIComponent(session));
  try {
    const response = await fetch(`${(process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/whatsapp/${route}${new URL(request.url).search}`, {
      method: request.method, headers, body: request.method === "GET" ? undefined : request.body, cache: "no-store", signal:request.signal,duplex:"half",
    } as RequestInit);
    return apiResponse(request, response);
  } catch { return Response.json({ detail: "A integração WhatsApp não respondeu. Tente novamente." }, { status: 503 }); }
}
export const GET = proxy;
export const POST = proxy;
