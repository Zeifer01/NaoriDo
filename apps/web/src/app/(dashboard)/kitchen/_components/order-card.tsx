"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@restai/ui/components/button";
import {
  CheckCircle,
  ArrowRight,
  UtensilsCrossed,
  Timer,
  ChevronDown,
  ChevronUp,
  Printer,
  Copy,
  MapPin,
  CreditCard,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyOrderTicket, orderToTicketInput } from "@/lib/order-ticket";
import { getActiveCurrency } from "@/stores/currency-store";
import { deliveryPaymentLabel, getSimplifiedReadyLabel } from "@restai/config";
import { getTimeDiff, getTimeUrgency } from "./kitchen-context";
import { useFeatures } from "@/hooks/use-features";
import { useOrderTicketBranchLabel } from "@/hooks/use-settings";
import { OrderNotifyActions } from "./order-notify-actions";

const VISIBLE_ITEMS_LIMIT = 4;

function ItemRow({
  item,
  columnStatus,
  isUpdatingItem,
  onItemReady,
}: {
  item: any;
  columnStatus: "pending" | "preparing" | "ready";
  isUpdatingItem: boolean;
  onItemReady: (itemId: string) => void;
}) {
  const isItemReady = item.status === "ready";
  const modifiers: Array<{
    name: string;
    is_outside_cup?: boolean;
    outsideCup?: boolean;
  }> = item.modifiers || [];
  const modCounts = new Map<string, number>();
  for (const m of modifiers) {
    const outside = m.is_outside_cup === true || m.outsideCup === true;
    const label = outside ? `${m.name} (fora do copo)` : m.name;
    modCounts.set(label, (modCounts.get(label) || 0) + Math.max(1, item.quantity || 1));
  }

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 px-3 py-2 rounded-md text-sm",
        isItemReady
          ? "bg-green-500/10 text-muted-foreground"
          : "bg-muted/50"
      )}
    >
      <div className="flex-1 min-w-0">
        <span className={cn("leading-tight", isItemReady && "line-through text-muted-foreground")}>
          <span className="font-bold text-foreground mr-1">{item.quantity}x</span>
          <span className="font-medium">{item.name}</span>
        </span>
        {modCounts.size > 0 && (
          <ul className="mt-1 space-y-0.5">
            {[...modCounts.entries()].map(([name, qty]) => (
              <li key={name} className="text-xs text-muted-foreground leading-snug">
                · {qty > 1 ? `${name} ×${qty}` : name}
              </li>
            ))}
          </ul>
        )}
        {item.notes && (
          <p className="text-xs mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium leading-tight">
            {item.notes}
          </p>
        )}
      </div>
      {columnStatus === "preparing" && (
        isItemReady ? (
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
        ) : (
          <button
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 px-2 py-1 rounded transition-colors shrink-0"
            disabled={isUpdatingItem}
            onClick={() => onItemReady(item.id)}
          >
            Pronto
          </button>
        )
      )}
    </div>
  );
}

function ElapsedTimerBadge({ createdAt }: { createdAt: string }) {
  const urgency = getTimeUrgency(createdAt);
  const timeStr = getTimeDiff(createdAt);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold tabular-nums text-lg leading-none",
        urgency === "urgent"
          ? "bg-red-500 text-white animate-pulse"
          : urgency === "warning"
            ? "bg-amber-500 text-white"
            : "bg-green-600 text-white"
      )}
    >
      <Timer className="h-5 w-5" />
      {timeStr}
    </div>
  );
}

