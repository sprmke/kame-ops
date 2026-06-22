import { SoaStatementDetailPage } from "@/features/dashboard/soa/components/SoaStatementDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ periodId: string; statementId: string }>;
}) {
  const { periodId, statementId } = await params;
  return (
    <SoaStatementDetailPage periodId={periodId} statementId={statementId} />
  );
}
