import { type ReactNode } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthPageShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Shared auth layout — warm mesh background + branded card.
 */
export function AuthPageShell({
  title,
  description,
  children,
  footer,
}: AuthPageShellProps) {
  return (
    <main className="brand-page-bg relative flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="relative z-10 w-full max-w-md border-border/80 shadow-elevated">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex justify-center">
            <BrandLogo size="md" showTagline />
          </div>
          <div className="space-y-1">
            <CardTitle className="font-display text-2xl">{title}</CardTitle>
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {children}
          {footer}
        </CardContent>
      </Card>
    </main>
  );
}
