import { proxyEmployeeProfile } from "@/lib/employee-profile-proxy";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return proxyEmployeeProfile(request, (await context.params).id);
}
export async function PUT(request: Request, context: Context) {
  return proxyEmployeeProfile(request, (await context.params).id);
}
