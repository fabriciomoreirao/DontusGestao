export async function proxyEmployeeProfile(request: Request, id: string) {
  if (id !== "me" && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))
    return Response.json({ detail: "Perfil inválido." }, { status: 400 });
  if (request.method === "PUT" && id !== "me")
    return Response.json({ detail: "Você só pode editar o próprio perfil." }, { status: 405 });
  try {
    const headers = new Headers({
      accept: "application/json", "content-type": "application/json",
      "x-user-email": encodeURIComponent(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"),
      "x-user-name": encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
      "x-user-role": encodeURIComponent(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
    });
    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
    if (token) headers.set("x-local-session", decodeURIComponent(token));
    const base = (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
    const response = await fetch(`${base}/api/employee-profiles/${encodeURIComponent(id)}`, {
      method: request.method, headers, cache: "no-store", signal: AbortSignal.timeout(20_000),
      body: request.method === "PUT" ? await request.text() : undefined,
    });
    return new Response(response.body, { status: response.status, headers: {
      "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store",
    } });
  } catch {
    return Response.json({ detail: "Não foi possível acessar o perfil. Tente novamente." }, { status: 503 });
  }
}
