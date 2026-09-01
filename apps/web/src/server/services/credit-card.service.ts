import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  BANK_ISSUERS,
  accounts,
  creditCards,
  normalizeCardColor,
  soaSubjectForStorage,
  effectiveSoaSubject,
  type BankIssuer,
} from "@/lib/db/schema";
import { formatGoogleAccountLabel } from "@/lib/google/google-account-display";
import { encryptSecret, tryDecryptSecret } from "@/lib/utils/encryption";
import { cachedPerRequest } from "@/server/lib/request-cache";
import { gmailService } from "@/server/services/gmail.service";

function stripEncryptedPassword<T extends { pdfPasswordEncrypted: string }>(
  card: T,
): Omit<T, "pdfPasswordEncrypted"> {
  const { pdfPasswordEncrypted: _encrypted, ...rest } = card;
  return rest;
}

const createCardSchema = z.object({
  issuer: z.enum(BANK_ISSUERS),
  last4: z.string().length(4),
  label: z.string().optional(),
  fullPan: z.string().optional(),
  contactLine: z.string().optional(),
  pdfPassword: z.string().min(1),
  gmailMonthOffset: z.number().int().optional(),
  googleAccountId: z.string().uuid().optional().nullable(),
  soaSubject: z.string().max(512).optional().nullable(),
  dueDay: z.number().int().min(1).max(31),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value like #E8720C")
    .optional()
    .nullable(),
  reminderWindowDays: z.number().int().min(0).max(60).optional().nullable(),
  reminderIntervalMinutes: z.number().int().min(60).max(1440).optional(),
  notes: z.string().optional(),
});

