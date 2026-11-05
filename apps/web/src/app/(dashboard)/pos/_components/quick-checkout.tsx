"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Input } from "@restai/ui/components/input";
import { Button } from "@restai/ui/components/button";
import { Textarea } from "@restai/ui/components/textarea";
import {
  ShoppingCart,
  ArrowLeft,
  ChevronRight,
  Bike,
  ShoppingBag,
  User,
  Phone,
  MapPin,
  Plus,
  Minus,
  Trash2,
  Heart,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { splitPosCheckoutMissing } from "@restai/config";
import { formatCurrency, cn } from "@/lib/utils";
import type { PosCartItem } from "../page";
import type { PosCustomerSuggestion, PosOrderType } from "./cart-sidebar";

/**
 * Tablet/phone PDV checkout (flag `pos_quick_checkout`), two variants:
 *
 * - "panel" (tablet held sideways): a fixed panel beside the products with two tabs,
 *   Cliente | Pedido. The attendant can fill the customer's data while they decide and
 *   keep adding/removing items — nothing hides the product grid.
 * - "sheet" (tablet upright / phone): a bottom bar with two buttons (Cliente, Finalizar)
 *   that open one full-screen "Finalizar pedido" screen, even before any item is added.
 *
 * Purely presentational: all state, customer search, fee quoting and pricing stay in
 * CartSidebar, which feeds this component. The desktop sidebar is untouched.
 */

export interface QuickCheckoutLine {
  item: PosCartItem;
  /** Line total before any loyalty discount (cents). */
  rawLineTotal: number;
  /** Line total actually charged (cents). */
  lineTotal: number;
}

export interface QuickCheckoutProps {
  variant: "panel" | "sheet";
  lines: QuickCheckoutLine[];
  totalQty: number;
  orderType: PosOrderType;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryCity: string | null;
  deliveryFeeStatus: "confirmed" | "pending" | null;
  customerNotes: string;
  orderNotes: string;
  paymentMethod: string;
  needsCashChange: boolean;
  cashChangeFor: string;
  manualDiscount: string;
  isPending: boolean;
  customerInfoOptional: boolean;
  loyaltyStickerCard: boolean;
  preferEnglish: boolean;
  currency: string;
  usPhone: boolean;
  /** Cities with a fee ("cities" pricing mode); empty otherwise. */
  cities: { name: string; fee_cents: number }[];
  paymentOptions: { id: string; label: string }[];
  suggestions: { customer: PosCustomerSuggestion; address: string }[];
  showSuggestions: boolean;
  isFetchingSuggestions: boolean;
  wrapRef: RefObject<HTMLDivElement | null>;
  subtotal: number;
  deliveryFeeCents: number;
  manualDiscountCents: number;
  total: number;
  quoting: boolean;
  feeError: string | null;
  missing: string[];
  canCreate: boolean;
  onOrderTypeChange: (type: PosOrderType) => void;
  onNameInput: (value: string) => void;
  onPhoneInput: (value: string) => void;
  onFocusField: (field: "name" | "phone") => void;
  onPickSuggestion: (customer: PosCustomerSuggestion) => void;
  onAddressInput: (value: string) => void;
  onPickCity: (cityName: string) => void;
  onCustomerNotesChange: (value: string) => void;
  onOrderNotesChange: (value: string) => void;
  onPaymentMethodChange: (method: string) => void;
  onNeedsCashChangeChange: (value: boolean) => void;
  onCashChangeForChange: (value: string) => void;
  onManualDiscountChange: (value: string) => void;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onToggleLoyaltyDiscount?: (lineId: string) => void;
  onClearCart: () => void;
  onCreateOrder: () => void;
}

/** "Morango, Granola ×2" — one line instead of a chip cloud. */
function summarizeModifiers(item: PosCartItem): string {
  const counts = new Map<string, { name: string; count: number }>();
  for (const m of item.modifiers) {
    const key = `${m.modifierId}:${m.name}`;
    const cur = counts.get(key) ?? { name: m.name, count: 0 };
    cur.count += item.quantity;
    counts.set(key, cur);
  }
  return [...counts.values()]
    .map((c) => (c.count > 1 ? `${c.name} ×${c.count}` : c.name))
    .join(", ");
}

function WarnDot() {
  return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />;
}

/** Customer, address, city/fee and notes. */
function CustomerSection({ p, compact }: { p: QuickCheckoutProps; compact: boolean }) {
  const money = (cents: number) => formatCurrency(cents, p.currency);
  const isDelivery = p.orderType === "delivery";
  const inputSize = compact ? "h-11 text-sm" : "h-12 text-base";

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { type: "delivery", label: "Delivery", Icon: Bike },
            { type: "takeout", label: "Retirada", Icon: ShoppingBag },
          ] as const
        ).map(({ type, label, Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => p.onOrderTypeChange(type)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition",
              compact ? "h-11" : "h-12",
              p.orderType === type
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:border-primary/40",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div ref={p.wrapRef} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={p.customerInfoOptional ? "Nome" : "Nome *"}
              value={p.customerName}
              onChange={(e) => p.onNameInput(e.target.value)}
              onFocus={() => p.onFocusField("name")}
              className={cn("pl-9", inputSize)}
              autoComplete="off"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={p.usPhone ? "(508) 963-4871" : "Telefone"}
              value={p.customerPhone}
              onChange={(e) => p.onPhoneInput(e.target.value)}
              onFocus={() => p.onFocusField("phone")}
              className={cn("pl-9", inputSize)}
              autoComplete="off"
              inputMode="tel"
            />
          </div>
        </div>

        {p.showSuggestions && (
          <div className="relative z-50 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
            {p.isFetchingSuggestions && p.suggestions.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
            )}
            {p.suggestions.map(({ customer: c, address }) => (
              <button
                key={c.id}
                type="button"
                className="w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/80"
                onClick={() => p.onPickSuggestion(c)}
              >
                <p className="text-sm font-medium leading-tight">{c.name}</p>
                {c.phone && (
                  <p className="mt-0.5 text-[11px] font-medium tabular-nums text-foreground/80">
                    {c.phone}
                  </p>
                )}
                {address && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{address}</p>
                )}
                {c.notes && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-amber-700 dark:text-amber-400">
                    Obs: {c.notes}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {isDelivery && (
        <div className="space-y-2">
          <div className="relative">
            <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Textarea
              placeholder="Endereço de entrega *"
              value={p.deliveryAddress}
              onChange={(e) => p.onAddressInput(e.target.value)}
              className={cn(
                "resize-none pl-9",
                compact ? "min-h-[64px] text-sm" : "min-h-[72px] text-base",
              )}
            />
          </div>

          {p.cities.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Cidade e frete *</p>
              <div className="flex flex-wrap gap-2">
                {p.cities.map((city) => (
                  <button
                    key={city.name}
                    type="button"
                    onClick={() => p.onPickCity(city.name)}
                    className={cn(
                      "rounded-lg border transition",
                      compact ? "h-10 px-2.5 text-xs" : "h-11 px-3 text-sm",
                      p.deliveryCity === city.name
                        ? "border-primary bg-primary font-semibold text-primary-foreground"
                        : "bg-background hover:border-primary/40",
                    )}
                  >
                    {city.name}
                    <span
                      className={cn(
                        "ml-1.5 tabular-nums",
                        p.deliveryCity === city.name
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {money(city.fee_cents)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Frete</span>
            <span className="font-medium tabular-nums">
              {p.quoting ? "…" : money(p.deliveryFeeCents)}
            </span>
          </div>
          {p.deliveryFeeStatus === "pending" && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Frete pendente de confirmação (igual ao cardápio online)
            </p>
          )}
          {p.feeError && <p className="text-xs text-destructive">{p.feeError}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Obs. do cliente"
          title="Fica salva no cadastro do cliente"
          value={p.customerNotes}
          onChange={(e) => p.onCustomerNotesChange(e.target.value)}
          className={compact ? "h-10 text-sm" : "h-11 text-base"}
        />
        <Input
          placeholder="Obs. do pedido"
          value={p.orderNotes}
          onChange={(e) => p.onOrderNotesChange(e.target.value)}
          className={compact ? "h-10 text-sm" : "h-11 text-base"}
        />
      </div>
    </section>
  );
}

/** Items, payment and totals. */
function OrderSection({ p, compact }: { p: QuickCheckoutProps; compact: boolean }) {
  const money = (cents: number) => formatCurrency(cents, p.currency);
  const isDelivery = p.orderType === "delivery";
  const hasItems = p.lines.length > 0;

  return (
    <section className="space-y-3">
      {hasItems ? (
        <div className="rounded-xl border">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
            <span>
              Itens <span className="text-muted-foreground">({p.totalQty})</span>
            </span>
            {compact && (
              <button
                type="button"
                className="text-xs font-normal text-destructive"
                onClick={() => {
                  if (window.confirm("Limpar todo o pedido?")) p.onClearCart();
                }}
              >
                Limpar
              </button>
            )}
          </div>
          <div className={cn("divide-y", !compact && "max-h-[34vh] overflow-y-auto")}>
            {p.lines.map(({ item, rawLineTotal, lineTotal }) => {
              const mods = summarizeModifiers(item);
              const priceNode = item.loyaltyDiscount ? (
                <>
                  <span className="block text-[11px] font-normal text-muted-foreground line-through">
                    {money(rawLineTotal)}
                  </span>
                  <span className="text-pink-600 dark:text-pink-400">{money(lineTotal)}</span>
                </>
              ) : (
                money(lineTotal)
              );
              return (
                <div
                  key={item.lineId}
                  className={cn(
                    "flex flex-col gap-1.5 px-3 py-2",
                    !compact && "lg:flex-row lg:items-center lg:gap-2",
                    item.loyaltyDiscount && "bg-pink-50 dark:bg-pink-950/20",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      {mods && <p className="truncate text-xs text-muted-foreground">{mods}</p>}
                      {item.notes && (
                        <p className="truncate text-[11px] italic text-muted-foreground">{item.notes}</p>
                      )}
                      {item.loyaltyDiscount && (
                        <p className="flex items-center gap-1 text-[11px] font-medium text-pink-600 dark:text-pink-400">
                          <Heart className="h-3 w-3 fill-current" />
                          Fidelidade: copo + 3 complementos grátis
                        </p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "whitespace-nowrap text-right text-sm font-bold tabular-nums",
                        !compact && "lg:hidden",
                      )}
                    >
                      {priceNode}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="Diminuir"
                        onClick={() => p.onUpdateQty(item.lineId, item.quantity - 1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="Aumentar"
                        onClick={() => p.onUpdateQty(item.lineId, item.quantity + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {p.loyaltyStickerCard && (
                      <button
                        type="button"
                        aria-label="Aplicar ou remover desconto de fidelidade"
                        title="Aplicar/remover desconto de fidelidade (cartão físico)"
                        onClick={() => p.onToggleLoyaltyDiscount?.(item.lineId)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-md border",
                          item.loyaltyDiscount
                            ? "border-pink-400 text-pink-600 dark:text-pink-400"
                            : "text-muted-foreground",
                        )}
                      >
                        <Heart className={cn("h-4 w-4", item.loyaltyDiscount && "fill-current")} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Remover item"
                      onClick={() => p.onRemove(item.lineId)}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {!compact && (
                      <div className="hidden min-w-[5.5rem] whitespace-nowrap text-right text-sm font-bold tabular-nums lg:block">
                        {priceNode}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          <ShoppingCart className="h-8 w-8 opacity-30" />
          {compact
            ? "Toque em um produto ao lado para adicionar"
            : "Nenhum item ainda. Volte em Produtos e toque em um item."}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Forma de pagamento *</p>
        <div className="flex flex-wrap gap-2">
          {p.paymentOptions.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => p.onPaymentMethodChange(id)}
              className={cn(
                "rounded-lg border text-sm font-medium transition",
                compact ? "h-11 min-w-[78px] px-3" : "h-12 min-w-[88px] px-4",
                p.paymentMethod === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:border-primary/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {p.paymentMethod === "cash" && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
            <button
              type="button"
              onClick={() => p.onNeedsCashChangeChange(!p.needsCashChange)}
              className={cn(
                "h-10 shrink-0 rounded-lg border px-3 text-sm",
                p.needsCashChange ? "border-primary bg-primary/10 font-medium" : "bg-background",
              )}
            >
              Precisa de troco
            </button>
            {p.needsCashChange && (
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder={p.preferEnglish ? "Change for (e.g. 20)" : "Troco para (ex.: 50)"}
                value={p.cashChangeFor}
                onChange={(e) => p.onCashChangeForChange(e.target.value)}
                className="h-10 text-sm"
              />
            )}
          </div>
        )}
      </div>

      <div className="space-y-1 rounded-xl border bg-muted/20 p-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(p.subtotal)}</span>
        </div>
        {isDelivery && (
          <div className="flex justify-between text-muted-foreground">
            <span>Frete{p.deliveryFeeStatus === "pending" ? " (pendente)" : ""}</span>
            <span className="tabular-nums">{p.quoting ? "…" : money(p.deliveryFeeCents)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span>Desconto manual ({p.preferEnglish ? "US$" : "R$"})</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={p.manualDiscount}
            onChange={(e) => p.onManualDiscountChange(e.target.value)}
            placeholder="0,00"
            className="h-9 w-24 text-right text-sm"
          />
        </div>
        <div className="flex justify-between pt-1 text-xl font-bold">
          <span>Total</span>
          <span className="tabular-nums text-primary">{money(p.total)}</span>
        </div>
      </div>
    </section>
  );
}

/** "Falta: …" / "Tudo preenchido" + the big Create button. */
function CheckoutFooter({ p, layout }: { p: QuickCheckoutProps; layout: "row" | "stack" }) {
  const money = (cents: number) => formatCurrency(cents, p.currency);
  const message =
    p.missing.length > 0 ? (
      <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Falta: <span className="font-medium">{p.missing.join(" · ")}</span>
        </span>
      </p>
    ) : (
      <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-500">
        <Check className="h-4 w-4" />
        Tudo preenchido
      </p>
    );
  const button = (
    <Button
      className={cn(
        "text-base font-semibold",
        layout === "stack" ? "h-12 w-full" : "h-14 w-full sm:w-auto sm:min-w-[210px]",
      )}
      disabled={!p.canCreate}
      onClick={p.onCreateOrder}
    >
      {p.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Criando...
        </>
      ) : (
        <>
          <Check className="mr-2 h-5 w-5" />
          Criar pedido · {money(p.total)}
        </>
      )}
    </Button>
  );

  if (layout === "stack") {
    return (
      <div className="space-y-2">
        {message}
        {button}
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">{message}</div>
      {button}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  warn,
  children,
}: {
  active: boolean;
  onClick: () => void;
  warn: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40",
      )}
    >
      {children}
      {warn && <WarnDot />}
    </button>
  );
}

export function QuickCheckout(p: QuickCheckoutProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"cliente" | "pedido">("cliente");
  const money = (cents: number) => formatCurrency(cents, p.currency);
  const hasItems = p.lines.length > 0;
  const { customer: customerMissing, order: orderMissing } = splitPosCheckoutMissing(p.missing);

  // Order created / last item removed → back to the product screen (sheet) / customer tab (panel).
  const hadItems = useRef(hasItems);
  useEffect(() => {
    if (hadItems.current && !hasItems) {
      setOpen(false);
      setTab("cliente");
    }
    hadItems.current = hasItems;
  }, [hasItems]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (p.variant === "panel") {
    return (
      <div className="flex min-h-0 w-[360px] shrink-0 flex-col border-l pl-4 xl:w-[400px]">
        <div className="mb-3 flex shrink-0 gap-2">
          <TabButton active={tab === "cliente"} onClick={() => setTab("cliente")} warn={customerMissing.length > 0}>
            <User className="h-4 w-4" />
            Cliente
          </TabButton>
          <TabButton active={tab === "pedido"} onClick={() => setTab("pedido")} warn={orderMissing.length > 0}>
            <ShoppingCart className="h-4 w-4" />
            Pedido{p.totalQty > 0 ? ` (${p.totalQty})` : ""}
          </TabButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {tab === "cliente" ? (
            <CustomerSection p={p} compact />
          ) : (
            <OrderSection p={p} compact />
          )}
        </div>
        <div className="shrink-0 border-t pt-3">
          <CheckoutFooter p={p} layout="stack" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Bottom bar on the product screen: Cliente (any time) + Finalizar */}
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border bg-background text-sm font-medium transition active:scale-[0.99]"
        >
          <User className="h-4 w-4" />
          Cliente
          {customerMissing.length > 0 && <WarnDot />}
        </button>
        {hasItems ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-14 flex-[2] items-center justify-between gap-3 rounded-xl bg-primary px-4 text-primary-foreground transition active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <ShoppingCart className="h-5 w-5" />
              {p.totalQty} {p.totalQty === 1 ? "item" : "itens"}
              <span className="opacity-80">· {money(p.subtotal)}</span>
            </span>
            <span className="flex items-center gap-1 text-base font-semibold">
              Finalizar
              <ChevronRight className="h-5 w-5" />
            </span>
          </button>
        ) : (
          <div className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
            <ShoppingCart className="h-4 w-4" />
            Toque em um produto
          </div>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Finalizar pedido"
          className="fixed inset-0 z-40 flex flex-col bg-background"
        >
          <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Button variant="ghost" className="h-11 gap-1 px-3" onClick={() => setOpen(false)}>
              <ArrowLeft className="h-5 w-5" />
              Produtos
            </Button>
            <h2 className="flex-1 text-center text-base font-semibold">Finalizar pedido</h2>
            {hasItems ? (
              <Button
                variant="ghost"
                className="h-11 px-3 text-destructive"
                onClick={() => {
                  if (window.confirm("Limpar todo o pedido?")) p.onClearCart();
                }}
              >
                Limpar
              </Button>
            ) : (
              <span className="w-[72px]" />
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid max-w-5xl gap-4 p-3 md:grid-cols-2 md:p-4">
              <CustomerSection p={p} compact={false} />
              <OrderSection p={p} compact={false} />
            </div>
          </div>

          <footer className="shrink-0 border-t bg-background px-3 py-3">
            <CheckoutFooter p={p} layout="row" />
          </footer>
        </div>
      )}
    </>
  );
}
