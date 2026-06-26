"use client";

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@restai/ui/components/sheet";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Input } from "@restai/ui/components/input";
import {
  AlertTriangle,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  useOrder,
  useAddOrderItem,
  useUpdateOrderItemDetails,
  useRemoveOrderItem,
} from "@/hooks/use-orders";
import { useCategories, useMenuItems } from "@/hooks/use-menu";

const NON_EDITABLE_STATUSES = new Set(["completed", "cancelled"]);
const POST_KITCHEN_STATUSES = new Set(["preparing", "ready", "served"]);

interface EditOrderSheetProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function EditOrderSheet({ orderId, onOpenChange }: EditOrderSheetProps) {
  const open = !!orderId;
  const { data: order, isLoading } = useOrder(orderId ?? "");
  const orderData = order as any;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto p-0"
      >
        <div className="p-6">
          <SheetHeader>
            <SheetTitle>
              Editar pedido {orderData ? `#${orderData.order_number}` : ""}
            </SheetTitle>
            <SheetDescription>
              Adicione, ajuste ou remova itens. Mudanças notificam a cozinha em
              tempo real.
            </SheetDescription>
          </SheetHeader>

          {isLoading || !orderData ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-sm">Carregando pedido...</span>
            </div>
          ) : (
            <EditOrderContent order={orderData} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EditOrderContent({ order }: { order: any }) {
  const items: any[] = order.items ?? [];
  const nonEditable = NON_EDITABLE_STATUSES.has(order.status);
  const postKitchen = POST_KITCHEN_STATUSES.has(order.status);
  const isPaid = order.payment_status === "paid";
  const isPartial = order.payment_status === "partial";

  return (
    <div className="mt-4 space-y-4">
      {nonEditable && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
          <div>
            <p className="font-medium text-destructive">
              Pedido {order.status === "completed" ? "concluído" : "cancelado"}
            </p>
            <p className="text-xs text-muted-foreground">
              Edição não é mais permitida neste estado.
            </p>
          </div>
        </div>
      )}

      {!nonEditable && postKitchen && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Pedido em &quot;{order.status}&quot;
            </p>
            <p className="text-xs text-muted-foreground">
              A cozinha já recebeu este pedido. Mudanças serão sinalizadas em tempo real.
            </p>
          </div>
        </div>
      )}

      {!nonEditable && (isPaid || isPartial) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <CreditCard className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Pedido já {isPaid ? "pago" : "parcialmente pago"}
            </p>
            <p className="text-xs text-muted-foreground">
              Pago: {formatCurrency(order.total_paid ?? 0)}. Após alterar
              itens, cobre/estorne a diferença manualmente no menu de pagamentos.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Itens do pedido</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item</p>
        ) : (
          items.map((item) => (
            <OrderItemRow
              key={item.id}
              orderId={order.id}
              item={item}
              canEdit={!nonEditable}
              canRemove={!nonEditable && items.length > 1}
            />
          ))
        )}
      </div>

      {!nonEditable && (
        <AddItemPicker orderId={order.id} branchId={order.branch_id} />
      )}

