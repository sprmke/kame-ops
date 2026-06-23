"use client";

import { Menu } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ROUTES } from "@/config/routes";

import { DashboardNavLinks } from "./DashboardNavLinks";

interface MobileDashboardNavProps {
  user: {
    email?: string | null;
    name?: string | null;
  };
}

export function MobileDashboardNav({ user }: MobileDashboardNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-md md:hidden">
      <BrandLogo href={ROUTES.dashboard.root} size="sm" />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col p-0">
            <SheetHeader className="border-b border-border px-4 py-4 text-left">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <BrandLogo size="sm" showTagline />
            </SheetHeader>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              <DashboardNavLinks
                variant="mobile"
                onNavigate={() => setOpen(false)}
              />
            </nav>
            <div className="border-t border-border p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => signOut({ callbackUrl: ROUTES.login })}
              >
                Sign out
              </Button>
              <p className="mt-2 truncate px-3 text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