export const creditCardService = {
  async resolveGoogleAccountId(
    userId: string,
    googleAccountId: string | null | undefined,
  ): Promise<string | null> {
    if (googleAccountId) {
      await gmailService.assertGoogleAccountOwned(userId, googleAccountId);
      return googleAccountId;
    }
    return gmailService.getDefaultGoogleAccountId(userId);
  },

  list: cachedPerRequest("creditCards.list", async (userId: string) => {
    const [cards, defaultGoogleAccountId, googleAccountRows] =
      await Promise.all([
        db.query.creditCards.findMany({
          where: and(
            eq(creditCards.userId, userId),
            isNull(creditCards.deletedAt),
          ),
          orderBy: (t, { asc }) => [asc(t.issuer), asc(t.last4)],
        }),
        gmailService.getDefaultGoogleAccountId(userId),
        db.query.accounts.findMany({
          where: and(
            eq(accounts.userId, userId),
            eq(accounts.provider, "google"),
          ),
          columns: { id: true, googleEmail: true, googleName: true },
        }),
      ]);
    const labelByAccountId = new Map(
      googleAccountRows.map((row) => [
        row.id,
        formatGoogleAccountLabel({
          name: row.googleName,
          email: row.googleEmail,
        }),
      ]),
    );

    return cards.map((card) => {
      const stripped = stripEncryptedPassword(card);
      const resolvedAccountId =
        card.googleAccountId ?? defaultGoogleAccountId ?? null;
      return {
        ...stripped,
        googleAccountLabel: resolvedAccountId
          ? (labelByAccountId.get(resolvedAccountId) ?? null)
          : null,
      };
    });
  }),

  async getById(userId: string, id: string) {
    const card = await db.query.creditCards.findFirst({
      where: and(
        eq(creditCards.id, id),
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
      ),
    });
    return card ? stripEncryptedPassword(card) : null;
  },

  async getForEdit(userId: string, id: string) {
    const card = await db.query.creditCards.findFirst({
      where: and(
        eq(creditCards.id, id),
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
      ),
    });
    if (!card) return null;

    const { pdfPasswordEncrypted, ...rest } = card;
    const pdfPassword = tryDecryptSecret(pdfPasswordEncrypted);
    return {
      ...rest,
      pdfPassword: pdfPassword ?? "",
      secretsUnavailable: pdfPassword === null,
    };
  },

  async create(userId: string, input: z.infer<typeof createCardSchema>) {
    const data = createCardSchema.parse(input);
    const googleAccountId = await this.resolveGoogleAccountId(
      userId,
      data.googleAccountId,
    );
    const [card] = await db
      .insert(creditCards)
      .values({
        userId,
        issuer: data.issuer,
        last4: data.last4,
        label: data.label,
        fullPan: data.fullPan,
        contactLine: data.contactLine,
        pdfPasswordEncrypted: encryptSecret(data.pdfPassword),
        gmailMonthOffset: data.gmailMonthOffset ?? 0,
        googleAccountId,
        soaSubject: soaSubjectForStorage(data.soaSubject, data.issuer),
        dueDay: data.dueDay,
        color: normalizeCardColor(data.color, data.issuer),
        reminderWindowDays: data.reminderWindowDays ?? null,
        reminderIntervalMinutes: data.reminderIntervalMinutes ?? 1440,
        notes: data.notes,
      })
      .returning();
    if (!card) throw new Error("Failed to create card");
    return stripEncryptedPassword(card);
  },

  async update(
    userId: string,
    id: string,
    input: Partial<z.infer<typeof createCardSchema>> & { isActive?: boolean },
  ) {
    const existing = await db.query.creditCards.findFirst({
      where: and(
        eq(creditCards.id, id),
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
      ),
    });
    if (!existing) throw new Error("Card not found");

    let googleAccountId: string | null | undefined;
    if (input.googleAccountId !== undefined) {
      if (input.googleAccountId === null) {
        googleAccountId = null;
      } else {
        googleAccountId = await this.resolveGoogleAccountId(
          userId,
          input.googleAccountId,
        );
      }
    }

    const [updated] = await db
      .update(creditCards)
      .set({
        issuer: input.issuer,
        last4: input.last4,
        label: input.label,
        fullPan: input.fullPan,
        contactLine: input.contactLine,
        gmailMonthOffset: input.gmailMonthOffset,
        googleAccountId,
        soaSubject:
          input.soaSubject !== undefined
            ? soaSubjectForStorage(
                input.soaSubject,
                (input.issuer ?? existing.issuer) as BankIssuer,
              )
            : undefined,
        dueDay: input.dueDay,
        color:
          input.color !== undefined
            ? normalizeCardColor(
                input.color,
                (input.issuer ?? existing.issuer) as BankIssuer,
              )
            : undefined,
        reminderWindowDays: input.reminderWindowDays,
        reminderIntervalMinutes: input.reminderIntervalMinutes,
        notes: input.notes,
        isActive: input.isActive,
        pdfPasswordEncrypted: input.pdfPassword
          ? encryptSecret(input.pdfPassword)
          : undefined,
      })
      .where(eq(creditCards.id, id))
      .returning();
    if (!updated) throw new Error("Failed to update card");
    return stripEncryptedPassword(updated);
  },

  async softDelete(userId: string, id: string) {
    const existing = await this.getById(userId, id);
    if (!existing) throw new Error("Card not found");
    await db
      .update(creditCards)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(creditCards.id, id));
  },

  getPdfPassword(card: { pdfPasswordEncrypted: string }) {
    const plain = tryDecryptSecret(card.pdfPasswordEncrypted);
    if (plain === null) {
      throw new Error(
        `Cannot decrypt PDF password for card. Set the same ENCRYPTION_KEY used when the card was saved, or re-enter the password in the dashboard.`,
      );
    }
    return plain;
  },

  /** Cards formatted for SOA pipeline env (CARDS_JSON) — active cards only. */
  async listForSoaPipeline(userId: string) {
    const cards = await db.query.creditCards.findMany({
      where: and(
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
        eq(creditCards.isActive, true),
      ),
      orderBy: (t, { asc }) => [asc(t.issuer), asc(t.last4)],
    });
    const defaultGoogleAccountId =
      await gmailService.getDefaultGoogleAccountId(userId);
    return cards.map((c) => ({
      id: c.id,
      issuer: c.issuer,
      last4: c.last4,
      label: c.label ?? `${c.issuer} •••• ${c.last4}`,
      fullPan: c.fullPan ?? undefined,
      contactLine: c.contactLine ?? undefined,
      password: this.getPdfPassword(c),
      gmailMonthOffset: c.gmailMonthOffset ?? 0,
      googleAccountId: c.googleAccountId ?? defaultGoogleAccountId ?? undefined,
      soaSubject: effectiveSoaSubject(c.soaSubject, c.issuer as BankIssuer),
      color: c.color ?? undefined,
      reminderWindowDays: c.reminderWindowDays ?? undefined,
      reminderIntervalMinutes: c.reminderIntervalMinutes ?? 1440,
    }));
  },
};
