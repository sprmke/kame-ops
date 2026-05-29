import { redirect } from "next/navigation";

import { MobileDashboardNav } from "@/features/dashboard/components/MobileDashboardNav";
import { DashboardSidebar } from "@/features/dashboard/components/DashboardSidebar";
import { ROUTES } from "@/config/routes";
import { auth } from "@/lib/auth/auth-config";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect(ROUTES.login);

  return (
    <div className="brand-page-bg relative flex min-h-screen flex-col md:flex-row">
      <DashboardSidebar user={session.user} />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <MobileDashboardNav user={session.user} />
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
