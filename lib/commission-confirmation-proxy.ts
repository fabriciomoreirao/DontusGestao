export async function commissionConfirmationProxy(request: Request, path: string, authenticated: boolean) {
  const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
  headers.set("user-agent", request.headers.get("user-agent") ?? "");
  if (authenticated) {
    const session = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
    if (session) headers.set("x-local-session", decodeURIComponent(session));
    const email = request.headers.get("oai-authenticated-user-email");
    if (email) headers.set("oai-authenticated-user-email", email);
    headers.set("x-user-email", encodeURIComponent(email ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"));
    headers.set("x-user-name", encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"));
  }
  try {
    const response = await fetch((process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "") + path + new URL(request.url).search, {
      method: request.method, headers, cache: "no-store", signal: AbortSignal.timeout(20000),
      body: request.method === "POST" ? await request.text() : undefined,
    });
    const resultHeaders = new Headers({ "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    const disposition = response.headers.get("content-disposition");
    if (disposition) resultHeaders.set("content-disposition", disposition);
    return new Response(response.body, { status: response.status, headers: resultHeaders });
  } catch { return Response.json({ detail: "O serviço de confirmação está indisponível. Tente novamente." }, { status: 503 }); }
}