      {order.payment_method && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Pagamento preferido</span>
          <span className="font-medium">
            {order.payment_method === "cash" ? "💵 Dinheiro" :
             order.payment_method === "card" ? "💳 Cartão" :
             order.payment_method === "pix"  ? "PIX" : order.payment_method}
          </span>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(order.subtotal ?? 0)}</span>
        </div>
        {order.tax > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Impostos</span>
            <span>{formatCurrency(order.tax ?? 0)}</span>
          </div>
        )}
        {order.discount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Desconto</span>
            <span>−{formatCurrency(order.discount ?? 0)}</span>
          </div>
        )}
        {order.delivery_fee > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Entrega</span>
            <span>{formatCurrency(order.delivery_fee ?? 0)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>{formatCurrency(order.total ?? 0)}</span>
        </div>
        {(isPaid || isPartial) && (
          <div className="flex justify-between pt-1">
            <span className="text-muted-foreground">Pago</span>
            <span className="font-medium text-emerald-600">
              {formatCurrency(order.total_paid ?? 0)}
            </span>
          </div>
        )}
        {!isPaid && (order.total_paid ?? 0) !== order.total && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Diferença a cobrar</span>
            <Badge variant="outline" className="font-mono">
              {formatCurrency((order.total ?? 0) - (order.total_paid ?? 0))}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderItemRow({
  orderId,
  item,
  canEdit,
  canRemove,
}: {
  orderId: string;
  item: any;
  canEdit: boolean;
  canRemove: boolean;
}) {
  const updateMutation = useUpdateOrderItemDetails();
  const removeMutation = useRemoveOrderItem();
  const isBusy = updateMutation.isPending || removeMutation.isPending;

  const handleQty = (newQty: number) => {
    if (newQty < 1) return;
    if (newQty === item.quantity) return;
    updateMutation.mutate(
      { orderId, itemId: item.id, quantity: newQty },
      {
        onError: (err: any) => toast.error(err.message || "Erro ao atualizar"),
      },
    );
  };

  const handleRemove = () => {
    removeMutation.mutate(
      { orderId, itemId: item.id },
      {
        onSuccess: () => toast.success("Item removido"),
        onError: (err: any) => toast.error(err.message || "Erro ao remover"),
      },
    );
  };

  return (
    <div className="rounded-lg border p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(item.unit_price)} · {item.status}
        </p>
        {item.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            Obs: {item.notes}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border px-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-full"
            disabled={!canEdit || isBusy || item.quantity <= 1}
            onClick={() => handleQty(item.quantity - 1)}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-sm w-6 text-center font-medium">
            {item.quantity}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-full"
            disabled={!canEdit || isBusy}
            onClick={() => handleQty(item.quantity + 1)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        <span className="text-sm font-semibold w-20 text-right">
          {formatCurrency(item.total)}
        </span>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          disabled={!canRemove || isBusy}
          title={
            !canRemove
              ? "Não é possível remover o único item do pedido"
              : "Remover item"
          }
          onClick={handleRemove}
        >
          {removeMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

function AddItemPicker({
  orderId,
  branchId: _branchId,
}: {
  orderId: string;
  branchId: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { data: categoriesData } = useCategories();
  const { data: itemsData } = useMenuItems(selectedCategoryId ?? undefined);
  const addMutation = useAddOrderItem();
  const categories: any[] = (categoriesData as any[]) ?? [];
  const items: any[] = (itemsData as any[]) ?? [];

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      (it.name as string).toLowerCase().includes(q),
    );
  }, [items, search]);

  const handlePick = (menuItemId: string, menuItemName: string) => {
    addMutation.mutate(
      { orderId, menuItemId, quantity: 1 },
      {
        onSuccess: () => {
          toast.success(`"${menuItemName}" adicionado`);
        },
        onError: (err: any) => toast.error(err.message || "Erro ao adicionar"),
      },
    );
  };

  if (!pickerOpen) {
    return (
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setPickerOpen(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Adicionar produto
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Adicionar produto</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => {
            setPickerOpen(false);
            setSearch("");
            setSelectedCategoryId(null);
          }}
        >
          Fechar
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          variant={selectedCategoryId === null ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setSelectedCategoryId(null)}
        >
          Todas
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={selectedCategoryId === cat.id ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedCategoryId(cat.id)}
          >
            {cat.name}
          </Button>
        ))}
      </div>

      <div className="max-h-72 overflow-y-auto space-y-1">
        {filteredItems.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Nenhum produto encontrado
          </p>
        ) : (
          filteredItems.map((it) => (
            <button
              key={it.id}
              type="button"
              disabled={addMutation.isPending}
              onClick={() => handlePick(it.id, it.name)}
              className="w-full flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm transition hover:bg-accent disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{it.name}</p>
                {it.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {it.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold">
                  {formatCurrency(it.price)}
                </span>
                <Plus className="h-3 w-3 text-muted-foreground" />
              </div>
            </button>
          ))
        )}
      </div>

      {addMutation.isPending && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Adicionando...
        </p>
      )}
    </div>
  );
}
