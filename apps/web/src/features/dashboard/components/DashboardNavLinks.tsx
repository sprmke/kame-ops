"use client";

import {
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  Plug,
  Receipt,
  Settings,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DASHBOARD_NAV, ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<(typeof DASHBOARD_NAV)[number]["icon"], LucideIcon> = {
  LayoutDashboard,
  CreditCard,
  FileText,
  Bell,
  Zap,
  Plug,
  Receipt,
  Settings,
};

export function isDashboardNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== ROUTES.dashboard.root && pathname.startsWith(`${href}/`)) ||
    (href === ROUTES.dashboard.root && pathname === ROUTES.dashboard.root)
  );
}

interface DashboardNavLinksProps {
  variant: "sidebar" | "mobile";
  onNavigate?: () => void;
}

export function DashboardNavLinks({
  variant,
  onNavigate,
}: DashboardNavLinksProps) {
  const pathname = usePathname();
  const isSidebar = variant === "sidebar";

  return (
    <>
      {DASHBOARD_NAV.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isDashboardNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isSidebar
                ? active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
                  : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                : active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.title}
          </Link>
        );
      })}
    </>
  );
}
