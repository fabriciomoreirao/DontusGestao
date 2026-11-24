import OperationsApp from "./OperationsApp";
import PublicRecruitmentPage from "./PublicRecruitmentPage";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.application === "processo-seletivo") return <PublicRecruitmentPage processId={typeof params.process === "string" ? params.process : undefined} />;
  return <OperationsApp />;
}
