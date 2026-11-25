export async function publicRecruitmentProxy(request: Request, id?: string) {
  if (
    id &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return Response.json(
      { detail: "Processo seletivo inválido." },
      { status: 400 },
    );
  try {
    const response = await fetch(
      `${(process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/public-recruitment/${id ?? ""}`,
      {
        method: request.method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.PUBLIC_SERVICE_REQUESTS_API_KEY ?? "",
        },
        body: request.method === "POST" ? await request.text() : undefined,
        signal: request.signal,
        cache: "no-store",
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        detail:
          "Não foi possível acessar o processo seletivo. Tente novamente.",
      },
      { status: 503 },
    );
  }
}
