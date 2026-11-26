import { apiRequestSignal } from "@/lib/api-request";

export const dynamic = "force-dynamic";

const apiBase = () =>
  (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = new URLSearchParams();
    for (const key of ["month", "from", "to", "range"]) {
      const value = params.get(key);
      if (value !== null) query.set(key, value);
    }
    const response = await fetch(`${apiBase()}/api/public-overview?${query}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: apiRequestSignal(request),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ??
          "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
        ? "O painel demorou mais do que o esperado para responder."
        : "O painel público está temporariamente indisponível.";
    return Response.json({ detail }, { status: 503 });
  }
}
