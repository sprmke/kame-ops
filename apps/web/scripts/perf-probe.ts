/**
 * Times the dashboard's hot tRPC procedures against the real database.
 *
 * Run with: bun run scripts/perf-probe.ts
 */
import { appRouter } from "@/server/routers/_app";
import { runWithRequestCache } from "@/server/lib/request-cache";
import { db, schema } from "@/lib/db";

type Probe = {
  label: string;
  run: (caller: ReturnType<typeof appRouter.createCaller>) => Promise<unknown>;
};

const PROBES: Probe[] = [
  { label: "overview.stats", run: (c) => c.overview.stats() },
  { label: "creditCards.list", run: (c) => c.creditCards.list() },
  { label: "soa.listPeriods", run: (c) => c.soa.listPeriods() },
  {
    label: "reminders.listDue",
    run: (c) => c.reminders.listDue({ unpaidOnly: false }),
  },
  { label: "reminders.status", run: (c) => c.reminders.status() },
  { label: "integrations.list", run: (c) => c.integrations.list() },
  { label: "receipts.list", run: (c) => c.receipts.list() },
];

function makeCaller(userId: string, email: string) {
  return appRouter.createCaller({
    session: {
      user: { id: userId, email },
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    },
  } as never);
}

async function main() {
  const [user] = await db.select().from(schema.users).limit(1);
  if (!user) {
    console.error("No users in the database — cannot probe.");
    process.exit(1);
  }

  console.log(`Probing as ${user.email}\n`);
  console.log("procedure                 cold      warm");
  console.log("-----------------------------------------");

  for (const probe of PROBES) {
    // Cold: a fresh request cache, like the first call in a batch.
    const cold = await time(() =>
      runWithRequestCache(
        () =>
          probe.run(makeCaller(user.id, user.email ?? "")) as Promise<unknown>,
      ),
    );

    // Warm: same request cache reused, like later calls in the same batch.
    const warm = await runWithRequestCache(async () => {
      const caller = makeCaller(user.id, user.email ?? "");
      await probe.run(caller);
      return time(() => probe.run(caller) as Promise<unknown>);
    });

    console.log(
      `${probe.label.padEnd(24)} ${fmt(cold).padStart(7)}  ${fmt(warm).padStart(8)}`,
    );
  }

  process.exit(0);
}

async function time(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  try {
    await fn();
  } catch (error) {
    console.error(`  failed: ${(error as Error).message}`);
    return Number.NaN;
  }
  return performance.now() - start;
}

const fmt = (ms: number) => (Number.isNaN(ms) ? "err" : `${Math.round(ms)}ms`);

void main();
