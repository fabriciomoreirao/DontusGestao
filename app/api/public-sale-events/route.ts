import { apiRequestSignal } from "@/lib/api-request";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const base = (process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
    const response = await fetch(`${base}/api/public-sale-events`, { cache: "no-store", signal: apiRequestSignal(request) });
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { return Response.json({ detail: "Não foi possível atualizar as vendas." }, { status: 503 }); }
}
