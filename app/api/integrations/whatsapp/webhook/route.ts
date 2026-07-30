export const dynamic = "force-dynamic";

const apiBase = () => (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

async function proxy(request: Request) {
  const incomingUrl = new URL(request.url);
  const target = `${apiBase()}/api/integrations/whatsapp/webhook${incomingUrl.search}`;
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        "x-hub-signature-256": request.headers.get("x-hub-signature-256") ?? "",
      },
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8" },
    });
  } catch {
    return Response.json({ detail: "Webhook temporariamente indisponível." }, { status: 503 });
  }
}

export async function GET(request: Request) { return proxy(request); }
export async function POST(request: Request) { return proxy(request); }
