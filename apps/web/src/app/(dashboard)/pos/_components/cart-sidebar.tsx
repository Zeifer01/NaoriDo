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
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useLoyaltyCustomers } from "@/hooks/use-loyalty";
import type { PosCartItem } from "../page";

export type PosOrderType = "delivery" | "takeout";

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
  customerNotes,
  orderNotes,
  selectedCustomerId,
  isPending,
  onOrderTypeChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onDeliveryAddressChange,
  onCustomerNotesChange,
  onOrderNotesChange,
  onSelectCustomer,
  onClearSelectedCustomer,
  onUpdateQty,
  onRemove,
  onClearCart,
  onCreateOrder,
}: {
  cart: PosCartItem[];
  orderType: PosOrderType;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  customerNotes: string;
  orderNotes: string;
  selectedCustomerId: string | null;
  isPending: boolean;
  onOrderTypeChange: (type: PosOrderType) => void;
  onCustomerNameChange: (name: string) => void;
  onCustomerPhoneChange: (phone: string) => void;
  onDeliveryAddressChange: (address: string) => void;
  onCustomerNotesChange: (notes: string) => void;
  onOrderNotesChange: (notes: string) => void;
  onSelectCustomer: (customer: PosCustomerSuggestion) => void;
  onClearSelectedCustomer: () => void;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onClearCart: () => void;
  onCreateOrder: () => void;
}) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debouncedName = useDebouncedValue(customerName.trim(), 250);
  const searchEnabled = debouncedName.length >= 2 && !selectedCustomerId;

  const { data: customersData, isFetching } = useLoyaltyCustomers(
    searchEnabled ? debouncedName : undefined,
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

  const subtotal = cart.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((ms, m) => ms + m.price, 0);
    return sum + (item.unitPrice + modTotal) * item.quantity;
  }, 0);
  const total = subtotal;
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  const deliveryNeedsAddress =
    orderType === "delivery" && deliveryAddress.trim().length < 5;
  const canCreate =
    cart.length > 0 &&
    !isPending &&
    customerName.trim().length > 0 &&
    !deliveryNeedsAddress;

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

      {/* Customer autocomplete */}
      <div className="mb-2 space-y-2 shrink-0" ref={wrapRef}>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Nome do cliente *"
            value={customerName}
            onChange={(e) => {
              onClearSelectedCustomer();
              onCustomerNameChange(e.target.value);
              setSuggestionsOpen(true);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            className="pl-9 text-sm"
            autoComplete="off"
          />
          {suggestionsOpen && searchEnabled && (suggestions.length > 0 || isFetching) && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
              {isFetching && suggestions.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
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
                    {(c.phone || addr) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {[c.phone, addr].filter(Boolean).join(" · ")}
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
        </div>

        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Telefone (opcional)"
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>

        {orderType === "delivery" && (
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Textarea
              placeholder="Endereço de entrega *"
              value={deliveryAddress}
              onChange={(e) => onDeliveryAddressChange(e.target.value)}
              className="pl-9 text-sm min-h-[64px] resize-none"
            />
          </div>
        )}

        <Textarea
          placeholder="Observação do cliente (salva no cadastro)"
          value={customerNotes}
          onChange={(e) => onCustomerNotesChange(e.target.value)}
          className="text-sm min-h-[52px] resize-none"
        />
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto space-y-1.5 mb-3 min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm">Toque em um produto para adicionar</p>
          </div>
        ) : (
          cart.map((item) => {
            const modTotal = item.modifiers.reduce((s, m) => s + m.price, 0);
            const lineTotal = (item.unitPrice + modTotal) * item.quantity;
            return (
              <div
                key={item.lineId}
                className="rounded-lg border p-2.5 space-y-1.5"
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
                  </div>
                  <button
                    onClick={() => onRemove(item.lineId)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {item.modifiers.length > 0 && (
                  <div className="pl-11 flex flex-wrap gap-1">
                    {item.modifiers.map((mod, idx) => (
                      <span
                        key={`${mod.modifierId}-${idx}`}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {mod.name}
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
                  <p className="text-sm font-bold">{formatCurrency(lineTotal)}</p>
                </div>
              </div>
            );
          })
        )}
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
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
          {deliveryNeedsAddress && (
            <p className="text-[11px] text-destructive">
              Informe o endereço para Delivery
            </p>
          )}
          {!customerName.trim() && (
            <p className="text-[11px] text-destructive">Informe o nome do cliente</p>
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
