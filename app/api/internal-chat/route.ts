export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

export async function GET(request: Request) {
  const headers = new Headers({
    "accept": "application/json",
    "x-user-email": headerValue(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"),
    "x-user-name": headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
    "x-user-role": headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
  });
  const localSession = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (localSession) headers.set("x-local-session", decodeURIComponent(localSession));
  try {
    const response = await fetch(`${apiBase()}/api/internal-chats`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8" },
    });
  } catch {
    return Response.json({ detail: "O Chat interno está temporariamente indisponível." }, { status: 503 });
  }
}
