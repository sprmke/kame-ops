---
name: credit-cards
description: Credit card SOA module for KameOps — Gmail SOA fetch, PDF parsing (Metrobank, RCBC, BPI, Unionbank), due tracking, mark-paid, receipt OCR. Use when porting pay-credit-cards CLI or building CC UI/API.
---

# Credit Cards Module Skill

## Legacy Source

Port from `automated-tasks/pay-credit-cards/src/`:

| Legacy file                                                     | Target service                                     |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `soa-run.ts`                                                    | `soa.service.ts`                                   |
| `parse-soa.ts`, `parse-transactions.ts`, `pdf.ts`, `bpi-ocr.ts` | `soa-parse.service.ts`                             |
| `due-reminders-state.ts`                                        | `reminder.service.ts` + `due_entries` schema       |
| `notify.ts`, `notification-body.ts`                             | `notification.service.ts`                          |
| `send-reminders.ts`                                             | `reminder.service.ts` + cron job                   |
| `mark-paid.ts`, `receipt-ocr.ts`                                | `credit-card.service.ts`, `receipt-ocr.service.ts` |
| `google-calendar.ts`                                            | `google-calendar.service.ts`                       |
| `gmail.ts`                                                      | `gmail.service.ts`                                 |

## Card Configuration

Replace `CARDS_JSON` env with DB:

```typescript
interface CreditCard {
  issuer: "metrobank" | "rcbc" | "bpi" | "unionbank";
  last4: string;
  pdfPasswordEncrypted: string;
  label?: string;
  fullPan?: string;
  contactLine?: string;
  gmailMonthOffset?: number; // default 0
}
```

## SOA Run API

```typescript
// tRPC mutation — conceptual
runSoa: protectedProcedure
  .input(
    z.object({
      month: z.number().min(1).max(12),
      year: z.number(),
      mode: z.enum(["single", "range"]),
      skipNotify: z.boolean().optional(),
    }),
  )
  .mutation(({ ctx, input }) => soaService.run(ctx.user.id, input));
```

## Parsing Notes

- **RCBC**: prefer geometry-ordered lines when it improves transaction count
- **BPI**: enable OCR path when pdf.js text is empty
- **Unavailable SOA**: set `soaUnavailable` flag; UI shows em dash in overview

## Mark Paid Parity

Text: `(\d{4})\s*[-–—]\s*(.+?)\s*[-–—]\s*paid`

Receipt: OCR amount must be ≥ minimum due (or total if configured).

## Summary PDF

Generate with pdfkit or store template; upload to Supabase Storage. Telegram receives document; Slack gets text + optional web link.

## Migration Checklist

- [ ] Import cards from `CARDS_JSON` seed script
- [ ] Import `due-reminders-state.json` → `due_entries` + `reminder_logs`
- [ ] Upload `data/receipts/` to Storage
- [ ] Compare one month SOA output CLI vs web for each bank

## Rule Reference

`@.cursor/rules/18-credit-cards-module.mdc`
