import { AuthPageShell } from "@/components/layout/AuthPageShell";
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <AuthPageShell title="Sign in">
      <LoginForm />
    </AuthPageShell>
  );
}
