"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Receipt } from "lucide-react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { formatCurrency, resolveUploadUrl } from "@/lib/utils";
import { useFeatures } from "@/hooks/use-features";
import { useExpenses, useDeleteExpense, type MaterialExpense } from "@/hooks/use-expenses";
import { ExpenseDialog } from "./_components/expense-dialog";
import { toast } from "sonner";

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function ExpensesPage() {
  const { materialExpenses, isLoading: featuresLoading } = useFeatures();

  if (featuresLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!materialExpenses) {
    return (
      <div className="rounded-xl border bg-card p-8 max-w-lg space-y-3">
        <h1 className="text-xl font-semibold">Gastos com materiais</h1>
        <p className="text-sm text-muted-foreground">
          Esta funcionalidade ainda não está habilitada para sua organização.
        </p>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return <ExpensesContent />;
}

function ExpensesContent() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<MaterialExpense | null>(null);

  const { startDate, endDate } = useMemo(() => monthRange(year, month), [year, month]);
  const { data, isLoading, refetch } = useExpenses({ startDate, endDate });
  const deleteExpense = useDeleteExpense();

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m);
    setYear(y);
  };

  const openCreate = () => { setEditingExpense(null); setDialogOpen(true); };
  const openEdit = (e: MaterialExpense) => { setEditingExpense(e); setDialogOpen(true); };

  async function handleDelete(e: MaterialExpense) {
    if (!confirm(`Excluir o gasto "${e.description}"?`)) return;
    try {
      await deleteExpense.mutateAsync(e.id);
      toast.success("Gasto excluído");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  const expenses = data?.expenses ?? [];
  const topCategory = data?.categoryBreakdown?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gastos com Materiais</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Copos, luvas, frutas, embalagens e qualquer outro gasto do negócio.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Gasto
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium w-40 text-center">
          {MONTH_LABELS[month]} {year}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Gasto total no mês
          </p>
          <p className="text-xl font-bold tabular-nums mt-1">
            {isLoading ? "…" : formatCurrency(data?.summary.totalAmount ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Registros
          </p>
          <p className="text-xl font-bold tabular-nums mt-1">
            {isLoading ? "…" : (data?.summary.totalExpenses ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Categoria que mais gastou
          </p>
          <p className="text-sm font-bold mt-1.5">
            {isLoading
              ? "…"
              : topCategory
                ? `${topCategory.category} · ${formatCurrency(topCategory.amount)}`
                : "—"}
          </p>
        </div>
      </div>

      {!isLoading && (data?.categoryBreakdown.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {data!.categoryBreakdown.map((c) => (
            <span
              key={c.category}
              className="text-xs px-2.5 py-1 rounded-full border bg-muted/40 text-muted-foreground"
            >
              {c.category}: <span className="font-medium text-foreground">{formatCurrency(c.amount)}</span>
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Data</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Categoria</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Descrição</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                    Fornecedor
                  </th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Valor</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="p-3">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && expenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Nenhum gasto registrado em {MONTH_LABELS[month].toLowerCase()}.
                    </td>
                  </tr>
                )}
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(e.expense_date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{e.category}</Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {e.description}
                        {e.receipt_url && (
                          <a
                            href={resolveUploadUrl(e.receipt_url) ?? e.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver recibo"
                          >
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </a>
                        )}
                      </div>
                      {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
                    </td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{e.vendor || "—"}</td>
                    <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(e.amount)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) refetch();
        }}
        expense={editingExpense}
      />
    </div>
  );
}
