"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Textarea } from "@restai/ui/components/textarea";
import {
  ShoppingCart,
  User,
  Plus,
  Minus,
  Trash2,
  Check,
  Loader2,
  UtensilsCrossed,
  MapPin,
  Phone,
  Bike,
  ShoppingBag,
  Heart,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useLoyaltyCustomers } from "@/hooks/use-loyalty";
import { useBranchSettings } from "@/hooks/use-settings";
import {
  parseDeliveryPaymentMethods,
  deliveryPaymentLabel,
  parseDeliveryPricing,
  getDeliveryFeeCents,
  appendCityToAddress,
  calcItemTotalCents,
  calcSequentialFreeChargeCents,
  type DeliveryPaymentMethodId,
} from "@restai/config";
import { apiFetch } from "@/lib/fetcher";
import type { PosCartItem } from "../page";

// Loyalty sticker card (Açaí House): cup free + the first 3 complementos
// added (in that order) are free — the 4th onward costs its real price,
// even if pricier. Mirrors apps/api/src/services/order.service.ts.
const LOYALTY_FREE_COMPLEMENTOS = 3;

/** Preview-only: what the modifiers on a loyalty-discounted line will actually cost. */
function loyaltyModifiersChargeCents(modifiers: PosCartItem["modifiers"]): number {
  const priced = modifiers.map((m) => ({
    id: m.modifierId,
    groupId: "",
    price: m.price,
    outsideCup: m.outsideCup,
  }));
  return calcSequentialFreeChargeCents(priced, LOYALTY_FREE_COMPLEMENTOS);
}

export type PosOrderType = "delivery" | "takeout";

export type PosDeliveryFeeState = {
  city: string | null;
  feeCents: number | null;
  feeStatus: "confirmed" | "pending" | null;
};

export type PosCustomerSuggestion = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  notes?: string | null;
};

