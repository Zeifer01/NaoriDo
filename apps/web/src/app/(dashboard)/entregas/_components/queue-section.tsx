"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent } from "@restai/ui/components/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { toast } from "sonner";
import { Check, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useClaimDeliveries,
  useDeliveryDrivers,
  useMarkOrderReady,
  type DeliveryBoard,
  type DeliveryStop,
} from "@/hooks/use-deliveries";
import { getCurrentPosition } from "./delivery-utils";
import { PaymentChip, WaitChip } from "./route-section";

/** Ready orders waiting for pickup. A driver takes them for himself; staff can assign them to a driver. */
export function QueueSection({ board }: { board: DeliveryBoard }) {
  const claim = useClaimDeliveries();
  const { canDrive, canManage } = board.me;
  const { data: drivers } = useDeliveryDrivers(canManage);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState<string>("");

  const queue = board.queue;
  const limit = board.settings.waitLimitMinutes;
  const picked = queue.filter((q) => selected.has(q.orderId));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = queue.length > 0 && picked.length === queue.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(queue.map((q) => q.orderId)));

  const submit = async (driverUserId?: string) => {
    if (picked.length === 0) return;
    try {
      const pos = !driverUserId && canDrive ? await getCurrentPosition() : null;
      const res = await claim.mutateAsync({
        orderIds: picked.map((p) => p.orderId),
        ...(driverUserId ? { driverUserId } : {}),
        ...(pos ? pos : {}),
      });
      setSelected(new Set());
      if (res.claimed === 0) toast.error("Esses pedidos já foram pegos por outra pessoa");
      else if (res.unavailable > 0)
        toast.warning(`${res.claimed} pedido(s) na rota · ${res.unavailable} já estavam com outro entregador`);
      else toast.success(driverUserId ? "Pedidos atribuídos" : `${res.claimed} pedido(s) na sua rota`);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível pegar os pedidos");
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          Prontos para retirar <span className="text-muted-foreground font-normal">({queue.length})</span>
        </h2>
        {queue.length > 1 && (
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allSelected ? "Limpar seleção" : "Selecionar todos"}
          </Button>
        )}
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <PackageCheck className="mx-auto mb-2 h-8 w-8 opacity-50" />
            Nenhum pedido pronto aguardando retirada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {queue.map((stop) => (
            <QueueCard
              key={stop.orderId}
              stop={stop}
              limit={limit}
              checked={selected.has(stop.orderId)}
              onToggle={() => toggle(stop.orderId)}
              selectable={canDrive || canManage}
            />
          ))}
        </div>
      )}

      {picked.length > 0 && (
        <div className="sticky bottom-16 md:bottom-3 z-10 rounded-lg border bg-background p-3 shadow-lg space-y-2">
          <p className="text-sm font-medium">
            {picked.length} pedido{picked.length > 1 ? "s" : ""} selecionado{picked.length > 1 ? "s" : ""}
          </p>
          {canDrive && (
            <Button className="w-full h-11 text-base" onClick={() => submit()} disabled={claim.isPending}>
              {claim.isPending ? "Pegando..." : `Pegar ${picked.length} para entregar`}
            </Button>
          )}
          {canManage && (
            <div className="flex gap-2">
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Atribuir a..." />
                </SelectTrigger>
                <SelectContent>
                  {(drivers ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!assignTo || claim.isPending}
                onClick={() => submit(assignTo)}
              >
                Atribuir
              </Button>
            </div>
          )}
          {canManage && (drivers ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ainda não há entregadores cadastrados nesta filial (Equipe → função Entregador) ou que já tenham pego pedidos.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function QueueCard({
  stop,
  limit,
  checked,
  onToggle,
  selectable,
}: {
  stop: DeliveryStop;
  limit: number;
  checked: boolean;
  onToggle: () => void;
  selectable: boolean;
}) {
  return (
    <Card
      className={cn("transition-colors", checked && "border-primary bg-primary/5", selectable && "cursor-pointer")}
      onClick={selectable ? onToggle : undefined}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {selectable && (
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
              )}
            >
              {checked && <Check className="h-4 w-4" />}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold leading-tight">
                #{stop.orderNumber} · {stop.customerName || "Cliente"}
              </p>
              <WaitChip minutes={stop.waitMinutes} limit={limit} />
            </div>
            <p className="text-sm break-words">{stop.address || "Sem endereço"}</p>
            <div className="flex flex-wrap items-center gap-2">
              {stop.city && <span className="text-xs text-muted-foreground">{stop.city}</span>}
              <PaymentChip stop={stop} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Staff-only: delivery orders still being prepared, with the "Saiu / Pronto" button. */
export function WaitingSection({ orders }: { orders: DeliveryStop[] }) {
  const markReady = useMarkOrderReady();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (orders.length === 0) return null;

  const mark = async (stop: DeliveryStop) => {
    setBusyId(stop.orderId);
    try {
      await markReady.mutateAsync(stop.orderId);
      toast.success(`Pedido #${stop.orderNumber} marcado como pronto — já está na fila de retirada`);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível atualizar o pedido");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">
        Ainda no preparo <span className="text-muted-foreground font-normal">({orders.length})</span>
      </h2>
      <div className="space-y-2">
        {orders.map((o) => (
          <Card key={o.orderId}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">
                  #{o.orderNumber} · {o.customerName || "Cliente"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {o.city || o.address || "—"} · há {o.waitMinutes} min
                </p>
              </div>
              <Button size="sm" disabled={busyId === o.orderId} onClick={() => mark(o)}>
                Saiu / Pronto
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
