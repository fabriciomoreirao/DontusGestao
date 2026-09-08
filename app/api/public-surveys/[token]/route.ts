export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

async function proxy(request: Request, context: { params: Promise<{ token: string }> | { token: string } }) {
  const { token } = await context.params;
  const forwardedFor = request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const response = await fetch(`${apiBase()}/api/public-surveys/${encodeURIComponent(token)}`, {
    method: request.method,
    headers: { "content-type": "application/json", accept: "application/json", ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}), ...(userAgent ? { "user-agent": userAgent } : {}) },
    body: request.method === "POST" ? await request.text() : undefined,
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> | { token: string } }) { return proxy(request, context); }
export async function POST(request: Request, context: { params: Promise<{ token: string }> | { token: string } }) { return proxy(request, context); }
