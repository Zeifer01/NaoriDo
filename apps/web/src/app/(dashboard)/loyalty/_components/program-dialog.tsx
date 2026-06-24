"use client";

import { useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@restai/ui/components/dialog";
import { useCreateProgram, useUpdateProgram } from "@/hooks/use-loyalty";
import { toast } from "sonner";

export function ProgramDialog({
  open,
  onOpenChange,
  editData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: any;
}) {
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const isEdit = !!editData;

  const [form, setForm] = useState({
    name: editData?.name || "Programa de Pontos",
    pointsPerCurrencyUnit: editData?.points_per_currency_unit || 1,
    currencyPerPoint: editData?.currency_per_point || 100,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      pointsPerCurrencyUnit: form.pointsPerCurrencyUnit,
      currencyPerPoint: form.currencyPerPoint,
      isActive: true,
    };

    const mutation = isEdit ? updateProgram : createProgram;
    const data = isEdit ? { id: editData.id, ...payload } : payload;

    mutation.mutate(data, {
      onSuccess: () => {
        onOpenChange(false);
        toast.success(isEdit ? "Programa atualizado" : "Programa criado com sucesso");
      },
      onError: (err) => toast.error(`Error: ${(err as Error).message}`),
    });
  }

  // Points simulator
  const exampleSpend = 50;
  const pointsEarned = exampleSpend * form.pointsPerCurrencyUnit;
  const pointValue = form.currencyPerPoint / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Programa" : "Criar Programa de Fidelidade"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prog-name">Nome do programa</Label>
            <Input id="prog-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-ppu">Pontos por sol gastado</Label>
            <Input
              id="prog-ppu"
              type="number"
              min={1}
              value={form.pointsPerCurrencyUnit}
              onChange={(e) => setForm((p) => ({ ...p, pointsPerCurrencyUnit: parseInt(e.target.value) || 1 }))}
            />
            <p className="text-xs text-muted-foreground">Quantos pontos o cliente ganha por cada R$ 1,00 gasto</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-cpp">Valor por ponto (centavos)</Label>
            <Input
              id="prog-cpp"
              type="number"
              min={1}
              value={form.currencyPerPoint}
              onChange={(e) => setForm((p) => ({ ...p, currencyPerPoint: parseInt(e.target.value) || 100 }))}
            />
            <p className="text-xs text-muted-foreground">Valor em centavos de cada ponto ao resgatar (100 = R$ 1,00)</p>
          </div>

          {/* Simulator */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Pré-visualização</p>
            <p className="text-xs text-muted-foreground">
              Se seu cliente gastar <span className="font-bold text-foreground">R$ {exampleSpend},00</span>, ganha{" "}
              <span className="font-bold text-primary">{pointsEarned} pontos</span>.
            </p>
            <p className="text-xs text-muted-foreground">
              Com <span className="font-bold text-foreground">100 pontos</span> acumulados, pode resgatar{" "}
              <span className="font-bold text-primary">R$ {(100 * pointValue).toFixed(2).replace(".", ",")}</span> em descontos.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createProgram.isPending || updateProgram.isPending}>
              {(createProgram.isPending || updateProgram.isPending) ? "Salvando..." : isEdit ? "Salvar Alterações" : "Criar Programa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
