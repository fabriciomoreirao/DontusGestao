import { commissionConfirmationProxy } from "@/lib/commission-confirmation-proxy";
export const dynamic = "force-dynamic";
async function proxy(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  return commissionConfirmationProxy(request, "/api/public-commission-confirmations/" + encodeURIComponent(token), true);
}
export const GET = proxy;
export const POST = proxy;
