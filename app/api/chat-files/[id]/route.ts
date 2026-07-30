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
  try {
    const response = await fetch(`${apiBase()}/api/chats/attachments/${encodeURIComponent(id)}`, {
      headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    const location = response.headers.get("location");
    if (location) return Response.redirect(location, 302);
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
  } catch {
    return Response.json({ detail: "Arquivo temporariamente indisponível." }, { status: 503 });
  }
}
