'use client';

import { useEffect, useState } from 'react';
import {
  CreditCard,
  HelpCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DashboardPageHeader } from '@/components/shared/DashboardPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ListViewToolbar } from '@/components/shared/ListViewToolbar';
import { ViewModeLayout } from '@/components/shared/ViewModeLayout';
import { CardFormSkeleton } from '@/components/shared/skeletons';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { api } from '@/lib/api/client';
import { normalizeCardLast4 } from '@/lib/due/normalize';
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
} from '@/lib/reminders/reminder-labels';
import { CreditCardsTable } from './CreditCardsTable';
import { CardColorPicker } from './CardColorPicker';
import { CreditCardsLoadingView } from './CreditCardsLoadingView';
import { useHasHydrated } from '@/hooks/use-has-hydrated';
import { usePersistedViewMode } from '@/hooks/use-persisted-view-mode';
import { CardBankLabel } from '@/lib/credit-cards/CardBankLabel';
import { resolveCardAccent } from '@/lib/credit-cards/card-accent';

const DEFAULT_WINDOW = DEFAULT_REMINDER_WINDOW_DAYS;

export function CreditCardsPage() {
  const hasHydrated = useHasHydrated();
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
  const [formSessionKey, setFormSessionKey] = useState(0);

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

  function resolveLast4(fallbackLast4?: string): string {
    const panDigits = fullPan.replace(/\D/g, '');
    if (panDigits.length >= 4) {
      return normalizeCardLast4(fullPan);
    }
    if (fallbackLast4) {
      return normalizeCardLast4(fallbackLast4);
    }
    return '';
  }

  function formPayload(fallbackLast4?: string) {
    const windowDays = reminderWindowDays.trim()
      ? Number(reminderWindowDays)
      : null;
    return {
      issuer,
      last4: resolveLast4(fallbackLast4),
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

  function submitCreate() {
    const payload = formPayload();
    if (payload.last4.length !== 4) {
      toast.error('Enter a full card number with at least 4 digits');
      return;
    }
    create.mutate({ ...payload, pdfPassword });
  }

  function submitUpdate(cardId: string, fallbackLast4: string) {
    const payload = formPayload(fallbackLast4);
    if (payload.last4.length !== 4) {
      toast.error('Enter a full card number with at least 4 digits');
      return;
    }
    update.mutate({
      id: cardId,
      ...payload,
      ...(pdfPassword ? { pdfPassword } : {}),
    });
  }

  function openEdit(cardId: string) {
    setFormPopulatedForId(null);
    setFormSessionKey((key) => key + 1);
    setEditingId(cardId);
    setEditOpen(true);
  }

  if (!hasHydrated || (isLoading && cards === undefined)) {
    return <CreditCardsLoadingView />;
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
              if (open) {
                resetForm();
                setFormSessionKey((key) => key + 1);
              }
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
                key={`add-${formSessionKey}`}
                issuer={issuer}
                setIssuer={setIssuer}
                label={label}
                setLabel={setLabel}
                fullPan={fullPan}
                setFullPan={setFullPan}
                fullPanRequired
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
                onSubmit={submitCreate}
                pending={create.isPending}
                submitLabel="Add card"
              />
            </DialogContent>
          </Dialog>
        }
      />

      {!cards?.length ? (
        <EmptyState
          icon={<CreditCard className="w-6 h-6 text-muted-foreground" />}
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
          <ViewModeLayout
            viewMode={viewMode}
            table={
              <CreditCardsTable
                cards={pagination.items}
                onEdit={(card) => openEdit(card.id)}
                onDelete={setDeleteId}
              />
            }
            grid={
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pagination.items.map((card) => {
                  const accent = resolveCardAccent(card.issuer, card.color);
                  return (
                    <Card
                      key={card.id}
                      className="overflow-hidden transition-all group border-border/80 shadow-card hover:shadow-card-hover"
                    >
                      <div
                        className="h-1"
                        style={{ backgroundColor: accent.color }}
                      />
                      <CardHeader className="pb-3">
                        <div className="flex gap-2 justify-between items-start">
                          <div className="space-y-1 min-w-0">
                            <CardTitle className="text-lg leading-tight font-display">
                              {card.label ?? formatBankIssuer(card.issuer)}
                            </CardTitle>
                            <p className="text-sm tabular-nums text-muted-foreground">
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
                                className="w-8 h-8 shrink-0"
                                aria-label="Card actions"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openEdit(card.id)}
                              >
                                <Pencil className="mr-2 w-4 h-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteId(card.id)}
                              >
                                <Trash2 className="mr-2 w-4 h-4" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
                          <Pencil className="mr-2 w-4 h-4" />
                          Edit card
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            }
          />
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
                key={`edit-${editingId}-${formSessionKey}`}
                issuer={issuer}
                setIssuer={setIssuer}
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
                onSubmit={() => submitUpdate(editingId, editingCard.last4)}
                pending={update.isPending}
                submitLabel="Save changes"
              />
            )
          ) : (
            <div className="py-2">
              <CardFormSkeleton />
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

const GMAIL_MONTH_OFFSET_HINT =
  'Shifts which calendar month Gmail searches for the SOA email. Use -1 if your bank sends the statement in the previous month. Leave 0 for most banks.';

function FieldLabelWithHint({
  htmlFor,
  label,
  hint,
}: {
  htmlFor?: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex rounded-sm transition-colors text-muted-foreground hover:text-foreground"
              aria-label={`About ${label}`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-xs text-xs leading-relaxed"
          >
            {hint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function CardForm({
  issuer,
  setIssuer,
  label,
  setLabel,
  fullPan,
  setFullPan,
  fullPanRequired = false,
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
  label: string;
  setLabel: (v: string) => void;
  fullPan: string;
  setFullPan: (v: string) => void;
  fullPanRequired?: boolean;
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
          required={fullPanRequired}
        />
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
        <Label>PDF password</Label>
        <PasswordInput
          value={pdfPassword}
          onChange={(e) => setPdfPassword(e.target.value)}
          required={!passwordOptional}
        />
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="link"
          className="px-0 h-auto text-sm font-normal"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? 'Hide advanced settings' : 'Show advanced settings'}
        </Button>

        {advancedOpen ? (
          <div className="p-4 space-y-4 rounded-lg border border-border/80 bg-muted/20">
            <div className="space-y-2">
              <Label>Contact line</Label>
              <Textarea
                value={contactLine}
                onChange={(e) => setContactLine(e.target.value)}
                rows={2}
                placeholder="1-800-XXX-XXXX (Press 1, 2)"
              />
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium leading-none">
                Reminders
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reminder-window-days">Days before due</Label>
                  <Input
                    id="reminder-window-days"
                    type="number"
                    min={0}
                    max={60}
                    value={reminderWindowDays}
                    onChange={(e) => setReminderWindowDays(e.target.value)}
                    placeholder={`Default (${DEFAULT_WINDOW})`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reminder-interval">How often</Label>
                  <Select
                    value={String(reminderIntervalMinutes)}
                    onValueChange={(v) =>
                      setReminderIntervalMinutes(
                        Number(v) as ReminderIntervalMinutes,
                      )
                    }
                  >
                    <SelectTrigger id="reminder-interval">
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
            </fieldset>
            <div className="space-y-2">
              <Label>Color</Label>
              <CardColorPicker value={color} onChange={setColor} />
            </div>
            <div className="space-y-2">
              <FieldLabelWithHint
                htmlFor="gmail-month-offset"
                label="Statement month shift"
                hint={GMAIL_MONTH_OFFSET_HINT}
              />
              <Input
                id="gmail-month-offset"
                type="number"
                value={gmailMonthOffset}
                onChange={(e) => setGmailMonthOffset(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
