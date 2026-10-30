const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

function authenticationHeaders(request: Request) {
  const headers = new Headers({
    accept: "application/json",
    "x-user-email": encodeURIComponent(request.headers.get("oai-authenticated-user-email") ?? process.env.LOCAL_USER_EMAIL ?? "gestor@dontus.local"),
    "x-user-name": encodeURIComponent(process.env.LOCAL_USER_NAME ?? "Gestor Dontus"),
    "x-user-role": encodeURIComponent(process.env.LOCAL_USER_ROLE ?? "Administrador técnico"),
  });
  const session = request.headers.get("cookie")?.match(/(?:^|;\s*)dontus_session=([^;]+)/)?.[1];
  if (session) headers.set("x-local-session", decodeURIComponent(session));
  return headers;
}

function proxyResponse(response: Response) {
  return new Response(response.body, { status: response.status, headers: {
    "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
    "cache-control": "private, no-store", "x-dontus-api": "aspnet-core",
  } });
}

export async function uploadTaskFiles(request: Request) {
  const query = new URL(request.url).searchParams;
  const taskId = query.get("taskId");
  if (!taskId) return Response.json({ detail: "Tarefa obrigatória." }, { status: 400 });
  try {
    const form = await request.formData();
    const commentId = query.get("commentId");
    const suffix = commentId ? `?commentId=${encodeURIComponent(commentId)}` : "";
    const response = await fetch(`${apiBase()}/api/tasks/${encodeURIComponent(taskId)}/attachments${suffix}`, {
      method: "POST", headers: authenticationHeaders(request), body: form,
      cache: "no-store", signal: AbortSignal.timeout(120_000),
    });
    return proxyResponse(response);
  } catch {
    return Response.json({ detail: "Não foi possível enviar os anexos para a API." }, { status: 503 });
  }
}

export async function deleteTaskFile(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ detail: "Anexo obrigatório." }, { status: 400 });
  try {
    return proxyResponse(await fetch(`${apiBase()}/api/tasks/attachments/${encodeURIComponent(id)}`, {
      method: "DELETE", headers: authenticationHeaders(request), cache: "no-store", signal: AbortSignal.timeout(30_000),
    }));
  } catch {
    return Response.json({ detail: "Não foi possível excluir o anexo na API." }, { status: 503 });
  }
}

export async function downloadTaskFile(request: Request, id: string) {
  try {
    const mediaHeaders = new Headers();
    for (const name of ["range", "if-range"]) {
      const value = request.headers.get(name);
      if (value) mediaHeaders.set(name, value);
    }
    const headers = authenticationHeaders(request);
    mediaHeaders.forEach((value, name) => headers.set(name, value));
    let response = await fetch(`${apiBase()}/api/tasks/attachments/${encodeURIComponent(id)}`, {
      headers, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(120_000),
    });
    const location = response.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      // Signed storage URLs must never receive the user's API session headers.
      const url = new URL(location, apiBase());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Endereço de arquivo inválido.");
      await response.body?.cancel();
      response = await fetch(url, { headers: mediaHeaders, cache: "no-store", signal: AbortSignal.timeout(120_000) });
    }
    const outgoing = new Headers({ "cache-control": "private, no-store" });
    for (const name of ["content-type", "content-length", "content-disposition", "etag", "last-modified", "accept-ranges", "content-range"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return Response.json({ detail: "Não foi possível acessar o arquivo na AWS." }, { status: 503 });
  }
}
