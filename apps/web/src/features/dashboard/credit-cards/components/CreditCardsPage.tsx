'use client';

import { useEffect, useState } from 'react';
import { CreditCard, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardPageHeader } from '@/components/shared/DashboardPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ListViewToolbar } from '@/components/shared/ListViewToolbar';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';
import { useListPagination } from '@/lib/hooks/use-list-pagination';
import {
  BANK_ISSUERS,
  DEFAULT_CARD_COLORS,
  DEFAULT_SOA_SUBJECTS,
  defaultSoaSubject,
  normalizeSoaSubject,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  formatBankIssuer,
  normalizeBankIssuer,
  normalizeCardColor,
  normalizeReminderIntervalMinutes,
  REMINDER_INTERVALS,
  type BankIssuer,
  type ReminderIntervalMinutes,
} from '@/lib/db/schema/credit-cards';

import {
  DEFAULT_REMINDER_WINDOW_DAYS,
  formatReminderSummary,
} from '../lib/reminder-labels';
import { CreditCardsTable } from './CreditCardsTable';
import { CardColorPicker } from './CardColorPicker';
import { usePersistedViewMode } from '@/hooks/use-persisted-view-mode';
import { CardBankLabel } from '@/lib/credit-cards/CardBankLabel';
import { resolveCardAccent } from '@/lib/credit-cards/card-accent';

const DEFAULT_WINDOW = DEFAULT_REMINDER_WINDOW_DAYS;

