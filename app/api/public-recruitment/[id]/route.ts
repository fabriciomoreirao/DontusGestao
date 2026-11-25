import { publicRecruitmentProxy } from "@/lib/public-recruitment-proxy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const proxy = async (request: Request, context: Context) =>
  publicRecruitmentProxy(request, (await context.params).id);
export { proxy as GET, proxy as POST };
