"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge } from "@restai/ui/components/badge";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import {
  ArrowRight,
  CheckCircle,
  Copy,
  GripVertical,
  Printer,
  Search,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyOrderTicket, orderToTicketInput } from "@/lib/order-ticket";
import { deliveryPaymentLabel } from "@restai/config";
import {
  getKitchenColumn,
  getMinutesDiff,
  getTimeDiff,
  getTimeUrgency,
  useKitchenContext,
  type KitchenColumnStatus,
} from "./kitchen-context";
import { useFeatures } from "@/hooks/use-features";

type TypeFilter = "all" | "dine_in" | "takeout" | "delivery";

const TYPE_LABEL: Record<string, string> = {
  dine_in: "Mesa",
  takeout: "Retirada",
  delivery: "Delivery",
};

const COLUMN_DROP_IDS: Record<KitchenColumnStatus, string> = {
  pending: "column-pending",
  preparing: "column-preparing",
  ready: "column-ready",
};

function formatModifierLines(mods: Array<{ name: string }> | undefined): string[] {
  if (!mods?.length) return [];
  const counts = new Map<string, number>();
  for (const m of mods) {
    counts.set(m.name, (counts.get(m.name) || 0) + 1);
  }
  return [...counts.entries()].map(([name, qty]) =>
    qty > 1 ? `· ${name} ×${qty}` : `· ${name}`,
  );
}

function resolveDropColumn(
  overId: string | number,
  ordersById: Map<string, any>,
): KitchenColumnStatus | null {
  const id = String(overId);
  if (id === COLUMN_DROP_IDS.pending) return "pending";
  if (id === COLUMN_DROP_IDS.preparing) return "preparing";
  if (id === COLUMN_DROP_IDS.ready) return "ready";
  const order = ordersById.get(id);
  if (!order) return null;
  return getKitchenColumn(order.status);
}

