import { downloadSuggestionFile } from "@/lib/suggestion-files-proxy";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return downloadSuggestionFile(request, id);
}
