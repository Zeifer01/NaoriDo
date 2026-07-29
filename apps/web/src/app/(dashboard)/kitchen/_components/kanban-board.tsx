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
import { Clock, ChefHat, CheckCircle, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnHeader } from "./column-header";
import { KitchenOrderCard } from "./order-card";
import {
  getKitchenColumn,
  useKitchenContext,
  type KitchenColumnStatus,
} from "./kitchen-context";
import { useFeatures } from "@/hooks/use-features";

type TabKey = KitchenColumnStatus;

const COLUMN_ICONS: Record<
  TabKey,
  { icon: React.ComponentType<{ className?: string }>; emptyLabel: string }
> = {
  pending: { icon: Clock, emptyLabel: "Sem pedidos pendentes" },
  preparing: { icon: ChefHat, emptyLabel: "Sem pedidos em preparação" },
  ready: { icon: CheckCircle, emptyLabel: "Sem pedidos prontos" },
};

const COLUMN_DROP_IDS: Record<TabKey, string> = {
  pending: "column-pending",
  preparing: "column-preparing",
  ready: "column-ready",
};

function resolveDropColumn(
  overId: string | number,
  ordersById: Map<string, any>,
): TabKey | null {
  const id = String(overId);
  if (id === COLUMN_DROP_IDS.pending) return "pending";
  if (id === COLUMN_DROP_IDS.preparing) return "preparing";
  if (id === COLUMN_DROP_IDS.ready) return "ready";
  const order = ordersById.get(id);
  if (!order) return null;
  return getKitchenColumn(order.status);
}

function DraggableOrderCard({
  order,
  status,
  isNew,
  isDragOverlay = false,
}: {
  order: any;
  status: TabKey;
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

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { columnStatus: status, order },
    disabled: isDragOverlay,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const dragHandle = !isDragOverlay ? (
    <button
      type="button"
      className="touch-none cursor-grab active:cursor-grabbing p-1 rounded-md bg-white/20 text-white hover:bg-white/30 shrink-0"
      aria-label="Arrastar comanda"
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-5 w-5" />
    </button>
  ) : null;

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={cn(
        isDragging && !isDragOverlay && "opacity-40",
        isDragOverlay && "shadow-xl ring-2 ring-primary/40 rounded-xl",
      )}
    >
      <KitchenOrderCard
        order={order}
        columnStatus={status}
        onAdvance={advanceOrder}
        onPrint={handlePrint}
        onItemReady={
          status === "preparing" ? (itemId) => handleItemReady(itemId) : () => {}
        }
        isAdvancing={isAdvancing}
        isUpdatingItem={isUpdatingItem}
        isNew={isNew}
        dragHandle={dragHandle}
      />
    </div>
  );
}

function KanbanColumn({ status }: { status: TabKey }) {
  const { columns, newOrderIds } = useKitchenContext();
  const { kitchenColumnLabels } = useFeatures();
  const config = COLUMN_ICONS[status];
  const label = kitchenColumnLabels[status];
  const columnOrders = columns[status];
  const { setNodeRef, isOver } = useDroppable({
    id: COLUMN_DROP_IDS[status],
    data: { columnStatus: status },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 min-h-0 overflow-y-auto pr-1 rounded-lg transition-colors",
        isOver && "ring-2 ring-primary/40 bg-primary/5",
      )}
      style={{ maxHeight: "calc(100vh - 10rem)" }}
    >
      <ColumnHeader
        icon={config.icon}
        label={label}
        count={columnOrders.length}
        variant={status}
        pulse={status === "pending" && columnOrders.length > 0}
      />
      {columnOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground min-h-[120px]">
          <config.icon className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{isOver ? "Solte aqui" : config.emptyLabel}</p>
        </div>
      ) : (
        columnOrders.map((order: any) => (
          <DraggableOrderCard
            key={order.id}
            order={order}
            status={status}
            isNew={newOrderIds.has(order.id)}
          />
        ))
      )}
    </div>
  );
}

export function KanbanBoard() {
  const { orders, moveOrderToColumn } = useKitchenContext();
  const [activeOrder, setActiveOrder] = useState<any | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const ordersById = useMemo(() => {
    const map = new Map<string, any>();
    for (const o of orders) map.set(o.id, o);
    return map;
  }, [orders]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveOrder(ordersById.get(String(event.active.id)) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrder(null);
    const { active, over } = event;
    if (!over) return;
    const target = resolveDropColumn(over.id, ordersById);
    if (!target) return;
    moveOrderToColumn(String(active.id), target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveOrder(null)}
    >
      <div className="hidden md:grid md:grid-cols-3 gap-3 flex-1 min-h-0">
        <KanbanColumn status="pending" />
        <KanbanColumn status="preparing" />
        <KanbanColumn status="ready" />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeOrder ? (
          <div className="w-[min(100vw-2rem,360px)]">
            <DraggableOrderCard
              order={activeOrder}
              status={getKitchenColumn(activeOrder.status)}
              isNew={false}
              isDragOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