function formatCustomerAddress(c: PosCustomerSuggestion): string {
  const parts = [c.address, c.neighborhood, c.city].filter(Boolean);
  return parts.join(", ");
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function CartSidebar({
  cart,
  orderType,
  customerName,
  customerPhone,
  deliveryAddress,
  deliveryCity,
  deliveryFeeCents,
  deliveryFeeStatus,
  customerNotes,
  orderNotes,
  paymentMethod,
  needsCashChange,
  cashChangeFor,
  selectedCustomerId,
  manualDiscount,
  isPending,
  onOrderTypeChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onDeliveryAddressChange,
  onDeliveryFeeChange,
  onCustomerNotesChange,
  onOrderNotesChange,
  onPaymentMethodChange,
  onNeedsCashChangeChange,
  onCashChangeForChange,
  onManualDiscountChange,
  onSelectCustomer,
  onClearSelectedCustomer,
  onUpdateQty,
  onRemove,
  onToggleLoyaltyDiscount,
  loyaltyStickerCard = false,
  customerInfoOptional = false,
  onClearCart,
  onCreateOrder,
}: {
  cart: PosCartItem[];
  orderType: PosOrderType;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryCity: string | null;
  deliveryFeeCents: number | null;
  deliveryFeeStatus: "confirmed" | "pending" | null;
  customerNotes: string;
  orderNotes: string;
  paymentMethod: string;
  needsCashChange: boolean;
  /** Dollars/reais as typed by attendant (not cents). */
  cashChangeFor: string;
  selectedCustomerId: string | null;
  /** Manual discount, reais as typed by attendant (not cents). */
  manualDiscount: string;
  isPending: boolean;
  onOrderTypeChange: (type: PosOrderType) => void;
  onCustomerNameChange: (name: string) => void;
  onCustomerPhoneChange: (phone: string) => void;
  onDeliveryAddressChange: (address: string) => void;
  onDeliveryFeeChange: (fee: PosDeliveryFeeState) => void;
  onCustomerNotesChange: (notes: string) => void;
  onOrderNotesChange: (notes: string) => void;
  onPaymentMethodChange: (method: string) => void;
  onNeedsCashChangeChange: (value: boolean) => void;
  onCashChangeForChange: (value: string) => void;
  onManualDiscountChange: (value: string) => void;
  onSelectCustomer: (customer: PosCustomerSuggestion) => void;
  onClearSelectedCustomer: () => void;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  /** Toggle manual loyalty sticker-card redemption for a cart line (Açaí House). */
  onToggleLoyaltyDiscount?: (lineId: string) => void;
  /** True when the org has the sticker-card loyalty flag enabled. */
  loyaltyStickerCard?: boolean;
  /** True when the org lets PDV orders skip customer name/phone (fair checkout). */
  customerInfoOptional?: boolean;
  onClearCart: () => void;
  onCreateOrder: () => void;
}) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searchSource, setSearchSource] = useState<"name" | "phone">("name");
  const [quoting, setQuoting] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debouncedName = useDebouncedValue(customerName.trim(), 250);
  const debouncedPhone = useDebouncedValue(customerPhone.trim(), 250);
  const debouncedAddress = useDebouncedValue(deliveryAddress.trim(), 600);
  const debouncedPhoneDigits = phoneDigits(debouncedPhone);
  const nameSearchReady = debouncedName.length >= 2;
  const phoneSearchReady = debouncedPhoneDigits.length >= 3;
  const searchEnabled =
    !selectedCustomerId && (nameSearchReady || phoneSearchReady);
  /** Prefer the field the attendant is actively typing. */
  const searchTerm =
    searchSource === "phone" && phoneSearchReady
      ? debouncedPhoneDigits
      : nameSearchReady
        ? debouncedName
        : phoneSearchReady
          ? debouncedPhoneDigits
          : undefined;
  const { data: branchSettings } = useBranchSettings();
  const currency = (branchSettings as any)?.currency || "BRL";
  const preferEnglish = currency === "USD";
  const branchSettingsObj = ((branchSettings as any)?.settings ?? {}) as Record<
    string,
    unknown
  >;
  const pricing = parseDeliveryPricing(branchSettingsObj);
  const isAutoPricing = pricing.mode === "radius" || pricing.mode === "cities";
  const flatFeeCents = getDeliveryFeeCents(branchSettingsObj);
  const paymentOptions = parseDeliveryPaymentMethods(
    (branchSettings as any)?.settings?.payment_methods,
    currency === "USD"
      ? ["cash", "card", "zelle", "venmo", "cashapp"]
      : ["cash", "card", "pix"],
  );

  const { data: customersData, isFetching } = useLoyaltyCustomers(
    searchEnabled ? searchTerm : undefined,
    1,
    searchEnabled,
  );

  const suggestions: PosCustomerSuggestion[] = useMemo(() => {
    const list = (customersData as any)?.customers ?? [];
    return list.slice(0, 8).map((c: any) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      city: c.city,
      neighborhood: c.neighborhood,
      notes: c.notes,
    }));
  }, [customersData]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const applyCityFee = (cityName: string) => {
    const city = pricing.cities.find((c) => c.name === cityName);
    if (!city) return;
    setFeeError(null);
    const cityNames = pricing.cities.map((c) => c.name);
    const nextAddress = appendCityToAddress(
      deliveryAddress,
      city.name,
      cityNames,
    );
    if (nextAddress !== deliveryAddress) {
      onDeliveryAddressChange(nextAddress);
    }
    onDeliveryFeeChange({
      city: city.name,
      feeCents: city.fee_cents,
      feeStatus: "pending",
    });
  };

  const requestFeeQuote = (address: string, city?: string | null) => {
    if (orderType !== "delivery" || !isAutoPricing) return;
    if (address.trim().length < 5) return;
    if (pricing.mode === "cities" && !city) return;

    setQuoting(true);
    setFeeError(null);
    void apiFetch("/api/orders/quote-delivery-fee", {
      method: "POST",
      body: JSON.stringify({
        address: address.trim(),
        ...(city ? { city } : {}),
      }),
    })
      .then((data: any) => {
        onDeliveryFeeChange({
          city: data.city ?? city ?? null,
          feeCents: data.fee_cents,
          feeStatus: data.fee_status === "pending" ? "pending" : "confirmed",
        });
      })
      .catch((err: Error) => {
        setFeeError(err.message || "Não foi possível cotar o frete");
        if (pricing.mode === "radius") {
          onDeliveryFeeChange({ city: null, feeCents: null, feeStatus: null });
        }
      })
      .finally(() => setQuoting(false));
  };

  useEffect(() => {
    if (orderType !== "delivery" || !isAutoPricing) return;
    if (quoteTimer.current) clearTimeout(quoteTimer.current);

    if (pricing.mode === "cities" && deliveryCity) {
      // Soft pending from city list; refine with geocode when address is long enough
      const cityRow = pricing.cities.find((c) => c.name === deliveryCity);
      if (cityRow && deliveryFeeCents == null) {
        onDeliveryFeeChange({
          city: cityRow.name,
          feeCents: cityRow.fee_cents,
          feeStatus: "pending",
        });
      }
      if (debouncedAddress.length >= 5) {
        quoteTimer.current = setTimeout(() => {
          requestFeeQuote(debouncedAddress, deliveryCity);
        }, 50);
      }
      return;
    }

    if (pricing.mode === "radius" && debouncedAddress.length >= 5) {
      quoteTimer.current = setTimeout(() => {
        requestFeeQuote(debouncedAddress);
      }, 50);
    }

    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, isAutoPricing, pricing.mode, debouncedAddress, deliveryCity]);

  const subtotal = cart.reduce((sum, item) => {
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
  const deliveryFeeShown =
    orderType === "delivery"
      ? isAutoPricing
        ? (deliveryFeeCents ?? 0)
        : flatFeeCents
      : 0;
  const manualDiscountCents = Math.round(
    (Number(manualDiscount.replace(",", ".")) || 0) * 100,
  );
  const total = Math.max(
    0,
    subtotal + (orderType === "delivery" ? deliveryFeeShown : 0) - manualDiscountCents,
  );
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const deliveryNeedsAddress =
    orderType === "delivery" && deliveryAddress.trim().length < 5;
  const deliveryNeedsCity =
    orderType === "delivery" && pricing.mode === "cities" && !deliveryCity;
  const deliveryNeedsFee =
    orderType === "delivery" &&
    isAutoPricing &&
    (deliveryFeeCents === null || quoting || Boolean(feeError && pricing.mode === "radius"));
  const needsPayment = !paymentMethod;
  const canCreate =
    cart.length > 0 &&
    !isPending &&
    (customerInfoOptional || customerName.trim().length > 0) &&
    !deliveryNeedsAddress &&
    !deliveryNeedsCity &&
    !deliveryNeedsFee &&
    !needsPayment;

  return (
    <div className="w-80 lg:w-96 flex flex-col border-l pl-4 min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="font-bold flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Pedido
          {totalQty > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalQty}
            </Badge>
          )}
        </h2>
        {cart.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onClearCart}
          >
            Limpar
          </Button>
        )}
      </div>

      {/* Order type */}
      <div className="flex gap-2 mb-3 shrink-0">
        <Button
          variant={orderType === "delivery" ? "default" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => onOrderTypeChange("delivery")}
        >
          <Bike className="h-3.5 w-3.5 mr-1.5" />
          Delivery
        </Button>
        <Button
          variant={orderType === "takeout" ? "default" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => onOrderTypeChange("takeout")}
        >
          <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
          Retirada
        </Button>
      </div>

      {/* Customer form + cart items share one scroll area, so the item list
          never gets squeezed into a tiny box by a tall customer form above it. */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-0.5">
      {/* Customer autocomplete — name or phone */}
      <div className="mb-2 space-y-2" ref={wrapRef}>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={customerInfoOptional ? "Nome do cliente" : "Nome do cliente *"}
            value={customerName}
            onChange={(e) => {
              onClearSelectedCustomer();
              setSearchSource("name");
              onCustomerNameChange(e.target.value);
              setSuggestionsOpen(true);
            }}
            onFocus={() => {
              setSearchSource("name");
              setSuggestionsOpen(true);
            }}
            className="pl-9 text-sm"
            autoComplete="off"
          />
        </div>

        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Telefone (busca ou novo)"
            value={customerPhone}
            onChange={(e) => {
              onClearSelectedCustomer();
              setSearchSource("phone");
              onCustomerPhoneChange(e.target.value);
              setSuggestionsOpen(true);
            }}
            onFocus={() => {
              setSearchSource("phone");
              setSuggestionsOpen(true);
            }}
            className="pl-9 text-sm"
            autoComplete="off"
            inputMode="tel"
          />
        </div>

        {suggestionsOpen &&
          searchEnabled &&
          (suggestions.length > 0 || isFetching) && (
            <div className="relative z-50 -mt-1 rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
              {isFetching && suggestions.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Buscando…
                </p>
              )}
              {suggestions.map((c) => {
                const addr = formatCustomerAddress(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted/80 border-b last:border-0"
                    onClick={() => {
                      onSelectCustomer(c);
                      setSuggestionsOpen(false);
                    }}
                  >
                    <p className="text-sm font-medium leading-tight">{c.name}</p>
                    {c.phone && (
                      <p className="text-[11px] font-medium text-foreground/80 mt-0.5 tabular-nums">
                        {c.phone}
                      </p>
                    )}
                    {addr && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {addr}
                      </p>
                    )}
                    {c.notes && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 line-clamp-1">
                        Obs: {c.notes}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        {orderType === "delivery" && (
          <div className="space-y-2">
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Textarea
                placeholder="Endereço de entrega *"
                value={deliveryAddress}
                onChange={(e) => {
                  onDeliveryAddressChange(e.target.value);
                  if (pricing.mode === "radius") {
                    onDeliveryFeeChange({ city: null, feeCents: null, feeStatus: null });
                    setFeeError(null);
                  }
                }}
                className="pl-9 text-sm min-h-[64px] resize-none"
              />
            </div>

            {pricing.mode === "cities" && pricing.cities.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Cidade / frete *</p>
                <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto">
                  {pricing.cities.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => {
                        applyCityFee(city.name);
                        if (deliveryAddress.trim().length >= 5) {
                          requestFeeQuote(deliveryAddress, city.name);
                        }
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-3 py-2 text-xs transition",
                        deliveryCity === city.name
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <span>{city.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(city.fee_cents, currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(isAutoPricing || orderType === "delivery") && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="font-medium tabular-nums">
                    {quoting
                      ? "…"
                      : orderType === "delivery"
                        ? formatCurrency(
                            isAutoPricing ? (deliveryFeeCents ?? 0) : flatFeeCents,
                            currency,
                          )
                        : "—"}
                  </span>
                </div>
                {deliveryFeeStatus === "pending" && (
                  <p className="text-amber-700 dark:text-amber-400">
                    Frete pendente de confirmação (igual ao cardápio online)
                  </p>
                )}
                {feeError && <p className="text-destructive">{feeError}</p>}
                {!isAutoPricing && (
                  <p className="text-muted-foreground">
                    Taxa padrão da loja (modo zonas / fixo)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <Textarea
          placeholder="Observação do cliente (salva no cadastro)"
          value={customerNotes}
          onChange={(e) => onCustomerNotesChange(e.target.value)}
          className="text-sm min-h-[52px] resize-none"
        />

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Forma de pagamento *</p>
          <div className="grid grid-cols-2 gap-1.5">
            {paymentOptions.map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={paymentMethod === id ? "default" : "outline"}
                className="h-8 text-xs justify-start"
                onClick={() => onPaymentMethodChange(id)}
              >
                {deliveryPaymentLabel(id as DeliveryPaymentMethodId, preferEnglish)}
              </Button>
            ))}
          </div>
          {paymentMethod === "cash" && (
            <div className="rounded-md border bg-muted/30 p-2 space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={needsCashChange}
                  onChange={(e) => onNeedsCashChangeChange(e.target.checked)}
                />
                Precisa de troco
              </label>
              {needsCashChange && (
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={preferEnglish ? "Change for (e.g. 20)" : "Troco para (ex.: 50)"}
                  value={cashChangeFor}
                  onChange={(e) => onCashChangeForChange(e.target.value)}
                  className="h-8 text-xs"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cart items */}
      <div className="space-y-1.5">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm">Toque em um produto para adicionar</p>
          </div>
        ) : (
          cart.map((item) => {
            const modTotal = item.modifiers.reduce((s, m) => s + m.price, 0);
            const rawLineTotal =
              calcItemTotalCents(
                { unitPriceCents: item.unitPrice, promoQuantity: item.promoQuantity, promoPriceCents: item.promoPriceCents },
                item.quantity,
              ) + modTotal * item.quantity;
            const loyaltyLineTotal = item.loyaltyDiscount
              ? loyaltyModifiersChargeCents(item.modifiers) * item.quantity
              : 0;
            const lineTotal = item.loyaltyDiscount ? loyaltyLineTotal : rawLineTotal;
            return (
              <div
                key={item.lineId}
                className={cn(
                  "rounded-lg border p-2.5 space-y-1.5",
                  item.loyaltyDiscount && "border-pink-400 bg-pink-50 dark:bg-pink-950/20",
                )}
              >
                <div className="flex items-start gap-2">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-9 w-9 rounded object-cover flex-shrink-0 mt-0.5"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unitPrice + modTotal)} c/u
                    </p>
                    {item.promoQuantity && item.promoPriceCents && item.quantity >= item.promoQuantity && (
                      <p className="text-[11px] font-medium text-green-600 dark:text-green-500">
                        Promoção aplicada: {item.promoQuantity}un por {formatCurrency(item.promoPriceCents)}
                      </p>
                    )}
                    {item.loyaltyDiscount && (
                      <p className="text-[11px] font-medium text-pink-600 dark:text-pink-400 flex items-center gap-1">
                        <Heart className="h-3 w-3 fill-current" /> Cartão fidelidade — copo + 3
                        complementos grátis
                      </p>
                    )}
                  </div>
                  {loyaltyStickerCard && (
                    <button
                      onClick={() => onToggleLoyaltyDiscount?.(item.lineId)}
                      title="Aplicar/remover desconto de fidelidade (cartão físico)"
                      className={cn(
                        "p-1 transition-colors",
                        item.loyaltyDiscount
                          ? "text-pink-600 dark:text-pink-400"
                          : "text-muted-foreground hover:text-pink-500",
                      )}
                    >
                      <Heart className={cn("h-3.5 w-3.5", item.loyaltyDiscount && "fill-current")} />
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(item.lineId)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {item.modifiers.length > 0 && (
                  <div className="pl-11 flex flex-wrap gap-1">
                    {Object.entries(
                      item.modifiers.reduce<Record<string, { name: string; price: number; count: number }>>(
                        (acc, mod) => {
                          const key = `${mod.modifierId}:${mod.name}`;
                          if (!acc[key]) {
                            acc[key] = { name: mod.name, price: mod.price, count: 0 };
                          }
                          acc[key].count += item.quantity;
                          return acc;
                        },
                        {},
                      ),
                    ).map(([key, mod]) => (
                      <span
                        key={key}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {mod.count > 1 ? `${mod.name} ×${mod.count}` : mod.name}
                        {mod.price > 0 && ` +${formatCurrency(mod.price)}`}
                      </span>
                    ))}
                  </div>
                )}

                {item.notes && (
                  <p className="pl-11 text-[11px] text-muted-foreground italic truncate">
                    {item.notes}
                  </p>
                )}

                <div className="flex items-center justify-between pl-11">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onUpdateQty(item.lineId, item.quantity - 1)}
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </Button>
                    <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onUpdateQty(item.lineId, item.quantity + 1)}
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                  {item.loyaltyDiscount ? (
                    <p className="text-sm font-bold text-pink-600 dark:text-pink-400">
                      <span className="line-through text-muted-foreground font-normal mr-1.5">
                        {formatCurrency(rawLineTotal)}
                      </span>
                      {formatCurrency(loyaltyLineTotal)}
                    </p>
                  ) : (
                    <p className="text-sm font-bold">{formatCurrency(lineTotal)}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      </div>

      {cart.length > 0 && (
        <div className="mb-3 shrink-0">
          <Input
            placeholder="Observações do pedido..."
            value={orderNotes}
            onChange={(e) => onOrderNotesChange(e.target.value)}
            className="text-sm"
          />
        </div>
      )}

      {cart.length > 0 && (
        <div className="border-t pt-3 space-y-1 mb-3 shrink-0">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {orderType === "delivery" && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                Frete
                {deliveryFeeStatus === "pending" ? " (pendente)" : ""}
              </span>
              <span>
                {quoting ? "…" : formatCurrency(deliveryFeeShown)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground pt-1">
            <span>Desconto manual (R$)</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={manualDiscount}
              onChange={(e) => onManualDiscountChange(e.target.value)}
              placeholder="0,00"
              className="h-7 w-24 text-right text-sm"
            />
          </div>
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
          {deliveryNeedsAddress && (
            <p className="text-[11px] text-destructive">
              Informe o endereço para Delivery
            </p>
          )}
          {deliveryNeedsCity && (
            <p className="text-[11px] text-destructive">Selecione a cidade do frete</p>
          )}
          {deliveryNeedsFee && !deliveryNeedsCity && (
            <p className="text-[11px] text-destructive">
              Aguarde a cotação do frete ou ajuste o endereço
            </p>
          )}
          {!customerInfoOptional && !customerName.trim() && (
            <p className="text-[11px] text-destructive">Informe o nome do cliente</p>
          )}
          {needsPayment && (
            <p className="text-[11px] text-destructive">Selecione a forma de pagamento</p>
          )}
        </div>
      )}

      <Button
        className={cn("w-full h-12 text-base font-semibold shrink-0")}
        disabled={!canCreate}
        onClick={onCreateOrder}
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Criando...
          </>
        ) : (
          <>
            <Check className="h-5 w-5 mr-2" />
            Criar Pedido {cart.length > 0 && `· ${formatCurrency(total)}`}
          </>
        )}
      </Button>
    </div>
  );
}
