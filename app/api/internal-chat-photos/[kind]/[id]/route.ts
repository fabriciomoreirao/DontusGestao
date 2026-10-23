export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params;
  if (!["user", "room"].includes(kind) || !/^[\da-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const headers = new Headers({
    "x-user-email": encodeURIComponent(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"),
    "x-user-name": encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
    "x-user-role": encodeURIComponent(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
  });
  const session = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (session) headers.set("x-local-session", decodeURIComponent(session));
  try {
    const response = await fetch(`${(process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/internal-chats/photos/${kind}/${id}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return new Response(response.body, { status: response.status, headers: {
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": response.ok ? "private, max-age=300" : "no-store",
      "x-content-type-options": "nosniff",
    } });
  } catch { return new Response(null, { status: 503 }); }
}
