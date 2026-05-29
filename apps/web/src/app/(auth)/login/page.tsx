import Link from "next/link";

import { AuthPageShell } from "@/components/layout/AuthPageShell";
import { ROUTES } from "@/config/routes";
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <AuthPageShell
      title="Welcome back"
      description="Sign in to your automation command center"
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link
            href={ROUTES.register}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthPageShell>
  );
}
