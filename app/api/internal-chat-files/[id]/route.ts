export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const headers = new Headers({
    "x-user-email": headerValue(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"),
    "x-user-name": headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
    "x-user-role": headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
  });
  const localSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (localSession) headers.set("x-local-session", decodeURIComponent(localSession));
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  try {
    const response = await fetch(`${apiBase()}/api/internal-chats/attachments/${encodeURIComponent(id)}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders = new Headers();
    ["content-type", "content-length", "content-range", "accept-ranges"].forEach((name) => {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    });
    responseHeaders.set("cache-control", "private, max-age=60");
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: "Arquivo temporariamente indisponível." }, { status: 503 });
  }
}
