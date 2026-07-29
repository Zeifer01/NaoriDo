"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createDeliveryOrderSchema } from "@restai/validators";
import { Banknote, Bike, CreditCard, Loader2, Minus, Plus, QrCode, ShoppingBag, Smartphone, Trash2, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useDeliveryCartStore } from "@/stores/delivery-cart-store";
import { useDeliveryStore } from "@/stores/delivery-store";
import { useDeliveryBranch } from "@/hooks/use-delivery-branch";
import { deliveryClasses } from "@/app/(delivery)/_components/delivery-theme";
import {
  DEFAULT_DELIVERY_PAYMENT_METHODS,
  deliveryPaymentLabel,
  type DeliveryPaymentMethodId,
} from "@restai/config";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DeliveryZone {
  id: string;
  name: string;
  fee_cents: number;
}

type CheckoutForm = {
  customerName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryReference?: string;
  notes?: string;
};

export default function DeliveryCartPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = use(params);
  const router = useRouter();
  const { currency, taxRate, deliveryFee } = useDeliveryBranch(branchSlug);
  const setCheckout = useDeliveryStore((s) => s.setCheckout);
  const fulfillment = useDeliveryStore((s) => s.fulfillment);
  const setFulfillment = useDeliveryStore((s) => s.setFulfillment);
  const isPickup = fulfillment === "pickup";
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    getSubtotal,
    getTax,
    getTotal,
  } = useDeliveryCartStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<DeliveryPaymentMethodId | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<DeliveryPaymentMethodId[]>(
    DEFAULT_DELIVERY_PAYMENT_METHODS,
  );
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [pickupHint, setPickupHint] = useState<string | null>(null);
  const [pickupUnavailableMessage, setPickupUnavailableMessage] = useState<string | null>(null);
  const [deliveryLabel, setDeliveryLabel] = useState("Entrega");
  const [pickupLabel, setPickupLabel] = useState("Retirada");
  const preferEnglish = currency === "USD";

  useEffect(() => {
    void fetch(`${API_URL}/api/delivery/${branchSlug}/zones`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setZones(res.data);
          setSelectedZoneId(res.data[0].id);
        }
        const meta = res.meta ?? {};
        const enabled = meta.pickup_enabled !== false;
        setPickupEnabled(enabled);
        setPickupAddress(meta.pickup_address ?? null);
        setPickupHint(meta.pickup_hint ?? null);
        setPickupUnavailableMessage(meta.pickup_unavailable_message ?? null);
        if (meta.delivery_label) setDeliveryLabel(meta.delivery_label);
        if (meta.pickup_label) setPickupLabel(meta.pickup_label);
        if (Array.isArray(meta.payment_methods) && meta.payment_methods.length > 0) {
          setPaymentMethods(meta.payment_methods as DeliveryPaymentMethodId[]);
        }
        if (!enabled) setFulfillment("delivery");
      })
      .catch(() => {});
  }, [branchSlug, setFulfillment]);

  const pickupSubtitle = pickupEnabled
    ? pickupHint ||
      (pickupAddress
        ? `Retire em: ${pickupAddress}`
        : "Retire no local · Grátis")
    : pickupUnavailableMessage || "No momento não estamos aceitando retirada";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutForm>({
    defaultValues: {
      customerName: "",
      deliveryPhone: "",
      deliveryAddress: "",
      deliveryReference: "",
      notes: "",
    },
  });

  const subtotal = getSubtotal();
  const tax = getTax(taxRate);
  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const zoneBasedFee = zones.length > 0 ? (selectedZone?.fee_cents ?? zones[0]!.fee_cents) : null;
  const effectiveDeliveryFee = isPickup ? 0 : (zoneBasedFee ?? deliveryFee);
  const total = getTotal(taxRate) + effectiveDeliveryFee;

  const onSubmit = (form: CheckoutForm) => {
    if (items.length === 0) return;

    if (!paymentMethod) {
      setError("Selecione uma forma de pagamento");
      return;
    }

    if (!isPickup && zones.length > 0 && !selectedZoneId) {
      setError("Selecione sua zona de entrega");
      return;
    }

    const payload = {
      fulfillment,
      customerName: form.customerName,
      deliveryPhone: form.deliveryPhone,
      deliveryAddress: isPickup ? undefined : form.deliveryAddress,
      deliveryReference: isPickup
        ? undefined
        : form.deliveryReference || undefined,
      deliveryZoneId: (!isPickup && selectedZoneId) ? selectedZoneId : undefined,
      notes: form.notes || undefined,
      paymentMethod,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes,
        modifiers: item.modifiers.map((m) => ({ modifierId: m.modifierId })),
      })),
    };

    const parsed = createDeliveryOrderSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message || "Dados inválidos");
      return;
    }

    setLoading(true);
    setError(null);

    void fetch(`${API_URL}/api/delivery/${branchSlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    })
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) {
          setError(result.error?.message || "Erro ao criar pedido");
          setLoading(false);
          return;
        }

        setCheckout(form.deliveryPhone, result.data.order.id);
        clearCart();
        toast.success("Pedido enviado!", {
          description: `Pedido #${result.data.order.order_number}`,
        });
        router.push(`/delivery/${branchSlug}/pedido/${result.data.order.id}`);
      })
      .catch(() => {
        setError("Erro inesperado ao enviar pedido");
        setLoading(false);
      });
  };

  if (items.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className={deliveryClasses.muted}>Seu carrinho está vazio</p>
        <Link
          href={`/delivery/${branchSlug}/menu`}
          className={`${deliveryClasses.btnPrimary} px-6 py-3 text-sm`}
        >
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--d-text-strong)]">Carrinho</h1>
        <p className={deliveryClasses.muted}>
          Revise os itens e escolha como deseja receber
        </p>
      </div>

      <div className={`${deliveryClasses.cardInner} space-y-2`}>
        <p className="text-sm font-semibold text-[var(--d-text-strong)]">Como deseja receber?</p>
        <div className={`grid gap-2 ${pickupEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            type="button"
            onClick={() => setFulfillment("delivery")}
            className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-sm transition ${
              !isPickup
                ? "border-[var(--d-accent-dark)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                : "border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
            }`}
          >
            <Bike className="h-5 w-5" />
            <span className="font-medium">{deliveryLabel}</span>
            <span className="text-[11px]">
              {zones.length > 0 ? "A partir de " : "+ "}
              {formatCurrency(
                zones.length > 0 ? Math.min(...zones.map((z) => z.fee_cents)) : deliveryFee,
                currency,
              )}
            </span>
          </button>
          {pickupEnabled ? (
            <button
              type="button"
              onClick={() => setFulfillment("pickup")}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-sm transition ${
                isPickup
                  ? "border-[var(--d-accent-dark)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                  : "border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
              }`}
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="font-medium">{pickupLabel}</span>
              <span className="text-[11px] font-semibold text-[var(--d-accent-dark)] text-center leading-snug">
                {pickupSubtitle}
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--d-border)] bg-[var(--d-bg-elevated)]/60 px-3 py-3 text-center">
              <p className="text-xs font-medium text-[var(--d-text-muted)]">{pickupLabel} indisponível</p>
              <p className="mt-1 text-[11px] leading-snug text-[var(--d-text-soft)]">
                {pickupSubtitle}
              </p>
            </div>
          )}
        </div>
      </div>

      {!isPickup && zones.length > 0 && (
        <div className={`${deliveryClasses.cardInner} space-y-2`}>
          <p className="text-sm font-semibold text-[var(--d-text-strong)]">Zona de entrega</p>
          <p className="text-xs text-[var(--d-text-muted)]">Selecione seu bairro para calcular o frete</p>
          <div className="space-y-1.5">
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelectedZoneId(zone.id)}
                className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                  selectedZoneId === zone.id
                    ? "border-[var(--d-accent-dark)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                    : "border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
                }`}
              >
                <span className="font-medium">{zone.name}</span>
                <span className={`font-semibold ${selectedZoneId === zone.id ? "text-[var(--d-accent-dark)]" : ""}`}>
                  {formatCurrency(zone.fee_cents, currency)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const modsTotal = item.modifiers.reduce((s, m) => s + m.price, 0);
          const lineTotal = (item.unitPrice + modsTotal) * item.quantity;
          return (
            <div key={item.lineId} className={deliveryClasses.card}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--d-text-strong)]">{item.name}</p>
                    {item.modifiers.length > 0 && (
                      <p className="mt-1 text-xs text-[var(--d-text-muted)]">
                        {(() => {
                          const counts = new Map<string, number>();
                          for (const m of item.modifiers) {
                            counts.set(m.name, (counts.get(m.name) || 0) + 1);
                          }
                          return [...counts.entries()]
                            .map(([name, qty]) => (qty > 1 ? `${name} ×${qty}` : name))
                            .join(", ");
                        })()}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-1 text-xs text-[var(--d-text-muted)]">Obs: {item.notes}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-2 text-[var(--d-placeholder)] transition hover:bg-[var(--d-bg-elevated)] active:scale-95"
                    onClick={() => removeItem(item.lineId)}
                    aria-label="Remover item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 rounded-full bg-[var(--d-bg-soft)] px-1 py-1">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--d-card-solid)] text-[var(--d-accent-dark)] shadow-sm touch-manipulation"
                      onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--d-accent)] text-[var(--d-on-accent)] shadow-sm touch-manipulation"
                      onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="font-semibold text-[var(--d-accent-dark)]">
                    {formatCurrency(lineTotal, currency)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`${deliveryClasses.cardInner} space-y-2 text-sm`}>
        <div className="flex justify-between">
          <span className="text-[var(--d-text-muted)]">Subtotal</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--d-text-muted)]">Taxas</span>
          <span>{formatCurrency(tax, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--d-text-muted)]">
            {isPickup ? "Retirada" : selectedZone ? selectedZone.name : "Entrega"}
          </span>
          <span className={isPickup ? "font-semibold text-[var(--d-accent-dark)]" : ""}>
            {isPickup ? "Grátis" : formatCurrency(effectiveDeliveryFee, currency)}
          </span>
        </div>
        <div className="flex justify-between border-t border-[var(--d-bg-elevated)] pt-2 text-base font-semibold text-[var(--d-text-strong)]">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      {/* Payment method */}
      <div className={`${deliveryClasses.cardInner} space-y-3`}>
        <p className="text-sm font-semibold text-[var(--d-text-strong)]">
          {preferEnglish ? "Payment method" : "Forma de pagamento"}
        </p>
        <div className={`grid gap-2 ${paymentMethods.length > 3 ? "grid-cols-2" : "grid-cols-3"}`}>
          {paymentMethods.map((value) => {
            const Icon =
              value === "cash"
                ? Banknote
                : value === "card"
                  ? CreditCard
                  : value === "pix"
                    ? QrCode
                    : value === "zelle" || value === "venmo"
                      ? Smartphone
                      : Wallet;
            const label = deliveryPaymentLabel(value, preferEnglish);
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setPaymentMethod(value);
                  setError(null);
                }}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-sm transition ${
                  paymentMethod === value
                    ? "border-[var(--d-accent-dark)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                    : "border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium text-center leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={`${deliveryClasses.cardInner} space-y-4`}>
        <h2 className="font-semibold text-[var(--d-text-strong)]">
          {isPickup ? "Dados para retirada" : "Dados de entrega"}
        </h2>

        <div className="space-y-1.5">
          <label htmlFor="customerName" className={deliveryClasses.label}>
            Nome completo
          </label>
          <input
            id="customerName"
            className={deliveryClasses.input}
            {...register("customerName", { required: true })}
          />
          {errors.customerName && (
            <p className={deliveryClasses.error}>Informe seu nome</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="deliveryPhone" className={deliveryClasses.label}>
            Telefone / WhatsApp
          </label>
          <input
            id="deliveryPhone"
            className={deliveryClasses.input}
            placeholder="(11) 99999-9999"
            {...register("deliveryPhone", { required: true })}
          />
          {errors.deliveryPhone && (
            <p className={deliveryClasses.error}>Informe um telefone válido</p>
          )}
        </div>

        {!isPickup && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="deliveryAddress" className={deliveryClasses.label}>
                Endereço de entrega
              </label>
              <input
                id="deliveryAddress"
                className={deliveryClasses.input}
                placeholder="Rua, número, bairro"
                {...register("deliveryAddress", { required: !isPickup })}
              />
              {errors.deliveryAddress && (
                <p className={deliveryClasses.error}>Informe o endereço</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="deliveryReference"
                className={deliveryClasses.label}
              >
                Complemento / referência
              </label>
              <input
                id="deliveryReference"
                className={deliveryClasses.input}
                placeholder="Apto, bloco, ponto de referência"
                {...register("deliveryReference")}
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <label htmlFor="notes" className={deliveryClasses.label}>
            Observações do pedido
          </label>
          <input
            id="notes"
            className={deliveryClasses.input}
            placeholder="Opcional"
            {...register("notes")}
          />
        </div>

        {error && <p className={deliveryClasses.error}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className={`${deliveryClasses.btnPrimary} w-full py-3.5 text-base`}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando pedido...
            </>
          ) : (
            `${isPickup ? "Confirmar retirada" : "Confirmar pedido"} · ${formatCurrency(total, currency)}`
          )}
        </button>
      </form>
    </div>
  );
}
