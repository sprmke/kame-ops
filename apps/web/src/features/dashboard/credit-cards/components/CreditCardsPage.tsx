"use client";

import { useState } from "react";
import { CreditCard, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";

const ISSUERS = ["metrobank", "rcbc", "bpi", "unionbank"] as const;

type Issuer = (typeof ISSUERS)[number];

export function CreditCardsPage() {
  const utils = api.useUtils();
  const { data: cards, isLoading } = api.creditCards.list.useQuery();

  const create = api.creditCards.create.useMutation({
    onSuccess: () => {
      toast.success("Card added");
      void utils.creditCards.list.invalidate();
      void utils.overview.stats.invalidate();
      setAddOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = api.creditCards.update.useMutation({
    onSuccess: () => {
      toast.success("Card updated");
      void utils.creditCards.list.invalidate();
      setEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = api.creditCards.delete.useMutation({
    onSuccess: () => {
      toast.success("Card removed");
      void utils.creditCards.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [issuer, setIssuer] = useState<Issuer>("bpi");
  const [last4, setLast4] = useState("");
  const [label, setLabel] = useState("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function resetForm() {
    setIssuer("bpi");
    setLast4("");
    setLabel("");
    setPdfPassword("");
  }

  function openEdit(card: NonNullable<typeof cards>[number]) {
    setEditingId(card.id);
    setIssuer(card.issuer as Issuer);
    setLast4(card.last4);
    setLabel(card.label ?? "");
    setPdfPassword("");
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
        description="Manage bank cards, PDF passwords, and Gmail month offsets for SOA fetching."
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>Add card</Button>
            </DialogTrigger>
            <DialogContent>
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
                pdfPassword={pdfPassword}
                setPdfPassword={setPdfPassword}
                onSubmit={() =>
                  create.mutate({
                    issuer,
                    last4,
                    label: label || undefined,
                    pdfPassword,
                  })
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.id} className="group">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-base capitalize">
                    {card.label ?? card.issuer}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    •••• {card.last4}
                  </p>
                </div>
                <StatusBadge
                  label={card.isActive ? "Active" : "Inactive"}
                  variant={card.isActive ? "success" : "muted"}
                />
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(card)}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(card.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit card</DialogTitle>
          </DialogHeader>
          {editingId && (
            <CardForm
              issuer={issuer}
              setIssuer={setIssuer}
              last4={last4}
              setLast4={setLast4}
              label={label}
              setLabel={setLabel}
              pdfPassword={pdfPassword}
              setPdfPassword={setPdfPassword}
              passwordOptional
              onSubmit={() =>
                update.mutate({
                  id: editingId,
                  issuer,
                  last4,
                  label: label || undefined,
                  ...(pdfPassword ? { pdfPassword } : {}),
                })
              }
              pending={update.isPending}
              submitLabel="Save changes"
            />
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
  pdfPassword,
  setPdfPassword,
  passwordOptional,
  onSubmit,
  pending,
  submitLabel,
}: {
  issuer: Issuer;
  setIssuer: (v: Issuer) => void;
  last4: string;
  setLast4: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  pdfPassword: string;
  setPdfPassword: (v: string) => void;
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
        <Select value={issuer} onValueChange={(v) => setIssuer(v as Issuer)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUERS.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
        <Label>Label (optional)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>
          PDF password {passwordOptional && "(leave blank to keep)"}
        </Label>
        <Input
          type="password"
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
