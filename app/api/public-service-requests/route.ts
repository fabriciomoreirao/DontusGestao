export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

async function proxy(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("accept", "application/json");
  headers.set("x-api-key", process.env.PUBLIC_SERVICE_REQUESTS_API_KEY ?? "");
  headers.delete("host");
  headers.delete("content-length");
  const response = await fetch(`${apiBase()}/api/public-service-requests`, {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8" } });
}

export async function GET(request: Request) { return proxy(request); }
export async function POST(request: Request) { return proxy(request); }