export function CreditCardsPage() {
  const utils = api.useUtils();
  const { data: cards, isLoading } = api.creditCards.list.useQuery();
  const { viewMode, setViewMode } = usePersistedViewMode(
    'kame-ops:credit-cards-view-mode',
  );
  const pagination = useListPagination(cards ?? [], 7);

  const create = api.creditCards.create.useMutation({
    onSuccess: () => {
      toast.success('Card added');
      void utils.creditCards.list.invalidate();
      void utils.overview.stats.invalidate();
      setAddOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = api.creditCards.update.useMutation({
    onSuccess: (_data, variables) => {
      toast.success('Card updated');
      void utils.creditCards.list.invalidate();
      void utils.creditCards.get.invalidate({ id: variables.id });
      setEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = api.creditCards.delete.useMutation({
    onSuccess: () => {
      toast.success('Card removed');
      void utils.creditCards.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [issuer, setIssuer] = useState<BankIssuer>('bpi');
  const [last4, setLast4] = useState('');
  const [label, setLabel] = useState('');
  const [fullPan, setFullPan] = useState('');
  const [contactLine, setContactLine] = useState('');
  const [pdfPassword, setPdfPassword] = useState('');
  const [gmailMonthOffset, setGmailMonthOffset] = useState('0');
  const [reminderWindowDays, setReminderWindowDays] = useState('');
  const [reminderIntervalMinutes, setReminderIntervalMinutes] =
    useState<ReminderIntervalMinutes>(DEFAULT_REMINDER_INTERVAL_MINUTES);
  const [notes, setNotes] = useState('');
  const [soaSubject, setSoaSubject] = useState(defaultSoaSubject('bpi'));
  const [color, setColor] = useState(DEFAULT_CARD_COLORS.bpi);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formPopulatedForId, setFormPopulatedForId] = useState<string | null>(
    null,
  );

  const { data: editingCard, isLoading: isLoadingEdit } =
    api.creditCards.get.useQuery(
      { id: editingId! },
      {
        enabled: !!editingId && editOpen,
        staleTime: 0,
      },
    );

  const editFormReady =
    !!editingId &&
    !!editingCard &&
    editingCard.id === editingId &&
    !isLoadingEdit &&
    formPopulatedForId === editingId;

  useEffect(() => {
    if (!editingCard || editingCard.id !== editingId) return;
    setIssuer(normalizeBankIssuer(editingCard.issuer));
    setLast4(editingCard.last4);
    setLabel(editingCard.label ?? '');
    setFullPan(editingCard.fullPan ?? '');
    setContactLine(editingCard.contactLine ?? '');
    setPdfPassword(editingCard.pdfPassword);
    setGmailMonthOffset(String(editingCard.gmailMonthOffset ?? 0));
    setReminderWindowDays(
      editingCard.reminderWindowDays != null
        ? String(editingCard.reminderWindowDays)
        : '',
    );
    setReminderIntervalMinutes(
      normalizeReminderIntervalMinutes(editingCard.reminderIntervalMinutes),
    );
    setNotes(editingCard.notes ?? '');
    setSoaSubject(
      normalizeSoaSubject(
        editingCard.soaSubject,
        normalizeBankIssuer(editingCard.issuer),
      ),
    );
    setColor(
      normalizeCardColor(
        editingCard.color,
        normalizeBankIssuer(editingCard.issuer),
      ) ?? DEFAULT_CARD_COLORS.bpi,
    );
    if (editingCard.secretsUnavailable) {
      toast.error('PDF password could not be decrypted. Re-enter it and save.');
    }
    setFormPopulatedForId(editingId);
  }, [editingCard, editingId]);

  function resetForm() {
    setIssuer('bpi');
    setLast4('');
    setLabel('');
    setFullPan('');
    setContactLine('');
    setPdfPassword('');
    setGmailMonthOffset('0');
    setReminderWindowDays('');
    setReminderIntervalMinutes(DEFAULT_REMINDER_INTERVAL_MINUTES);
    setNotes('');
    setSoaSubject(defaultSoaSubject('bpi'));
    setColor(DEFAULT_CARD_COLORS.bpi);
  }

  function formPayload() {
    const windowDays = reminderWindowDays.trim()
      ? Number(reminderWindowDays)
      : null;
    return {
      issuer,
      last4,
      label: label || undefined,
      fullPan: fullPan || undefined,
      contactLine: contactLine || undefined,
      gmailMonthOffset: Number(gmailMonthOffset) || 0,
      reminderWindowDays: windowDays,
      reminderIntervalMinutes,
      notes: notes || undefined,
      soaSubject: normalizeSoaSubject(soaSubject, issuer),
      color: normalizeCardColor(color, issuer),
    };
  }

  function openEdit(cardId: string) {
    setFormPopulatedForId(null);
    setEditingId(cardId);
    setEditOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Credit cards"
        actions={
          <Dialog
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>Add card</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add credit card</DialogTitle>
              </DialogHeader>
              <CardForm
                issuer={issuer}
                setIssuer={setIssuer}
                last4={last4}
                setLast4={setLast4}
                label={label}
                setLabel={setLabel}
                fullPan={fullPan}
                setFullPan={setFullPan}
                contactLine={contactLine}
                setContactLine={setContactLine}
                pdfPassword={pdfPassword}
                setPdfPassword={setPdfPassword}
                gmailMonthOffset={gmailMonthOffset}
                setGmailMonthOffset={setGmailMonthOffset}
                reminderWindowDays={reminderWindowDays}
                setReminderWindowDays={setReminderWindowDays}
                reminderIntervalMinutes={reminderIntervalMinutes}
                setReminderIntervalMinutes={setReminderIntervalMinutes}
                notes={notes}
                setNotes={setNotes}
                soaSubject={soaSubject}
                setSoaSubject={setSoaSubject}
                color={color}
                setColor={setColor}
                onSubmit={() =>
                  create.mutate({ ...formPayload(), pdfPassword })
                }
                pending={create.isPending}
                submitLabel="Add card"
              />
            </DialogContent>
          </Dialog>
        }
      />

      {!cards?.length ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6 text-muted-foreground" />}
          title="No cards configured"
          message="Add your first credit card to start running SOA and due reminders."
        />
      ) : (
        <>
          <ListViewToolbar
            total={pagination.total}
            itemLabel="cards"
            page={pagination.page}
            pageCount={pagination.pageCount}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            hasMultiplePages={pagination.hasMultiplePages}
            onPageChange={pagination.setPage}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
          {viewMode === 'table' ? (
            <CreditCardsTable
              cards={pagination.items}
              onEdit={(card) => openEdit(card.id)}
              onDelete={setDeleteId}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pagination.items.map((card) => {
                const accent = resolveCardAccent(card.issuer, card.color);
                return (
                  <Card
                    key={card.id}
                    className="group overflow-hidden border-border/80 shadow-card transition-all hover:shadow-card-hover"
                  >
                    <div
                      className="h-1"
                      style={{ backgroundColor: accent.color }}
                    />
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <CardTitle className="font-display text-lg leading-tight">
                            {card.label ?? formatBankIssuer(card.issuer)}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground tabular-nums">
                            •••• {card.last4}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <CardBankLabel
                              issuerId={card.issuer}
                              color={card.color}
                            />
                            <StatusBadge
                              label={card.isActive ? 'Active' : 'Inactive'}
                              variant={card.isActive ? 'success' : 'muted'}
                            />
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              aria-label="Card actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(card.id)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteId(card.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Reminder window
                          </p>
                          <p className="font-medium">
                            {formatReminderSummary(
                              card.reminderWindowDays,
                              card.reminderIntervalMinutes,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Interval
                          </p>
                          <p className="font-medium">
                            {REMINDER_INTERVALS.find(
                              (i) => i.value === card.reminderIntervalMinutes,
                            )?.label ?? 'Once per day'}
                          </p>
                        </div>
                      </div>
                      {(card.gmailMonthOffset ?? 0) !== 0 && (
                        <StatusBadge
                          label={`Statement month +${card.gmailMonthOffset}`}
                          variant="muted"
                        />
                      )}
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => openEdit(card.id)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit card
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingId(null);
            setFormPopulatedForId(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit card</DialogTitle>
          </DialogHeader>
          {editFormReady ? (
            editingId && (
              <CardForm
                key={`${editingId}-${String(editingCard.updatedAt)}`}
                issuer={issuer}
                setIssuer={setIssuer}
                last4={last4}
                setLast4={setLast4}
                label={label}
                setLabel={setLabel}
                fullPan={fullPan}
                setFullPan={setFullPan}
                contactLine={contactLine}
                setContactLine={setContactLine}
                pdfPassword={pdfPassword}
                setPdfPassword={setPdfPassword}
                gmailMonthOffset={gmailMonthOffset}
                setGmailMonthOffset={setGmailMonthOffset}
                reminderWindowDays={reminderWindowDays}
                setReminderWindowDays={setReminderWindowDays}
                reminderIntervalMinutes={reminderIntervalMinutes}
                setReminderIntervalMinutes={setReminderIntervalMinutes}
                notes={notes}
                setNotes={setNotes}
                soaSubject={soaSubject}
                setSoaSubject={setSoaSubject}
                color={color}
                setColor={setColor}
                passwordOptional
                onSubmit={() =>
                  update.mutate({
                    id: editingId,
                    ...formPayload(),
                    ...(pdfPassword ? { pdfPassword } : {}),
                  })
                }
                pending={update.isPending}
                submitLabel="Save changes"
              />
            )
          ) : (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove this card?"
        description="SOA history is kept, but this card will no longer be used for new runs."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (deleteId) remove.mutate({ id: deleteId });
          setDeleteId(null);
        }}
      />
    </div>
  );
}

function CardForm({
  issuer,
  setIssuer,
  last4,
  setLast4,
  label,
  setLabel,
  fullPan,
  setFullPan,
  contactLine,
  setContactLine,
  pdfPassword,
  setPdfPassword,
  gmailMonthOffset,
  setGmailMonthOffset,
  reminderWindowDays,
  setReminderWindowDays,
  reminderIntervalMinutes,
  setReminderIntervalMinutes,
  notes,
  setNotes,
  soaSubject,
  setSoaSubject,
  color,
  setColor,
  passwordOptional,
  onSubmit,
  pending,
  submitLabel,
}: {
  issuer: BankIssuer;
  setIssuer: (v: BankIssuer) => void;
  last4: string;
  setLast4: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  fullPan: string;
  setFullPan: (v: string) => void;
  contactLine: string;
  setContactLine: (v: string) => void;
  pdfPassword: string;
  setPdfPassword: (v: string) => void;
  gmailMonthOffset: string;
  setGmailMonthOffset: (v: string) => void;
  reminderWindowDays: string;
  setReminderWindowDays: (v: string) => void;
  reminderIntervalMinutes: ReminderIntervalMinutes;
  setReminderIntervalMinutes: (v: ReminderIntervalMinutes) => void;
  notes: string;
  setNotes: (v: string) => void;
  soaSubject: string;
  setSoaSubject: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  passwordOptional?: boolean;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-2">
        <Label>Bank</Label>
        <Select
          key={issuer}
          value={issuer}
          onValueChange={(v) => {
            const next = normalizeBankIssuer(v);
            setIssuer(next);
            setSoaSubject(defaultSoaSubject(next));
            setColor(DEFAULT_CARD_COLORS[next]);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select bank">
              {formatBankIssuer(issuer)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {BANK_ISSUERS.map((i) => (
              <SelectItem key={i} value={i}>
                {formatBankIssuer(i)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Last 4 digits</Label>
          <Input
            value={last4}
            onChange={(e) => setLast4(e.target.value)}
            maxLength={4}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Statement month shift</Label>
          <Input
            type="number"
            value={gmailMonthOffset}
            onChange={(e) => setGmailMonthOffset(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Full card number</Label>
        <Input
          value={fullPan}
          onChange={(e) => setFullPan(e.target.value)}
          placeholder="4532 XXXX XXXX 9012"
        />
      </div>
      <div className="space-y-2">
        <Label>Contact line</Label>
        <Textarea
          value={contactLine}
          onChange={(e) => setContactLine(e.target.value)}
          rows={2}
          placeholder="1-800-XXX-XXXX (Press 1, 2)"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Days before due</Label>
          <Input
            type="number"
            min={0}
            max={60}
            value={reminderWindowDays}
            onChange={(e) => setReminderWindowDays(e.target.value)}
            placeholder={`Default (${DEFAULT_WINDOW})`}
          />
        </div>
        <div className="space-y-2">
          <Label>How often</Label>
          <Select
            value={String(reminderIntervalMinutes)}
            onValueChange={(v) =>
              setReminderIntervalMinutes(Number(v) as ReminderIntervalMinutes)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Once per day" />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_INTERVALS.map((i) => (
                <SelectItem key={i.value} value={String(i.value)}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>SOA subject</Label>
        <Input
          value={soaSubject}
          onChange={(e) => setSoaSubject(e.target.value)}
          placeholder={DEFAULT_SOA_SUBJECTS[issuer]}
        />
      </div>
      <div className="space-y-2">
        <Label>Color</Label>
        <CardColorPicker value={color} onChange={setColor} />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>PDF password</Label>
        <PasswordInput
          value={pdfPassword}
          onChange={(e) => setPdfPassword(e.target.value)}
          required={!passwordOptional}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
