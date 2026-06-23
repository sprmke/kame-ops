"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";

import { DashboardNavLinks } from "./DashboardNavLinks";

interface DashboardSidebarProps {
  user: {
    email?: string | null;
    name?: string | null;
  };
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
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
        <DashboardNavLinks variant="sidebar" />
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
