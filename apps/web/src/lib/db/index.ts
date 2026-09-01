import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

/**
 * Supabase's transaction pooler hands each query to an arbitrary backend, so
 * server-side prepared statements are never reused and eventually collide.
 */
const isTransactionPooler =
  connectionString.includes("pgbouncer=true") ||
  connectionString.includes(":6543");

function createClient() {
  return postgres(connectionString, {
    max: isTransactionPooler ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: !isTransactionPooler,
  });
}

// Dev hot reloads re-evaluate this module; without a singleton each reload leaks a pool.
const globalForDb = globalThis as unknown as {
  __kameOpsDbClient?: ReturnType<typeof createClient>;
};

const client = globalForDb.__kameOpsDbClient ?? createClient();
if (process.env.NODE_ENV !== "production")
  globalForDb.__kameOpsDbClient = client;

export const db = drizzle(client, { schema });
export { schema };
