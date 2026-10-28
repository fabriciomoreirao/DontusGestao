import { commissionConfirmationProxy } from "@/lib/commission-confirmation-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  return commissionConfirmationProxy(request, "/api/public-commission-confirmations/" + encodeURIComponent(token) + "/pdf", true);
}
