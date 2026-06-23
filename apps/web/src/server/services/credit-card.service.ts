import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  BANK_ISSUERS,
  creditCards,
  normalizeCardColor,
  soaSubjectForStorage,
  effectiveSoaSubject,
  type BankIssuer,
} from "@/lib/db/schema";
import { encryptSecret, tryDecryptSecret } from "@/lib/utils/encryption";

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
  soaSubject: z.string().max(512).optional().nullable(),
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
  async list(userId: string) {
    const cards = await db.query.creditCards.findMany({
      where: and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
      orderBy: (t, { asc }) => [asc(t.issuer), asc(t.last4)],
    });
    return cards.map(stripEncryptedPassword);
  },

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
        soaSubject: soaSubjectForStorage(data.soaSubject, data.issuer),
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

    const [updated] = await db
      .update(creditCards)
      .set({
        issuer: input.issuer,
        last4: input.last4,
        label: input.label,
        fullPan: input.fullPan,
        contactLine: input.contactLine,
        gmailMonthOffset: input.gmailMonthOffset,
        soaSubject:
          input.soaSubject !== undefined
            ? soaSubjectForStorage(
                input.soaSubject,
                (input.issuer ?? existing.issuer) as BankIssuer,
              )
            : undefined,
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

  /** Cards formatted for legacy SOA runner */
  async listForLegacy(userId: string) {
    const cards = await db.query.creditCards.findMany({
      where: and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
      orderBy: (t, { asc }) => [asc(t.issuer), asc(t.last4)],
    });
    return cards.map((c) => ({
      issuer: c.issuer,
      last4: c.last4,
      label: c.label ?? `${c.issuer} •••• ${c.last4}`,
      fullPan: c.fullPan ?? undefined,
      contactLine: c.contactLine ?? undefined,
      password: this.getPdfPassword(c),
      gmailMonthOffset: c.gmailMonthOffset ?? 0,
      soaSubject: effectiveSoaSubject(c.soaSubject, c.issuer as BankIssuer),
      color: c.color ?? undefined,
      reminderWindowDays: c.reminderWindowDays ?? undefined,
      reminderIntervalMinutes: c.reminderIntervalMinutes ?? 1440,
    }));
  },
};
