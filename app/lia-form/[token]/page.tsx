import { PublicLiaForm } from "@/app/LiaForms";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicLiaForm token={token}/>;
}
