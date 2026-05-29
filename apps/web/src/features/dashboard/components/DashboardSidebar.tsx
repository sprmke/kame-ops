"use client";

import {
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Plug,
  Receipt,
  Settings,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DASHBOARD_NAV, ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

const ICONS = {
  LayoutDashboard,
  CreditCard,
  FileText,
  Bell,
  Zap,
  Plug,
  Receipt,
  BarChart3,
  Settings,
} as const;

interface DashboardSidebarProps {
  user: {
    email?: string | null;
    name?: string | null;
  };
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname();
  const initials =
    user.name?.slice(0, 2).toUpperCase() ??
    user.email?.slice(0, 2).toUpperCase() ??
    "KO";

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
        <BrandLogo href={ROUTES.dashboard.root} size="sm" showTagline />
        <ThemeToggle />
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {DASHBOARD_NAV.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS];
          const active =
            pathname === item.href ||
            (item.href !== ROUTES.dashboard.root &&
              pathname.startsWith(`${item.href}/`)) ||
            (item.href === ROUTES.dashboard.root &&
              pathname === ROUTES.dashboard.root);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
                  : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user.name ?? "Account"}
            </p>
            <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-muted hover:text-sidebar-foreground"
          onClick={() => signOut({ callbackUrl: ROUTES.login })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
