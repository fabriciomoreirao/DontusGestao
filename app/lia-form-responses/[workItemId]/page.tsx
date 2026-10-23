import { LiaFormResponses } from "@/app/LiaForms";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ workItemId: string }> }) {
  const { workItemId } = await params;
  return <LiaFormResponses workItemId={workItemId}/>;
}
