"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";

export function LoginForm() {
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    await signIn("google", { callbackUrl: ROUTES.dashboard.root });
  }

  return (
    <Button
      type="button"
      className="w-full"
      disabled={loading}
      onClick={handleGoogleSignIn}
    >
      {loading ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}
