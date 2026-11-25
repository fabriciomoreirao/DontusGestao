import { publicRecruitmentProxy } from "@/lib/public-recruitment-proxy";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => publicRecruitmentProxy(request);
