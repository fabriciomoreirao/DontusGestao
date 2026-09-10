export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

export async function GET(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const month = new URL(request.url).searchParams.get("month");
    const query = month && /^\d{4}-\d{2}$/.test(month) ? `?month=${encodeURIComponent(month)}` : "";
    const response = await fetch(`${apiBase()}/api/public-overview${query}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "O painel demorou mais do que o esperado para responder."
      : "O painel público está temporariamente indisponível.";
    return Response.json({ detail }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
