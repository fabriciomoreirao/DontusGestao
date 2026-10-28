import { PublicCommissionConfirmation } from "@/app/CommissionConfirmations";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCommissionConfirmation key={token} token={token}/>;
}