export function KitchenOrderCard({
  order,
  columnStatus,
  onAdvance,
  onItemReady,
  onPrint,
  isAdvancing,
  isUpdatingItem,
  isNew,
  dragHandle,
}: {
  order: any;
  columnStatus: "pending" | "preparing" | "ready";
  onAdvance: (orderId: string, status: string) => void;
  onItemReady: (itemId: string) => void;
  onPrint: (order: any) => void;
  isAdvancing: boolean;
  isUpdatingItem: boolean;
  isNew?: boolean;
  dragHandle?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { kitchenLabel, simplifiedOrderStatus } = useFeatures();
  const branchLabel = useOrderTicketBranchLabel();
  const orderType = order.type || order.order_type;
  const orderNum = order.orderNumber || order.order_number || order.id;
  const tableName = order.tableName || order.table_name || "";
  const createdAt = order.createdAt || order.created_at || "";
  const items: any[] = order.items || [];
  const urgency = createdAt ? getTimeUrgency(createdAt) : "normal";
  const customerName = order.customerName || order.customer_name || "";
  const address = order.deliveryAddress || order.delivery_address || "";
  const reference = order.deliveryReference || order.delivery_reference || "";
  const paymentMethod = order.paymentMethod || order.payment_method || "";
  const clockTime = createdAt
    ? new Date(createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  const hasOverflow = items.length > VISIBLE_ITEMS_LIMIT;
  const visibleItems = expanded ? items : items.slice(0, VISIBLE_ITEMS_LIMIT);
  const hiddenCount = items.length - VISIBLE_ITEMS_LIMIT;

  const borderColor =
    columnStatus === "pending"
      ? urgency === "urgent"
        ? "border-red-500"
        : urgency === "warning"
          ? "border-amber-500"
          : "border-amber-400/60"
      : columnStatus === "preparing"
        ? "border-blue-500"
        : "border-green-500";

  const headerBg =
    columnStatus === "pending"
      ? urgency === "urgent"
        ? "bg-red-500"
        : "bg-amber-500"
      : columnStatus === "preparing"
        ? "bg-blue-500"
        : "bg-green-500";

  return (
    <div
      className={cn(
        "rounded-xl border-2 overflow-hidden bg-card shadow-sm transition-all",
        borderColor,
        urgency === "urgent" && columnStatus === "pending" && "ring-2 ring-red-500/30",
        isNew && "animate-kitchen-flash"
      )}
    >
      {/* Card Header */}
      <div className={cn("px-4 py-3 flex items-center justify-between", headerBg)}>
        <div className="flex items-center gap-3 min-w-0">
          {dragHandle}
          <span className="text-white font-black text-2xl md:text-3xl tracking-tight">
            #{orderNum}
          </span>
          {tableName && (
            <span className="text-white/90 text-base font-semibold bg-white/20 px-2 py-0.5 rounded">
              {tableName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-white/70 hover:text-white p-2 rounded-lg transition-colors"
            onClick={() => onPrint(order)}
            title="Imprimir Comprovante"
          >
            <Printer className="h-5 w-5" />
          </button>
          {createdAt && <ElapsedTimerBadge createdAt={createdAt} />}
        </div>
      </div>

      {/* Items List */}
      <div className="p-2 space-y-1">
        {visibleItems.map((item: any) => (
          <ItemRow
            key={item.id}
            item={item}
            columnStatus={columnStatus}
            isUpdatingItem={isUpdatingItem}
            onItemReady={onItemReady}
          />
        ))}
        {hasOverflow && (
          <button
            className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Mostrar menos
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                + {hiddenCount} mais...
              </>
            )}
          </button>
        )}
      </div>

      {/* Customer / address / payment */}
      {(customerName || address || paymentMethod || clockTime) && (
        <div className="mx-2 mb-2 px-3 py-2 rounded-md bg-muted/40 space-y-1 text-xs text-muted-foreground">
          {customerName && (
            <p className="flex items-start gap-1.5 text-foreground font-medium">
              <User className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                {customerName}
                {clockTime ? (
                  <span className="font-normal text-muted-foreground"> · {clockTime}</span>
                ) : null}
              </span>
            </p>
          )}
          {!customerName && clockTime && (
            <p className="text-muted-foreground">{clockTime}</p>
          )}
          {address && (
            <p className="flex items-start gap-1.5">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                {address}
                {reference ? ` (${reference})` : ""}
              </span>
            </p>
          )}
          {paymentMethod && (
            <p className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 shrink-0" />
              {deliveryPaymentLabel(paymentMethod as any) || paymentMethod}
            </p>
          )}
          {(order.delivery_fee_status === "pending" ||
            order.deliveryFeeStatus === "pending") && (
            <p className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Frete a confirmar
              {typeof (order.delivery_fee ?? order.deliveryFee) === "number"
                ? ` · ${(Number(order.delivery_fee ?? order.deliveryFee) / 100).toFixed(2)}`
                : ""}
            </p>
          )}
        </div>
      )}

      {/* Order-level notes */}
      {order.notes && (
        <div className="mx-2 mb-2 px-3 py-2 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-sm font-medium">
          {order.notes}
        </div>
      )}

      {/* Action Button - touch friendly */}
      <div className="p-2 pt-0 space-y-2">
        {columnStatus === "pending" && (
          <Button
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold h-12 text-base"
            disabled={isAdvancing}
            onClick={() => onAdvance(order.id, "pending")}
          >
            {simplifiedOrderStatus ? "Em preparo" : "Preparar"}
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        )}
        {columnStatus === "preparing" && (
          <Button
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold h-12 text-base"
            disabled={isAdvancing}
            onClick={() => onAdvance(order.id, order.status || "preparing")}
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            {simplifiedOrderStatus
              ? getSimplifiedReadyLabel(orderType)
              : "Pronto"}
          </Button>
        )}
        {columnStatus === "ready" && (
          <Button
            variant="outline"
            className="w-full border-gray-400 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 font-bold h-12 text-base"
            disabled={isAdvancing}
            onClick={() => onAdvance(order.id, "ready")}
          >
            <UtensilsCrossed className="h-5 w-5 mr-2" />
            {simplifiedOrderStatus ? "Concluir" : "Entregue"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full h-9 text-xs"
          onClick={async () => {
            try {
              await copyOrderTicket(
                orderToTicketInput(order, {
                  headerLabel: kitchenLabel,
                  branchLabel,
                  currency: getActiveCurrency(),
                }),
              );
              toast.success("Comanda copiada");
            } catch {
              toast.error("Não foi possível copiar");
            }
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copiar comanda
        </Button>
        <OrderNotifyActions
          orderId={order.id}
          columnStatus={columnStatus}
          hasPhone={Boolean(order.delivery_phone || order.deliveryPhone)}
          feePending={
            order.delivery_fee_status === "pending" ||
            order.deliveryFeeStatus === "pending"
          }
        />
      </div>
    </div>
  );
}
