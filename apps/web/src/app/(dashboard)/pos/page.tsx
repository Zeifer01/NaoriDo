"use client";

import { useState, useCallback } from "react";
import { useCategories, useMenuItems } from "@/hooks/use-menu";
import { useCreateOrder } from "@/hooks/use-orders";
import { toast } from "sonner";
import { ProductGrid } from "./_components/product-grid";
import {
  CartSidebar,
  type PosCustomerSuggestion,
  type PosOrderType,
} from "./_components/cart-sidebar";
import { ModifierDialog, type CartModifier } from "./_components/modifier-dialog";
import { SuccessDialog } from "./_components/success-dialog";
import { PosBarcodeScanInput } from "./_components/barcode-scan-input";
import { buildCashChangeNote, resolveOrderTicketBranchLabel } from "@/lib/order-ticket";
import type { OrderTicketInput } from "@/lib/order-ticket";
import { useCurrencyStore } from "@/stores/currency-store";
import { useBranchSettings } from "@/hooks/use-settings";
import { useFeatures } from "@/hooks/use-features";
import { appendCityToAddress, getDeliveryFeeCents, calcItemTotalCents, calcSequentialFreeChargeCents } from "@restai/config";

// Loyalty sticker card (Açaí House): cup free + the first 3 complementos
// added (in that order) are free — the 4th onward costs its real price,
// even if pricier. Mirrors apps/api/src/services/order.service.ts.
const LOYALTY_FREE_COMPLEMENTOS = 3;

function loyaltyModifiersChargeCents(modifiers: CartModifier[]): number {
  const priced = modifiers.map((m) => ({
    id: m.modifierId,
    groupId: "",
    price: m.price,
    outsideCup: m.outsideCup,
  }));
  return calcSequentialFreeChargeCents(priced, LOYALTY_FREE_COMPLEMENTOS);
}

export interface PosCartItem {
  lineId: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  promoQuantity: number | null;
  promoPriceCents: number | null;
  quantity: number;
  notes?: string;
  modifiers: CartModifier[];
  /** Manual loyalty sticker-card redemption (Açaí House) — zeroes this line. */
  loyaltyDiscount?: boolean;
}

let lineCounter = 0;
function nextLineId() {
  return `line-${++lineCounter}-${Date.now()}`;
}

function formatCustomerAddress(c: PosCustomerSuggestion): string {
  const parts = [c.address, c.neighborhood, c.city].filter(Boolean);
  return parts.join(", ");
}

