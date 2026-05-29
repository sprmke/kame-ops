/**
 * Migrate legacy pay-credit-cards JSON state into KameOps Postgres.
 *
 * Usage:
 *   LEGACY_DATA_DIR=/path/to/pay-credit-cards/data USER_ID=<uuid> bun run scripts/migrate-from-cli.ts
 */
import { readFile } from "fs/promises";
import { join } from "path";

import { db } from "../apps/web/src/lib/db";
import { creditCards, dueEntries } from "../apps/web/src/lib/db/schema";
import { encryptSecret } from "../apps/web/src/lib/utils/encryption";

const dataDir = process.env.LEGACY_DATA_DIR;
const userId = process.env.USER_ID;

if (!dataDir || !userId) {
  console.error("Set LEGACY_DATA_DIR and USER_ID");
  process.exit(1);
}

async function main() {
  const cardsPath =
    process.env.LEGACY_CARDS_JSON ?? join(dataDir, "..", "cards.json");
  const duePath = join(dataDir, "due-reminders-state.json");

  try {
    const cardsRaw = JSON.parse(await readFile(cardsPath, "utf8")) as Array<{
      issuer: string;
      last4: string;
      password: string;
      label?: string;
      fullPan?: string;
      contactLine?: string;
      gmailMonthOffset?: number;
    }>;

    for (const c of cardsRaw) {
      await db.insert(creditCards).values({
        userId,
        issuer: c.issuer,
        last4: c.last4,
        label: c.label,
        fullPan: c.fullPan,
        contactLine: c.contactLine,
        pdfPasswordEncrypted: encryptSecret(c.password),
        gmailMonthOffset: c.gmailMonthOffset ?? 0,
      });
    }
    console.log(`Imported ${cardsRaw.length} cards`);
  } catch (e) {
    console.warn("Cards import skipped:", e);
  }

  try {
    const dueState = JSON.parse(await readFile(duePath, "utf8")) as {
      dues: Array<{
        issuerId: string;
        cardLast4: string;
        bankLabel: string;
        cardDisplayLabel?: string;
        fullPan?: string;
        dueDate: string;
        dueDateYMD: string;
        minimumDue: string;
        totalDue: string;
        interestCharges?: string;
        contactLine?: string;
        paidAt?: string;
      }>;
    };

    for (const d of dueState.dues ?? []) {
      await db.insert(dueEntries).values({
        userId,
        issuerId: d.issuerId,
        cardLast4: d.cardLast4,
        bankLabel: d.bankLabel,
        cardDisplayLabel: d.cardDisplayLabel,
        fullPan: d.fullPan,
        dueDate: d.dueDate,
        dueDateYmd: d.dueDateYMD,
        minimumDue: d.minimumDue,
        totalDue: d.totalDue,
        interestCharges: d.interestCharges,
        contactLine: d.contactLine,
        paidAt: d.paidAt ? new Date(d.paidAt) : undefined,
      });
    }
    console.log(`Imported ${dueState.dues?.length ?? 0} due entries`);
  } catch (e) {
    console.warn("Due entries import skipped:", e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
