"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Textarea } from "@restai/ui/components/textarea";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { ImageUploadButton } from "../../menu/_components/image-upload-button";
import { useCreateExpense, useUpdateExpense, type MaterialExpense } from "@/hooks/use-expenses";
import { toast } from "sonner";

export const EXPENSE_CATEGORIES = [
  "Copos e tampas",
  "Canudos",
  "Luvas",
  "Frutas",
  "Complementos",
  "Embalagens",
  "Descartáveis",
  "Limpeza",
  "Outros",
];

function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: MaterialExpense | null;
}

export function ExpenseDialog({ open, onOpenChange, expense }: ExpenseDialogProps) {
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const isEditing = !!expense;

  const [form, setForm] = useState({
    category: EXPENSE_CATEGORIES[0],
    customCategory: "",
    description: "",
    amount: "",
    vendor: "",
    notes: "",
    receiptUrl: "",
    expenseDate: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (!open) return;
    if (expense) {
      const known = EXPENSE_CATEGORIES.includes(expense.category);
      setForm({
        category: known ? expense.category : "Outros",
        customCategory: known ? "" : expense.category,
        description: expense.description,
        amount: (expense.amount / 100).toFixed(2),
        vendor: expense.vendor ?? "",
        notes: expense.notes ?? "",
        receiptUrl: expense.receipt_url ?? "",
        expenseDate: toDateInputValue(expense.expense_date),
      });
    } else {
      setForm({
        category: EXPENSE_CATEGORIES[0],
        customCategory: "",
        description: "",
        amount: "",
        vendor: "",
        notes: "",
        receiptUrl: "",
        expenseDate: new Date().toISOString().slice(0, 10),
      });
    }
  }, [open, expense]);

  const isPending = createExpense.isPending || updateExpense.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountValue = parseFloat(form.amount.replace(",", "."));
    if (!form.description.trim() || !Number.isFinite(amountValue) || amountValue <= 0) return;

    const category = form.category === "Outros" && form.customCategory.trim()
      ? form.customCategory.trim()
      : form.category;

    const payload = {
      category,
      description: form.description.trim(),
      amount: Math.round(amountValue * 100),
      vendor: form.vendor.trim() || undefined,
      notes: form.notes.trim() || undefined,
      receiptUrl: form.receiptUrl || undefined,
      expenseDate: new Date(form.expenseDate).toISOString(),
    };

    try {
      if (isEditing && expense) {
        await updateExpense.mutateAsync({ id: expense.id, data: payload });
        toast.success("Gasto atualizado");
      } else {
        await createExpense.mutateAsync(payload);
        toast.success("Gasto registrado");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Gasto" : "Novo Gasto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expCategory">Categoria</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria..." />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expDate">Data *</Label>
              <Input
                id="expDate"
                type="date"
                value={form.expenseDate}
                onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                required
              />
            </div>
          </div>

          {form.category === "Outros" && (
            <div className="space-y-2">
              <Label htmlFor="expCustomCategory">Nome da categoria</Label>
              <Input
                id="expCustomCategory"
                placeholder="Ex: Manutenção, Equipamentos..."
                value={form.customCategory}
                onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="expDescription">Descrição *</Label>
            <Input
              id="expDescription"
              placeholder="Ex: Copos 16oz x 500 unidades"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expAmount">Valor (US$) *</Label>
              <Input
                id="expAmount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expVendor">Fornecedor</Label>
              <Input
                id="expVendor"
                placeholder="Ex: Costco, Restaurant Depot..."
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expNotes">Notas</Label>
            <Textarea
              id="expNotes"
              placeholder="Observações..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Foto do recibo</Label>
            <ImageUploadButton
              currentUrl={form.receiptUrl}
              onUploaded={(url) => setForm({ ...form, receiptUrl: url })}
              uploadType="expense"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.description.trim() || !form.amount}
            >
              {isPending ? "Salvando..." : isEditing ? "Salvar" : "Registrar Gasto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
