"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Settings2, Truck } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { toast } from "sonner";
import { useFeatures } from "@/hooks/use-features";
import { useDeliveryBoard, useUpdateDeliverySettings } from "@/hooks/use-deliveries";
import { Board } from "./_components/board";

function WaitLimitControl({ current }: { current: number }) {
  const update = useUpdateDeliverySettings();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));

  useEffect(() => setValue(String(current)), [current]);

  const save = async () => {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes) || minutes < 10 || minutes > 180) {
      toast.error("Informe entre 10 e 180 minutos");
      return;
    }
    try {
      await update.mutateAsync(minutes);
      toast.success(`Limite de espera: ${minutes} min`);
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível salvar");
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Settings2 className="h-4 w-4" />
        Limite de espera: {current} min
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Prioridade após</span>
      <Input
        type="number"
        inputMode="numeric"
        min={10}
        max={180}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-20"
      />
      <span className="text-xs text-muted-foreground">min</span>
      <Button size="sm" onClick={save} disabled={update.isPending}>
        Salvar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </div>
  );
}

export default function EntregasPage() {
  const { deliveryDispatch, isLoading: featuresLoading } = useFeatures();
  const { data: board, isLoading, isFetching, error, refetch } = useDeliveryBoard();

  if (featuresLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!deliveryDispatch) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          A tela de Entregas não está habilitada para esta organização.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <h1 className="text-xl font-bold">Entregas</h1>
        </div>
        <div className="flex items-center gap-1">
          {board?.me.canManage && <WaitLimitControl current={board.settings.waitLimitMinutes} />}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
        </div>
      )}

      {error && !board && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-destructive">
            {(error as Error).message || "Não foi possível carregar as entregas"}
          </CardContent>
        </Card>
      )}

      {board && <Board board={board} />}
    </div>
  );
}
