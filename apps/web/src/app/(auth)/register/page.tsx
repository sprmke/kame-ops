import Link from "next/link";

import { AuthPageShell } from "@/components/layout/AuthPageShell";
import { ROUTES } from "@/config/routes";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export default function RegisterPage() {
  return (
    <AuthPageShell
      title="Create your account"
      description="Start automating SOA, reminders, and payment workflows"
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={ROUTES.login}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthPageShell>
  );
}
