export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

export async function POST(request: Request) {
  const incoming = new Headers();
  incoming.set("accept", "application/json");
  incoming.set("x-user-email", headerValue(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
  incoming.set("x-user-name", headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  incoming.set("x-user-role", headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"));
  const localSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (localSession) incoming.set("x-local-session", decodeURIComponent(localSession));
  try {
    const response = await fetch(`${apiBase()}/api/service-request-ai-settings/test`, { method: "POST", headers: incoming, cache: "no-store", signal: AbortSignal.timeout(95_000) });
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8" } });
  } catch {
    return Response.json({ detail: "Não foi possível testar a integração de IA." }, { status: 503 });
  }
}
