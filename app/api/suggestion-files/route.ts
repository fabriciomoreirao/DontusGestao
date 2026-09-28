export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

function authenticationHeaders(request: Request) {
  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("x-user-email", headerValue(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
  headers.set("x-user-name", headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  headers.set("x-user-role", headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"));
  return headers;
}

export async function POST(request: Request) {
  const suggestionId = new URL(request.url).searchParams.get("suggestionId");
  if (!suggestionId) return Response.json({ detail: "Sugestão obrigatória." }, { status: 400 });
  try {
    const headers = authenticationHeaders(request);
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const response = await fetch(`${apiBase()}/api/suggestions/${encodeURIComponent(suggestionId)}/attachments`, {
      method: "POST", headers, body: request.body, cache: "no-store", signal: AbortSignal.timeout(120_000),
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8" } });
  } catch {
    return Response.json({ detail: "Não foi possível enviar os anexos para a API." }, { status: 503 });
  }
}
