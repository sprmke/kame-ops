import { SoaPeriodDetailPage } from "@/features/dashboard/soa/components/SoaPeriodDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  return <SoaPeriodDetailPage periodId={periodId} />;
}
