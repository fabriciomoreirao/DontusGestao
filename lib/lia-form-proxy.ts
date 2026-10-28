export async function liaFormProxy(request: Request, path: string, authenticated: boolean) {
  const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
  if (authenticated) {
    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
    if (token) headers.set("x-local-session", decodeURIComponent(token));
    const platformEmail = request.headers.get("oai-authenticated-user-email");
    if (platformEmail) headers.set("oai-authenticated-user-email", platformEmail);
    headers.set("x-user-email", encodeURIComponent(platformEmail ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
    headers.set("x-user-name", encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  }
  try {
    const response = await fetch((process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "") + path + new URL(request.url).search, {
      method: request.method, headers, cache: "no-store", signal: AbortSignal.timeout(20000),
      body: request.method === "POST" ? await request.text() : undefined,
    });
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { return Response.json({ detail: "O serviço de formulários está indisponível. Tente novamente." }, { status: 503 }); }
}
