import { workspaceFilesProxy } from "@/lib/workspace-files-proxy";
export const dynamic = "force-dynamic";
export const POST = (request: Request) =>
  workspaceFilesProxy(request, [], true);
