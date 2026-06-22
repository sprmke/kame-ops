import { redirect } from "next/navigation";

import { ROUTES } from "@/config/routes";

/** Email/password registration is disabled — Google OAuth is required for Gmail access. */
export default function RegisterPage() {
  redirect(ROUTES.login);
}
