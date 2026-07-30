export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
const headerValue = (value: string) => encodeURIComponent(value);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const headers = new Headers();
  headers.set("x-user-email", headerValue(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
  headers.set("x-user-name", headerValue(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  headers.set("x-user-role", headerValue(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"));

  try {
    const response = await fetch(`${apiBase()}/api/tasks/attachments/${encodeURIComponent(id)}`, {
      headers,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });
    const outgoing = new Headers();
    for (const name of ["content-type", "content-length", "content-disposition", "etag", "last-modified"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    outgoing.set("cache-control", "private, no-store");
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json({
      title: "Arquivo indisponível",
      status: 503,
      detail: "Não foi possível acessar o arquivo na AWS.",
    }, { status: 503 });
  }
}
