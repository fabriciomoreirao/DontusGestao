import PublicRecruitmentPage from "@/app/PublicRecruitmentPage";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ processId: string }>;
}) {
  return <PublicRecruitmentPage processId={(await params).processId} />;
}
