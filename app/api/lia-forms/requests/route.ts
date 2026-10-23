import { liaFormProxy } from "@/lib/lia-form-proxy";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => liaFormProxy(request, "/api/lia-forms/requests", true);
export const POST = GET;
