"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { apiFetch } from "@/lib/fetcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface DeliveryZone {
  id: string;
  name: string;
  fee_cents: number;
  is_active: boolean;
  sort_order: number;
}

function ZoneRow({
  zone,
  currency,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  zone: DeliveryZone;
  currency: string;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (zone: DeliveryZone) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
      {/* reorder arrows */}
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default rounded"
          title="Mover para cima"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default rounded"
          title="Mover para baixo"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* active toggle */}
      <button
        type="button"
        onClick={() => onToggle(zone.id, !zone.is_active)}
        className={`h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
          zone.is_active ? "border-primary bg-primary" : "border-muted-foreground/30"
        }`}
        title={zone.is_active ? "Desativar" : "Ativar"}
      />

      <span className={`flex-1 text-sm ${!zone.is_active ? "text-muted-foreground line-through" : ""}`}>
        {zone.name}
      </span>
      <span className="text-sm font-semibold shrink-0">
        {formatCurrency(zone.fee_cents, currency)}
      </span>
      <button
        type="button"
        onClick={() => onEdit(zone)}
        className="p-1 text-muted-foreground hover:text-foreground rounded"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(zone.id)}
        className="p-1 text-muted-foreground hover:text-destructive rounded"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ZoneForm({
  initial,
  currency,
  onSave,
  onCancel,
  saving,
}: {
  initial?: DeliveryZone;
  currency: string;
  onSave: (data: { name: string; feeCents: number }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [fee, setFee] = useState(initial ? (initial.fee_cents / 100).toFixed(2) : "");

  const handleSubmit = () => {
    if (!name.trim()) { toast.error("Informe o nome do bairro/zona"); return; }
    const feeCents = Math.round(parseFloat(fee || "0") * 100);
    if (isNaN(feeCents) || feeCents < 0) { toast.error("Taxa inválida"); return; }
    onSave({ name: name.trim(), feeCents });
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-muted/30 px-3 py-2">
      <Input
        autoFocus
        placeholder="Nome do bairro / zona"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 h-8 text-sm"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <Input
        placeholder="Taxa (R$)"
        type="number"
        step="0.01"
        min="0"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        className="w-28 h-8 text-sm"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="p-1 text-primary hover:text-primary/80 rounded"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="p-1 text-muted-foreground hover:text-foreground rounded"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function DeliveryZonesPanel({ currency }: { currency: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: zones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["delivery-zones"],
    queryFn: () => apiFetch("/api/settings/delivery-zones"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["delivery-zones"] });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; feeCents: number }) =>
      apiFetch("/api/settings/delivery-zones", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => { invalidate(); setAdding(false); toast.success("Zona adicionada"); },
    onError: () => toast.error("Erro ao adicionar zona"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; feeCents?: number; isActive?: boolean; sortOrder?: number }) =>
      apiFetch(`/api/settings/delivery-zones/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => { invalidate(); setEditingId(null); toast.success("Zona atualizada"); },
    onError: () => toast.error("Erro ao atualizar zona"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/settings/delivery-zones/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast.success("Zona removida"); },
    onError: () => toast.error("Erro ao remover zona"),
  });

  const handleMove = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= zones.length) return;

    // Use index-based sort_orders (multiples of 10) so equal sort_orders nunca travam a reordenação
    const newOrder = [...zones];
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex]!, newOrder[index]!];

    try {
      await Promise.all([
        apiFetch(`/api/settings/delivery-zones/${newOrder[index]!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sortOrder: index * 10 }),
        }),
        apiFetch(`/api/settings/delivery-zones/${newOrder[swapIndex]!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sortOrder: swapIndex * 10 }),
        }),
      ]);
      await invalidate();
    } catch {
      toast.error("Erro ao reordenar zonas");
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Zonas de entrega</p>
          <p className="text-xs text-muted-foreground">
            Taxa de entrega por bairro/região. Quando cadastradas, o cliente escolhe sua zona no checkout.
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar
          </Button>
        )}
      </div>

      {zones.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground text-center py-3">
          Nenhuma zona cadastrada — será usada a taxa fixa configurada acima.
        </p>
      )}

      <div className="space-y-1.5">
        {zones.map((zone, idx) =>
          editingId === zone.id ? (
            <ZoneForm
              key={zone.id}
              initial={zone}
              currency={currency}
              onSave={(data) => updateMutation.mutate({ id: zone.id, ...data })}
              onCancel={() => setEditingId(null)}
              saving={isMutating}
            />
          ) : (
            <ZoneRow
              key={zone.id}
              zone={zone}
              currency={currency}
              isFirst={idx === 0}
              isLast={idx === zones.length - 1}
              onEdit={() => setEditingId(zone.id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onToggle={(id, active) => updateMutation.mutate({ id, isActive: active })}
              onMoveUp={() => handleMove(idx, "up")}
              onMoveDown={() => handleMove(idx, "down")}
            />
          ),
        )}

        {adding && (
          <ZoneForm
            currency={currency}
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setAdding(false)}
            saving={isMutating}
          />
        )}
      </div>
    </div>
  );
}
