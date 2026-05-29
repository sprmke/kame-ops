import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { BANK_ISSUERS, creditCards } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/utils/encryption";

const createCardSchema = z.object({
  issuer: z.enum(BANK_ISSUERS),
  last4: z.string().length(4),
  label: z.string().optional(),
  fullPan: z.string().optional(),
  contactLine: z.string().optional(),
  pdfPassword: z.string().min(1),
  gmailMonthOffset: z.number().int().optional(),
});

export const creditCardService = {
  async list(userId: string) {
    return db.query.creditCards.findMany({
      where: and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
      orderBy: (t, { asc }) => [asc(t.issuer), asc(t.last4)],
    });
  },

  async getById(userId: string, id: string) {
    return db.query.creditCards.findFirst({
      where: and(
        eq(creditCards.id, id),
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
      ),
    });
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
      })
      .returning();
    return card;
  },

  async update(
    userId: string,
    id: string,
    input: Partial<z.infer<typeof createCardSchema>> & { isActive?: boolean },
  ) {
    const existing = await this.getById(userId, id);
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
        isActive: input.isActive,
        pdfPasswordEncrypted: input.pdfPassword
          ? encryptSecret(input.pdfPassword)
          : undefined,
      })
      .where(eq(creditCards.id, id))
      .returning();
    return updated;
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
    return decryptSecret(card.pdfPasswordEncrypted);
  },

  /** Cards formatted for legacy SOA runner */
  async listForLegacy(userId: string) {
    const cards = await this.list(userId);
    return cards.map((c) => ({
      issuer: c.issuer,
      last4: c.last4,
      label: c.label ?? `${c.issuer} •••• ${c.last4}`,
      fullPan: c.fullPan ?? undefined,
      contactLine: c.contactLine ?? undefined,
      password: this.getPdfPassword(c),
      gmailMonthOffset: c.gmailMonthOffset ?? 0,
    }));
  },
};
