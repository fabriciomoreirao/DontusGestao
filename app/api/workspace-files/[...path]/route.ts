import { workspaceFilesProxy } from '@/lib/workspace-files-proxy';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const proxy=async(request:Request,context:Context)=>workspaceFilesProxy(request,(await context.params).path);
export {proxy as GET,proxy as PUT,proxy as POST};
