import { liaFormProxy } from "@/lib/lia-form-proxy";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return liaFormProxy(request, `/api/lia-forms/attachments/${encodeURIComponent((await context.params).id)}`, true);
}
