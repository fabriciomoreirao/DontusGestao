export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

async function proxy(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const incoming = new Headers(request.headers);
    incoming.set("accept", "application/json");
    incoming.set("x-user-email", headerValue(incoming.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
    incoming.set("x-user-name", headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
    incoming.set("x-user-role", headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"));
    const localSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
    if (localSession) incoming.set("x-local-session", decodeURIComponent(localSession));
    incoming.delete("host");
    incoming.delete("content-length");

    const response = await fetch(`${apiBase()}/api/operations`, {
      method: request.method,
      headers: incoming,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
      signal: controller.signal,
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "x-dontus-api": "aspnet-core",
      },
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "A API C# não respondeu dentro do tempo esperado."
      : "A API C# está indisponível. Inicie o ambiente com Docker Compose.";
    return Response.json({
      type: "https://dontus.local/problems/api-unavailable",
      title: "Backend indisponível",
      status: 503,
      detail,
      correlationId: crypto.randomUUID(),
    }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  return proxy(request);
}

export async function POST(request: Request) {
  return proxy(request);
}
