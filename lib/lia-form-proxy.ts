import { apiRequestSignal } from "./api-request.ts";

export async function liaFormProxy(request: Request, path: string, authenticated: boolean) {
  const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
  const download = path.startsWith("/api/lia-forms/attachments/");
  const headers = new Headers({ accept: download ? "*/*" : "application/json" });
  if (!multipart) headers.set("content-type", "application/json");
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
      method: request.method, headers, cache: "no-store", redirect: "manual", signal: apiRequestSignal(request),
      body: request.method === "POST" ? multipart ? await request.formData() : await request.text() : undefined,
    });
    const outgoing = new Headers({ "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
    for (const name of ["content-type", "content-disposition", "content-length"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    if (download && response.status === 302) {
      const location = response.headers.get("location");
      if (!location || !["https:", "http:"].includes(new URL(location).protocol)) throw new Error("Endereço de anexo inválido.");
      outgoing.set("location", location);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch { return Response.json({ detail: "O serviço de formulários está indisponível. Tente novamente." }, { status: 503 }); }
}
