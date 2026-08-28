export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

export async function POST(request: Request) {
  const conversationId = new URL(request.url).searchParams.get("conversationId");
  if (!conversationId) return Response.json({ detail: "Conversa obrigatória." }, { status: 400 });
  const headers = new Headers({
    "x-user-email": headerValue(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"),
    "x-user-name": headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
    "x-user-role": headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
  });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  try {
    const response = await fetch(`${apiBase()}/api/chats/${encodeURIComponent(conversationId)}/attachments`, {
      method: "POST", headers, body: request.body, cache: "no-store", signal: AbortSignal.timeout(120_000),
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
  } catch {
    return Response.json({ detail: "Não foi possível enviar o arquivo para a API." }, { status: 503 });
  }
}
