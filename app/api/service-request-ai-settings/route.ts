export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

async function proxy(request: Request) {
  const incoming = new Headers(request.headers);
  incoming.set("accept", "application/json");
  incoming.set("content-type", "application/json");
  incoming.set("x-user-email", headerValue(incoming.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
  incoming.set("x-user-name", headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  incoming.set("x-user-role", headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"));
  const localSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (localSession) incoming.set("x-local-session", decodeURIComponent(localSession));
  incoming.delete("host");
  incoming.delete("content-length");
  try {
    const response = await fetch(`${apiBase()}/api/service-request-ai-settings`, {
      method: request.method,
      headers: incoming,
      body: request.method === "PUT" ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8" } });
  } catch {
    return Response.json({ detail: "A API de configurações da IA está indisponível." }, { status: 503 });
  }
}

export async function GET(request: Request) { return proxy(request); }
export async function PUT(request: Request) { return proxy(request); }
