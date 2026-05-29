import Link from "next/link";

import { AuthPageShell } from "@/components/layout/AuthPageShell";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";

export default function AuthErrorPage() {
  return (
    <AuthPageShell
      title="Authentication error"
      description="Something went wrong while signing you in. Please try again."
    >
      <Button asChild className="w-full">
        <Link href={ROUTES.login}>Back to sign in</Link>
      </Button>
    </AuthPageShell>
  );
}
