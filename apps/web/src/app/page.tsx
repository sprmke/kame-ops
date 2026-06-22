import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CreditCard,
  FileText,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";
import { auth } from "@/lib/auth/auth-config";

const FEATURES = [
  {
    icon: CreditCard,
    title: "Credit card SOA",
    description:
      "Fetch statement PDFs from Gmail, unlock, parse dues, and generate summary reports for Metrobank, BPI, RCBC, and Unionbank.",
  },
  {
    icon: Bell,
    title: "Smart reminders",
    description:
      "Daily due-date reminders via Telegram and Slack — starting days before your due date through payment day.",
  },
  {
    icon: Zap,
    title: "Automations",
    description:
      "Schedule SOA runs and reminder jobs. Wire Supabase Cron or any scheduler to secure API endpoints.",
  },
  {
    icon: Shield,
    title: "Encrypted secrets",
    description:
      "Card PDF passwords and integration tokens encrypted at rest. Multi-user ready when you need it.",
  },
] as const;

const STATS = [
  { label: "PH banks supported", value: "4" },
  { label: "Reminder window", value: "4 days before due" },
  { label: "Channels", value: "Telegram · Slack" },
] as const;

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect(ROUTES.dashboard.root);

  return (
    <div className="brand-page-bg relative min-h-screen overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLogo size="md" showTagline />
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href={ROUTES.login}>Sign in</Link>
          </Button>
          <Button asChild className="shadow-glow">
            <Link href={ROUTES.login}>Get started with Google</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-4">
        <section className="mx-auto max-w-3xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Finance automation for operators
          </p>
          <h1 className="text-balance font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Run your money ops on autopilot —{" "}
            <span className="text-gradient">not another spreadsheet</span>
          </h1>
          <p className="text-pretty mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            KameOps is your command center for credit card SOA processing,
            due-date notifications, receipt OCR, and workflow automations. Built
            for reliability when bills and deadlines cannot slip.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild className="shadow-glow">
              <Link href={ROUTES.login}>
                Start with Google
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={ROUTES.login}>Sign in to dashboard</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-4 rounded-2xl border border-border/80 bg-card/60 p-6 shadow-card backdrop-blur-sm sm:max-w-none">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-2xl font-bold tabular-nums text-primary">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </section>

        <section className="mt-20 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f, index) => (
            <div
              key={f.title}
              className="interactive-glow group rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur-sm"
              style={{ animationDelay: `${index * 75}ms` }}
            >
              <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-primary/15 to-[hsl(var(--chart-2)/0.12)] p-3 ring-1 ring-primary/20">
                <f.icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                {f.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-24 rounded-2xl border border-primary/20 bg-gradient-primary-subtle p-8 text-center shadow-soft-md sm:p-12">
          <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Ready to automate your next billing cycle?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Connect Gmail, add your cards, and run your first SOA in minutes.
          </p>
          <Button size="lg" className="mt-8 shadow-glow" asChild>
            <Link href={ROUTES.login}>
              Create free account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border py-10 text-center">
        <BrandLogo className="mx-auto justify-center" size="sm" />
        <p className="mt-3 text-sm text-muted-foreground">
          Credit cards · Reminders · Automations · More modules coming
        </p>
      </footer>
    </div>
  );
}