function CompactCard({
  order,
  columnStatus,
  isNew,
  isDragOverlay = false,
}: {
  order: any;
  columnStatus: KitchenColumnStatus;
  isNew: boolean;
  isDragOverlay?: boolean;
}) {
  const {
    advanceOrder,
    handleItemReady,
    handlePrint,
    isAdvancing,
    isUpdatingItem,
  } = useKitchenContext();
  const { kitchenLabel } = useFeatures();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { columnStatus, order },
    disabled: isDragOverlay,
  });

  const createdAt = order.created_at || order.createdAt;
  const urgency = getTimeUrgency(createdAt);
  const orderNumber = order.order_number || order.orderNumber;
  const tableName = order.table_name || order.tableName;
  const customerName = order.customer_name || order.customerName;
  const address = order.delivery_address || order.deliveryAddress;
  const reference = order.delivery_reference || order.deliveryReference;
  const paymentMethod = order.payment_method || order.paymentMethod;
  const type = order.type || "dine_in";
  const items: any[] = order.items || [];
  const minutes = getMinutesDiff(createdAt);
  const clockTime = createdAt
    ? new Date(createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={cn(
        "rounded-lg border bg-card overflow-hidden",
        isNew && "animate-kitchen-flash",
        urgency === "urgent" && "border-red-500 border-2",
        urgency === "warning" && "border-amber-400",
        isDragging && !isDragOverlay && "opacity-40",
        isDragOverlay && "shadow-xl ring-2 ring-primary/40",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-2.5 py-1.5 text-white",
          columnStatus === "pending" && "bg-amber-600",
          columnStatus === "preparing" && "bg-blue-600",
          columnStatus === "ready" && "bg-emerald-600",
        )}
      >
        <div className="min-w-0 flex items-center gap-2">
          {!isDragOverlay && (
            <button
              type="button"
              className="touch-none cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-white/20 shrink-0"
              aria-label="Arrastar comanda"
              {...listeners}
              {...attributes}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span className="font-black text-lg leading-none">#{orderNumber}</span>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-white/20 text-white border-0">
            {TYPE_LABEL[type] ?? type}
          </Badge>
          {(tableName || customerName) && (
            <span className="text-xs truncate opacity-90">
              {tableName || customerName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-xs font-bold px-1.5 py-0.5 rounded",
              urgency === "urgent"
                ? "bg-red-700"
                : urgency === "warning"
                  ? "bg-amber-700"
                  : "bg-black/20",
            )}
          >
            <Timer className="h-3 w-3" />
            {getTimeDiff(createdAt)}
          </span>
          <button
            type="button"
            className="p-1 rounded hover:bg-white/20"
            onClick={() => handlePrint(order)}
            aria-label="Imprimir"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-2.5 py-1.5 space-y-1">
        {(customerName || clockTime) && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {customerName}
            {customerName && clockTime ? " · " : ""}
            {clockTime}
          </p>
        )}
        {address && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {address}
            {reference ? ` (${reference})` : ""}
          </p>
        )}
        {paymentMethod && (
          <p className="text-[11px] font-medium text-foreground/80">
            {deliveryPaymentLabel(paymentMethod as any) || paymentMethod}
          </p>
        )}

        {items.slice(0, 6).map((item: any) => {
          const modLines = formatModifierLines(item.modifiers);
          return (
            <div key={item.id} className="space-y-0.5">
              <div className="flex items-start justify-between gap-2 text-sm leading-tight">
                <span className={cn(item.status === "ready" && "line-through text-muted-foreground")}>
                  <span className="font-bold mr-1">{item.quantity}x</span>
                  {item.name}
                </span>
                {columnStatus === "preparing" && item.status !== "ready" && (
                  <button
                    type="button"
                    className="text-[10px] font-bold text-blue-600 shrink-0"
                    disabled={isUpdatingItem}
                    onClick={() => handleItemReady(item.id)}
                  >
                    OK
                  </button>
                )}
                {columnStatus === "preparing" && item.status === "ready" && (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                )}
              </div>
              {modLines.map((line) => (
                <p key={line} className="text-[11px] text-muted-foreground pl-3 leading-snug">
                  {line}
                </p>
              ))}
            </div>
          );
        })}
        {items.length > 6 && (
          <p className="text-[10px] text-muted-foreground">+{items.length - 6} itens</p>
        )}
        {order.notes && (
          <p className="text-[11px] text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 mt-1">
            {order.notes}
          </p>
        )}
      </div>

      {!isDragOverlay && (
        <div className="px-2.5 pb-2 space-y-1">
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            disabled={isAdvancing}
            onClick={() =>
              advanceOrder(order.id, order.status === "confirmed" ? "pending" : order.status)
            }
          >
            {columnStatus === "pending" && "Preparar"}
            {columnStatus === "preparing" && "Pronto"}
            {columnStatus === "ready" && "Entregue"}
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-7 text-[11px]"
            onClick={async () => {
              try {
                await copyOrderTicket(
                  orderToTicketInput(order, { headerLabel: kitchenLabel }),
                );
                toast.success("Comanda copiada");
              } catch {
                toast.error("Não foi possível copiar");
              }
            }}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copiar
          </Button>
          {minutes >= 15 && (
            <p className="text-[10px] text-center text-red-600 font-semibold mt-1">
              Atrasado · {minutes} min
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DenseColumn({
  title,
  status,
  orders,
  newOrderIds,
  accent,
}: {
  title: string;
  status: KitchenColumnStatus;
  orders: any[];
  newOrderIds: Set<string>;
  accent: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: COLUMN_DROP_IDS[status],
    data: { columnStatus: status },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col min-h-0 rounded-lg border bg-muted/20 transition-colors",
        isOver && "ring-2 ring-primary/50 bg-primary/5",
      )}
    >
      <div className={cn("flex items-center justify-between px-3 py-2 border-b sticky top-0 z-10 bg-background/95", accent)}>
        <h2 className="text-sm font-bold">{title}</h2>
        <Badge variant="secondary" className="tabular-nums text-xs">
          {orders.length}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {orders.map((order) => (
          <CompactCard
            key={order.id}
            order={order}
            columnStatus={status}
            isNew={newOrderIds.has(order.id)}
          />
        ))}
        {orders.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            {isOver ? "Solte aqui" : "Vazio"}
          </p>
        )}
      </div>
    </div>
  );
}

export function KitchenV2Board() {
  const { columns, newOrderIds, orders, moveOrderToColumn } = useKitchenContext();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [onlyLate, setOnlyLate] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const filterFn = (list: any[]) =>
    list.filter((o) => {
      if (typeFilter !== "all" && (o.type || "dine_in") !== typeFilter) return false;
      if (onlyLate && getMinutesDiff(o.created_at || o.createdAt) < 15) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = [
          o.order_number,
          o.orderNumber,
          o.customer_name,
          o.customerName,
          o.table_name,
          o.tableName,
          ...(o.items || []).map((i: any) => i.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

  const pending = useMemo(() => filterFn(columns.pending), [columns.pending, query, typeFilter, onlyLate]);
  const preparing = useMemo(() => filterFn(columns.preparing), [columns.preparing, query, typeFilter, onlyLate]);
  const ready = useMemo(() => filterFn(columns.ready), [columns.ready, query, typeFilter, onlyLate]);

  const ordersById = useMemo(() => {
    const map = new Map<string, any>();
    for (const o of orders) map.set(o.id, o);
    return map;
  }, [orders]);

  const lateCount = orders.filter((o) => getMinutesDiff(o.created_at || o.createdAt) >= 15).length;

  const handleDragStart = (event: DragStartEvent) => {
    const order = ordersById.get(String(event.active.id));
    setActiveOrder(order ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrder(null);
    const { active, over } = event;
    if (!over) return;
    const target = resolveDropColumn(over.id, ordersById);
    if (!target) return;
    moveOrderToColumn(String(active.id), target);
  };

  const handleDragCancel = () => setActiveOrder(null);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar #pedido, cliente, item…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {(["all", "dine_in", "takeout", "delivery"] as TypeFilter[]).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={typeFilter === t ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setTypeFilter(t)}
          >
            {t === "all" ? "Todos" : TYPE_LABEL[t]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={onlyLate ? "destructive" : "outline"}
          className="h-8 text-xs"
          onClick={() => setOnlyLate((v) => !v)}
        >
          Atrasados{lateCount > 0 ? ` (${lateCount})` : ""}
        </Button>
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          Arraste pelo ícone ⋮⋮ entre as colunas
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1 min-h-0">
          <DenseColumn
            title="Pendentes"
            status="pending"
            orders={pending}
            newOrderIds={newOrderIds}
            accent="bg-amber-50 dark:bg-amber-950/30"
          />
          <DenseColumn
            title="Preparando"
            status="preparing"
            orders={preparing}
            newOrderIds={newOrderIds}
            accent="bg-blue-50 dark:bg-blue-950/30"
          />
          <DenseColumn
            title="Prontos"
            status="ready"
            orders={ready}
            newOrderIds={newOrderIds}
            accent="bg-emerald-50 dark:bg-emerald-950/30"
          />
        </div>

        <DragOverlay dropAnimation={null}>
          {activeOrder ? (
            <div className="w-[min(100vw-2rem,320px)]">
              <CompactCard
                order={activeOrder}
                columnStatus={getKitchenColumn(activeOrder.status)}
                isNew={false}
                isDragOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