export default function PosPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
  const [needsCashChange, setNeedsCashChange] = useState(false);
  const [cashChangeFor, setCashChangeFor] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<PosOrderType>("delivery");
  const [deliveryCity, setDeliveryCity] = useState<string | null>(null);
  const [deliveryFeeCents, setDeliveryFeeCents] = useState<number | null>(null);
  const [deliveryFeeStatus, setDeliveryFeeStatus] = useState<
    "confirmed" | "pending" | null
  >(null);
  const [successDialog, setSuccessDialog] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState("");
  const [lastTicket, setLastTicket] = useState<OrderTicketInput | null>(null);

  const [modDialogItem, setModDialogItem] = useState<any>(null);
  const [modDialogOpen, setModDialogOpen] = useState(false);
  const { data: branchSettings } = useBranchSettings();
  const branchLabel = resolveOrderTicketBranchLabel(
    (branchSettings as any)?.name,
    (branchSettings as any)?.settings,
  );

  const { data: categories } = useCategories();
  const { data: menuItems, isLoading: itemsLoading } = useMenuItems(selectedCategory || undefined);
  const createOrder = useCreateOrder();
  const currency = useCurrencyStore((s) => s.currency);
  const { posBarcodes, loyaltyStickerCard } = useFeatures();

  const allItems: any[] = menuItems ?? [];

  const resetCustomerFields = () => {
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setCustomerNotes("");
    setSelectedCustomerId(null);
    setOrderNotes("");
    setPaymentMethod("");
    setManualDiscount("");
    setNeedsCashChange(false);
    setCashChangeFor("");
    setDeliveryCity(null);
    setDeliveryFeeCents(null);
    setDeliveryFeeStatus(null);
  };

  const handleSelectCustomer = (c: PosCustomerSuggestion) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.name || "");
    setCustomerPhone(c.phone || "");
    setDeliveryAddress(formatCustomerAddress(c));
    setCustomerNotes(c.notes || "");
  };

  const handleItemClick = useCallback((item: any) => {
    setModDialogItem(item);
    setModDialogOpen(true);
  }, []);

  const handleAddFromDialog = useCallback(
    (item: any, qty: number, mods: CartModifier[], notes: string) => {
      // Customized cups: one cart line per unit (same free-slot rules as storefront)
      if (mods.length > 0) {
        setCart((prev) => [
          ...prev,
          ...Array.from({ length: qty }, () => ({
            lineId: nextLineId(),
            menuItemId: item.id,
            name: item.name,
            imageUrl: item.image_url || null,
            unitPrice: item.price,
            promoQuantity: item.promo_quantity ?? null,
            promoPriceCents: item.promo_price_cents ?? null,
            quantity: 1,
            notes: notes || undefined,
            modifiers: mods.map((m) => ({ ...m })),
          })),
        ]);
        return;
      }

      const existing = cart.find(
        (c) => c.menuItemId === item.id && c.modifiers.length === 0,
      );
      if (existing) {
        setCart((prev) =>
          prev.map((c) =>
            c.lineId === existing.lineId ? { ...c, quantity: c.quantity + qty } : c,
          ),
        );
        return;
      }

      setCart((prev) => [
        ...prev,
        {
          lineId: nextLineId(),
          menuItemId: item.id,
          name: item.name,
          imageUrl: item.image_url || null,
          unitPrice: item.price,
          promoQuantity: item.promo_quantity ?? null,
          promoPriceCents: item.promo_price_cents ?? null,
          quantity: qty,
          notes: notes || undefined,
          modifiers: [],
        },
      ]);
    },
    [cart],
  );

  const updateCartQty = (lineId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.lineId !== lineId));
    } else {
      setCart((prev) => prev.map((c) => (c.lineId === lineId ? { ...c, quantity: qty } : c)));
    }
  };

  const removeFromCart = (lineId: string) => {
    setCart((prev) => prev.filter((c) => c.lineId !== lineId));
  };

  const toggleLoyaltyDiscount = (lineId: string) => {
    setCart((prev) =>
      prev.map((c) =>
        c.lineId === lineId ? { ...c, loyaltyDiscount: !c.loyaltyDiscount } : c,
      ),
    );
  };

  const handleCreateOrder = async () => {
    if (cart.length === 0) return;
    const name = customerName.trim();
    if (!name) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (orderType === "delivery" && deliveryAddress.trim().length < 5) {
      toast.error("Informe o endereço de entrega");
      return;
    }
    if (!paymentMethod) {
      toast.error("Selecione a forma de pagamento");
      return;
    }

    try {
      const changeForCents =
        needsCashChange && cashChangeFor.trim()
          ? Math.round(Number(cashChangeFor.replace(",", ".")) * 100)
          : null;
      const trocoNote =
        paymentMethod === "cash"
          ? buildCashChangeNote(needsCashChange, changeForCents, currency)
          : null;
      const combinedNotes = [trocoNote, orderNotes.trim()].filter(Boolean).join("\n") || undefined;

      const itemsSubtotal = cart.reduce((sum, item) => {
        if (item.loyaltyDiscount) {
          return sum + loyaltyModifiersChargeCents(item.modifiers) * item.quantity;
        }
        const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
        const baseTotal = calcItemTotalCents(
          { unitPriceCents: item.unitPrice, promoQuantity: item.promoQuantity, promoPriceCents: item.promoPriceCents },
          item.quantity,
        );
        return sum + baseTotal + modTotal * item.quantity;
      }, 0);
      const branchSettingsObj = ((branchSettings as any)?.settings ?? {}) as Record<
        string,
        unknown
      >;
      const feeCents =
        orderType === "delivery"
          ? deliveryFeeCents != null
            ? deliveryFeeCents
            : getDeliveryFeeCents(branchSettingsObj)
          : 0;
      const manualDiscountCents = Math.round(
        (Number(manualDiscount.replace(",", ".")) || 0) * 100,
      );
      const ticketTotal = Math.max(0, itemsSubtotal + feeCents - manualDiscountCents);
      const addressForOrder =
        orderType === "delivery"
          ? appendCityToAddress(deliveryAddress.trim(), deliveryCity)
          : undefined;

      const ticketPreview: OrderTicketInput = {
        orderNumber: "…",
        customerName: name,
        type: orderType,
        deliveryPhone: customerPhone || undefined,
        deliveryAddress: addressForOrder,
        paymentMethod,
        notes: combinedNotes,
        createdAt: new Date().toISOString(),
        currency,
        branchLabel,
        total: ticketTotal,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          notes: item.notes,
          discount_reason: item.loyaltyDiscount ? "Fidelidade - cartão físico" : undefined,
          modifiers: item.modifiers.map((m) => ({
            name: m.name,
            outsideCup: m.outsideCup,
          })),
        })),
      };

      const result = await createOrder.mutateAsync({
        type: orderType,
        customerName: name,
        customerId: selectedCustomerId || undefined,
        deliveryPhone: customerPhone.trim() || undefined,
        deliveryAddress: addressForOrder,
        deliveryCity:
          orderType === "delivery" && deliveryCity ? deliveryCity : undefined,
        deliveryFeeCents:
          orderType === "delivery" && deliveryFeeCents !== null
            ? deliveryFeeCents
            : undefined,
        deliveryFeeStatus:
          orderType === "delivery" && deliveryFeeStatus
            ? deliveryFeeStatus
            : undefined,
        customerNotes: customerNotes.trim() || undefined,
        paymentMethod,
        manualDiscountCents: manualDiscountCents > 0 ? manualDiscountCents : undefined,
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes || undefined,
          modifiers: item.modifiers.map((m) => ({
            modifierId: m.modifierId,
            outsideCup: m.outsideCup === true,
          })),
          loyaltyDiscount: item.loyaltyDiscount === true ? true : undefined,
        })),
        notes: combinedNotes,
      });

      const orderNumber =
        result.order_number || result.orderNumber || result.order?.order_number || "";
      const resultTotal =
        result.total ?? result.order?.total ?? ticketTotal;
      setLastOrderNumber(orderNumber);
      setLastTicket({ ...ticketPreview, orderNumber, total: resultTotal });
      setCart([]);
      resetCustomerFields();
      setSuccessDialog(true);
      toast.success("Pedido criado com sucesso");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar pedido");
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {posBarcodes && (
          <PosBarcodeScanInput
            onItemFound={(item) => {
              handleItemClick(item);
            }}
          />
        )}
        <div className="min-h-0 flex-1">
          <ProductGrid
            categories={categories ?? []}
            items={allItems}
            isLoading={itemsLoading}
            search={search}
            onSearchChange={setSearch}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            cart={cart}
            onItemClick={handleItemClick}
          />
        </div>
      </div>

      <CartSidebar
        cart={cart}
        orderType={orderType}
        customerName={customerName}
        customerPhone={customerPhone}
        deliveryAddress={deliveryAddress}
        deliveryCity={deliveryCity}
        deliveryFeeCents={deliveryFeeCents}
        deliveryFeeStatus={deliveryFeeStatus}
        customerNotes={customerNotes}
        orderNotes={orderNotes}
        paymentMethod={paymentMethod}
        needsCashChange={needsCashChange}
        cashChangeFor={cashChangeFor}
        selectedCustomerId={selectedCustomerId}
        manualDiscount={manualDiscount}
        isPending={createOrder.isPending}
        onOrderTypeChange={(type) => {
          setOrderType(type);
          if (type !== "delivery") {
            setDeliveryCity(null);
            setDeliveryFeeCents(null);
            setDeliveryFeeStatus(null);
          }
        }}
        onCustomerNameChange={setCustomerName}
        onCustomerPhoneChange={setCustomerPhone}
        onDeliveryAddressChange={(addr) => {
          setDeliveryAddress(addr);
        }}
        onDeliveryFeeChange={(fee) => {
          setDeliveryCity(fee.city);
          setDeliveryFeeCents(fee.feeCents);
          setDeliveryFeeStatus(fee.feeStatus);
        }}
        onCustomerNotesChange={setCustomerNotes}
        onOrderNotesChange={setOrderNotes}
        onPaymentMethodChange={(method) => {
          setPaymentMethod(method);
          if (method !== "cash") {
            setNeedsCashChange(false);
            setCashChangeFor("");
          }
        }}
        onNeedsCashChangeChange={setNeedsCashChange}
        onCashChangeForChange={setCashChangeFor}
        onManualDiscountChange={setManualDiscount}
        onSelectCustomer={handleSelectCustomer}
        onClearSelectedCustomer={() => setSelectedCustomerId(null)}
        onUpdateQty={updateCartQty}
        onToggleLoyaltyDiscount={toggleLoyaltyDiscount}
        loyaltyStickerCard={loyaltyStickerCard}
        onRemove={removeFromCart}
        onClearCart={() => setCart([])}
        onCreateOrder={handleCreateOrder}
      />

      <SuccessDialog
        open={successDialog}
        onOpenChange={setSuccessDialog}
        orderNumber={lastOrderNumber}
        ticket={lastTicket}
      />

      <ModifierDialog
        item={modDialogItem}
        open={modDialogOpen}
        onClose={() => setModDialogOpen(false)}
        onAdd={handleAddFromDialog}
      />
    </div>
  );
}
