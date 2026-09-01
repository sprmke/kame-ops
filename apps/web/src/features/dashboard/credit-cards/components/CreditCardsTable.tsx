"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import {
  ClickableTableRow,
  TableRowActions,
} from "@/components/shared/ClickableTableRow";
import { TableCard } from "@/components/shared/TableCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBankIssuer } from "@/lib/db/schema/credit-cards";
import { CardBankLabel } from "@/lib/credit-cards/CardBankLabel";
import { resolveCardAccent } from "@/lib/credit-cards/card-accent";
import { formatReminderSummary } from "@/lib/reminders/reminder-labels";

export type CreditCardRow = {
  id: string;
  issuer: string;
  last4: string;
  label: string | null;
  color: string | null;
  gmailMonthOffset: number | null;
  reminderWindowDays: number | null;
  reminderIntervalMinutes: number;
  dueDay: number | null;
  isActive: boolean;
  googleAccountLabel?: string | null;
};

type CreditCardsTableProps = {
  cards: CreditCardRow[];
  onEdit: (card: CreditCardRow) => void;
  onDelete: (cardId: string) => void;
};

export function CreditCardsTable({
  cards,
  onEdit,
  onDelete,
}: CreditCardsTableProps) {
  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Card</TableHead>
            <TableHead>Bank</TableHead>
            <TableHead>Last 4</TableHead>
            <TableHead className="hidden lg:table-cell">Gmail</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead>Reminders</TableHead>
            <TableHead className="w-[52px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {cards.map((card) => {
            const accent = resolveCardAccent(card.issuer, card.color);
            return (
              <ClickableTableRow
                key={card.id}
                onRowClick={() => onEdit(card)}
                style={accent.stripeStyle}
              >
                <TableCell className="font-medium">
                  <span className="font-display">
                    {card.label ?? formatBankIssuer(card.issuer)}
                  </span>
                </TableCell>
                <TableCell>
                  <CardBankLabel
                    issuerId={card.issuer}
                    color={card.color}
                    showSwatch={false}
                  />
                </TableCell>
                <TableCell className="tabular-nums">
                  •••• {card.last4}
                </TableCell>
                <TableCell className="hidden max-w-[200px] truncate text-muted-foreground lg:table-cell">
                  {card.googleAccountLabel ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={card.isActive ? "Active" : "Inactive"}
                    variant={card.isActive ? "success" : "muted"}
                  />
                </TableCell>
                <TableCell className="tabular-nums">
                  {card.dueDay ? `Day ${card.dueDay}` : "Not set"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatReminderSummary(
                    card.reminderWindowDays,
                    card.reminderIntervalMinutes,
                  )}
                </TableCell>
                <TableRowActions>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label="Card actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(card)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(card.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableRowActions>
              </ClickableTableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
