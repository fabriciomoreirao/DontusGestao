import { commissionConfirmationProxy } from "@/lib/commission-confirmation-proxy";
export const dynamic = "force-dynamic";
const proxy = (request: Request) => commissionConfirmationProxy(request, "/api/commission-confirmations", true);
export const GET = proxy;
export const POST = proxy;
