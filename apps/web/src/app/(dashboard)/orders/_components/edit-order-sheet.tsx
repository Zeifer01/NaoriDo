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
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  useOrder,
  useAddOrderItem,
  useUpdateOrderItemDetails,
  useRemoveOrderItem,
  useUpdateOrderDelivery,
} from "@/hooks/use-orders";
import { useCategories, useMenuItems } from "@/hooks/use-menu";
import { useFeatures } from "@/hooks/use-features";
import { apiFetch } from "@/lib/fetcher";
import { useMutation } from "@tanstack/react-query";

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
              Pedido {orderData ? `#${orderData.order_number}` : ""}
            </SheetTitle>
            <SheetDescription>
              Detalhes, itens e pagamento do pedido.
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

  const orderTypeLabel: Record<string, string> = {
    dine_in: "Mesa",
    takeout: "Retirada",
    delivery: "Entrega",
  };

  const paymentMethodLabel: Record<string, string> = {
    cash: "Dinheiro",
    card: "Cartão",
    pix: "PIX",
    zelle: "Zelle",
    venmo: "Venmo",
    cashapp: "Cash App",
    transfer: "Transferência",
    other: "Outro",
  };

  const hasInfo =
    order.customer_name ||
    order.delivery_phone ||
    order.delivery_address ||
    order.notes ||
    order.type;

  return (
    <div className="mt-4 space-y-4">
      {hasInfo && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
          {order.type && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium text-foreground">
                {orderTypeLabel[order.type] ?? order.type}
              </span>
              {order.table_number != null && (
                <span>· Mesa {order.table_number}</span>
              )}
            </div>
          )}
          {order.customer_name && (
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{order.customer_name}</span>
            </div>
          )}
          {order.delivery_phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{order.delivery_phone}</span>
            </div>
          )}
          {order.delivery_address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p>{order.delivery_address}</p>
                {order.delivery_reference && (
                  <p className="text-xs text-muted-foreground">{order.delivery_reference}</p>
                )}
                {order.delivery_city && (
                  <p className="text-xs text-muted-foreground">{order.delivery_city}</p>
                )}
              </div>
            </div>
          )}
          {order.type === "delivery" && order.delivery_fee_status === "pending" && (
            <Badge
              variant="outline"
              className="border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            >
              Frete a confirmar
            </Badge>
          )}
          {order.payment_method && (
            <div className="flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{paymentMethodLabel[order.payment_method] ?? order.payment_method}</span>
            </div>
          )}
          {order.notes && (
            <div className="flex items-start gap-2 pt-1 border-t">
              <span className="text-muted-foreground text-xs">Obs:</span>
              <span className="text-xs italic">{order.notes}</span>
            </div>
          )}
        </div>
      )}

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

      {!nonEditable && order.type === "delivery" && (
        <DeliveryFeeEditor
          key={`${order.id}-${order.updated_at}-${order.delivery_fee}-${order.delivery_fee_status}`}
          order={order}
        />
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
        {(order.delivery_fee > 0 || order.type === "delivery") && (
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center gap-2">
              Entrega
              {order.delivery_fee_status === "pending" && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-500/50 text-amber-700"
                >
                  a confirmar
                </Badge>
              )}
            </span>
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

function DeliveryFeeEditor({ order }: { order: any }) {
  const updateDelivery = useUpdateOrderDelivery();
  const { has } = useFeatures();
  const [address, setAddress] = useState(order.delivery_address || "");
  const [reference, setReference] = useState(order.delivery_reference || "");
  const [city, setCity] = useState(order.delivery_city || "");
  const [feeDollars, setFeeDollars] = useState(
    ((order.delivery_fee ?? 0) / 100).toFixed(2),
  );

  const notifyFee = useMutation({
    mutationFn: () =>
      apiFetch(`/api/kitchen/orders/${order.id}/notify`, {
        method: "POST",
        body: JSON.stringify({
          target: "customer",
          templateKey: "delivery_fee_updated",
        }),
      }),
  });

  const save = async () => {
    const feeCents = Math.round(Number(feeDollars.replace(",", ".")) * 100);
    if (!Number.isFinite(feeCents) || feeCents < 0) {
      toast.error("Frete inválido");
      return;
    }
    if (!address.trim() || address.trim().length < 5) {
      toast.error("Informe o endereço de entrega");
      return;
    }
    try {
      await updateDelivery.mutateAsync({
        orderId: order.id,
        deliveryAddress: address.trim(),
        deliveryReference: reference.trim() || null,
        deliveryCity: city.trim() || null,
        deliveryFeeCents: feeCents,
        confirmFee: true,
      });
      toast.success("Endereço / frete atualizados");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    }
  };

  const sendNotify = async () => {
    try {
      await notifyFee.mutateAsync();
      toast.success("Cliente notificado sobre o frete");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao notificar");
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Endereço e frete</p>
        {order.delivery_fee_status === "pending" && (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          >
            Frete a confirmar
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Endereço</label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Complemento</label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Cidade</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Frete (valor)</label>
        <Input
          inputMode="decimal"
          value={feeDollars}
          onChange={(e) => setFeeDollars(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={updateDelivery.isPending}
          onClick={() => void save()}
        >
          {updateDelivery.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : null}
          Salvar e confirmar frete
        </Button>
        {has("whatsapp") && order.delivery_phone && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={notifyFee.isPending}
            onClick={() => void sendNotify()}
          >
            <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
            Notificar frete
          </Button>
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
