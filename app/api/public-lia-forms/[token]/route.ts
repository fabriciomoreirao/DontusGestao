import { liaFormProxy } from "@/lib/lia-form-proxy";
export const dynamic = "force-dynamic";
async function proxy(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  return liaFormProxy(request, "/api/public-lia-forms/" + encodeURIComponent(token), false);
}
export const GET = proxy;
export const POST = proxy;
