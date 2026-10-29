export const dynamic = "force-dynamic";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = path.join("/");
  const customerPath = /^customers\/[0-9a-f-]{36}(\/data)?$/i.test(route);
  const allowed = request.method === "GET" ? customerPath
    : route === "users" || route === "users/login" || customerPath && path.length === 2;
  if (!allowed) return Response.json({ detail: "Rota não encontrada." }, { status: 404 });
  const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
  const session = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (session) headers.set("x-local-session", decodeURIComponent(session));
  const platformEmail = request.headers.get("oai-authenticated-user-email");
  if (platformEmail) headers.set("oai-authenticated-user-email", platformEmail);
  headers.set("x-user-email", encodeURIComponent(platformEmail ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
  headers.set("x-user-name", encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  try {
    const response = await fetch(`${(process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/dontus-integration/${route}`, {
      method: request.method, headers, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(35000)]),
      body: request.method === "POST" ? await request.text() : undefined,
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    return Response.json({ detail: "A integração Dontus não respondeu. Tente novamente." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export const GET = proxy;
export const POST = proxy;
