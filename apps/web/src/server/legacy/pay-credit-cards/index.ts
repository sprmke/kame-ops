// @ts-nocheck
import { log } from "./logger";
import { parseArgs, runSoa } from "./soa-run";

const isCliEntry =
  typeof process.argv[1] === "string" &&
  (process.argv[1].includes("pay-credit-cards") ||
    process.argv[1].endsWith("/index.ts") ||
    process.argv[1].endsWith("/index.js"));

if (isCliEntry) {
  runSoa(parseArgs(process.argv.slice(2))).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(msg);
    process.exit(1);
  });
}
