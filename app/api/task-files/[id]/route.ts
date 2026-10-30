import { downloadTaskFile } from "@/lib/task-files-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return downloadTaskFile(request, (await context.params).id);
}
