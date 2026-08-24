"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createDeliveryOrderSchema } from "@restai/validators";
import {
  Banknote,
  Bike,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Smartphone,
  Trash2,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useDeliveryCartStore, getDeliveryItemLineTotal } from "@/stores/delivery-cart-store";
import { useDeliveryStore } from "@/stores/delivery-store";
import { useDeliveryBranch } from "@/hooks/use-delivery-branch";
import { deliveryClasses } from "@/app/(delivery)/_components/delivery-theme";
import {
  DEFAULT_DELIVERY_PAYMENT_METHODS,
  deliveryPaymentLabel,
  formatModifierDisplayName,
  appendCityToAddress,
  type DeliveryPaymentMethodId,
} from "@restai/config";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { buildCashChangeNote } from "@/lib/order-ticket";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DeliveryZone {
  id: string;
  name: string;
  fee_cents: number;
}

type FeeQuote = {
  fee_cents: number;
  fee_status?: "confirmed" | "pending";
  distance_miles?: number | null;
  tier_label: string;
  city?: string | null;
  formatted_address?: string;
  message?: string | null;
};

type DeliveryCityOption = {
  name: string;
  fee_cents: number;
};

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
  const [needsCashChange, setNeedsCashChange] = useState(false);
  const [cashChangeFor, setCashChangeFor] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<DeliveryPaymentMethodId[]>(
    DEFAULT_DELIVERY_PAYMENT_METHODS,
  );
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<"zones" | "radius" | "cities">("zones");
  const isAutoPricing = pricingMode === "radius" || pricingMode === "cities";
  const [cities, setCities] = useState<DeliveryCityOption[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [feeFromCents, setFeeFromCents] = useState<number | null>(null);
  const [feeQuote, setFeeQuote] = useState<FeeQuote | null>(null);
  const [feeQuoteError, setFeeQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [deliveryFulfillmentEnabled, setDeliveryFulfillmentEnabled] = useState(true);
  const [pickupFeeCents, setPickupFeeCents] = useState(0);
  const [pickupFeeReason, setPickupFeeReason] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [pickupHint, setPickupHint] = useState<string | null>(null);
  const [pickupUnavailableMessage, setPickupUnavailableMessage] = useState<string | null>(null);
  const [deliveryLabel, setDeliveryLabel] = useState("Entrega");
  const [pickupLabel, setPickupLabel] = useState("Retirada");
  const [autocompleteCountry, setAutocompleteCountry] = useState<string | undefined>(undefined);
  const [storeLat, setStoreLat] = useState<number | undefined>(undefined);
  const [storeLng, setStoreLng] = useState<number | undefined>(undefined);
  const preferEnglish = currency === "USD";
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetch(`${API_URL}/api/delivery/${branchSlug}/zones`)
      .then((r) => r.json())
      .then((res) => {
        const meta = res.meta ?? {};
        const rawMode = meta.delivery_pricing_mode;
        const mode =
          rawMode === "radius" || rawMode === "cities" ? rawMode : "zones";
        setPricingMode(mode);
        if (typeof meta.delivery_fee_from_cents === "number") {
          setFeeFromCents(meta.delivery_fee_from_cents);
        }
        if (mode === "zones" && res.success && Array.isArray(res.data) && res.data.length > 0) {
          setZones(res.data);
          setSelectedZoneId(res.data[0].id);
        } else {
          setZones([]);
          setSelectedZoneId(null);
        }
        if (mode === "cities" && Array.isArray(meta.delivery_cities)) {
          setCities(meta.delivery_cities as DeliveryCityOption[]);
        } else {
          setCities([]);
          setSelectedCity(null);
        }
        const enabled = meta.pickup_enabled !== false;
        setPickupEnabled(enabled);
        const deliveryEnabled = meta.delivery_fulfillment_enabled !== false;
        setDeliveryFulfillmentEnabled(deliveryEnabled);
        setPickupFeeCents(typeof meta.pickup_fee_cents === "number" ? meta.pickup_fee_cents : 0);
        setPickupFeeReason(meta.pickup_fee_reason ?? null);
        setPickupAddress(meta.pickup_address ?? null);
        setPickupHint(meta.pickup_hint ?? null);
        setPickupUnavailableMessage(meta.pickup_unavailable_message ?? null);
        if (meta.delivery_label) setDeliveryLabel(meta.delivery_label);
        if (meta.pickup_label) setPickupLabel(meta.pickup_label);
        if (typeof meta.autocomplete_country === "string") {
          setAutocompleteCountry(meta.autocomplete_country);
        } else if (preferEnglish) {
          setAutocompleteCountry("us");
        }
        if (typeof meta.store_lat === "number") setStoreLat(meta.store_lat);
        if (typeof meta.store_lng === "number") setStoreLng(meta.store_lng);
        if (Array.isArray(meta.payment_methods) && meta.payment_methods.length > 0) {
          setPaymentMethods(meta.payment_methods as DeliveryPaymentMethodId[]);
        }
        // Branch-configured default (e.g. Naori Do opens the cart on "Retirada").
        // Only when the customer hasn't explicitly picked a fulfillment this session.
        if (
          meta.cart_default_fulfillment === "pickup" &&
          enabled &&
          !sessionStorage.getItem("delivery_fulfillment")
        ) {
          setFulfillment("pickup");
        }
        if (!enabled) setFulfillment("delivery");
        if (!deliveryEnabled) setFulfillment("pickup");
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
    setValue,
    getValues,
    watch,
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

  const deliveryAddress = watch("deliveryAddress");

  const applyCityFee = (cityName: string) => {
    const city = cities.find((c) => c.name === cityName);
    if (!city) return;
    setSelectedCity(city.name);
    const cityNames = cities.map((c) => c.name);
    const currentAddress = getValues("deliveryAddress") || "";
    const nextAddress = appendCityToAddress(currentAddress, city.name, cityNames);
    if (nextAddress !== currentAddress) {
      setValue("deliveryAddress", nextAddress, { shouldDirty: true });
    }
    setFeeQuote({
      fee_cents: city.fee_cents,
      fee_status: "pending",
      tier_label: city.name,
      city: city.name,
      message: preferEnglish
        ? "Delivery fee pending confirmation — we'll verify your address and confirm on WhatsApp."
        : "Frete a confirmar — validamos o endereço e confirmamos no WhatsApp.",
    });
    setFeeQuoteError(null);
  };

  const requestFeeQuote = (address: string, city?: string | null) => {
    if (!isAutoPricing || isPickup) return;
    const trimmed = address.trim();
    const cityName = (city ?? selectedCity)?.trim() || "";

    if (pricingMode === "cities") {
      if (!cityName) {
        setFeeQuote(null);
        setFeeQuoteError(null);
        return;
      }
      if (trimmed.length < 5) {
        applyCityFee(cityName);
        return;
      }
    } else if (trimmed.length < 5) {
      setFeeQuote(null);
      setFeeQuoteError(null);
      return;
    }

    setQuoting(true);
    setFeeQuoteError(null);
    void fetch(`${API_URL}/api/delivery/${branchSlug}/quote-fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: trimmed,
        ...(pricingMode === "cities" && cityName ? { city: cityName } : {}),
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) {
          // Cities + selected city: keep provisional fee; only surface soft note
          if (pricingMode === "cities" && cityName) {
            applyCityFee(cityName);
            return;
          }
          setFeeQuote(null);
          setFeeQuoteError(
            res.error?.message ||
              (preferEnglish ? "We don't deliver to this area" : "Não entregamos nesta região"),
          );
          return;
        }
        setFeeQuote(res.data as FeeQuote);
        setFeeQuoteError(null);
      })
      .catch(() => {
        if (pricingMode === "cities" && cityName) {
          applyCityFee(cityName);
          return;
        }
        setFeeQuote(null);
        setFeeQuoteError(
          preferEnglish
            ? "Couldn't calculate delivery fee. Try again."
            : "Não foi possível calcular o frete. Tente de novo.",
        );
      })
      .finally(() => setQuoting(false));
  };

  useEffect(() => {
    if (!isAutoPricing || isPickup) return;
    if (pricingMode === "cities" && !selectedCity) return;
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(
      () => requestFeeQuote(deliveryAddress || "", selectedCity),
      600,
    );
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce address/city only
  }, [deliveryAddress, selectedCity, isAutoPricing, isPickup, pricingMode, branchSlug]);

  const subtotal = getSubtotal();
  const tax = getTax(taxRate);
  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const zoneBasedFee = zones.length > 0 ? (selectedZone?.fee_cents ?? zones[0]!.fee_cents) : null;
  const autoFee = feeQuote?.fee_cents ?? null;
  const effectiveDeliveryFee = isPickup
    ? pickupFeeCents
    : isAutoPricing
      ? (autoFee ?? 0)
      : (zoneBasedFee ?? deliveryFee);
  const total = getTotal(taxRate) + effectiveDeliveryFee;

  const deliveryFeeHint = isAutoPricing
    ? feeFromCents != null
      ? `${preferEnglish ? "From " : "A partir de "}${formatCurrency(feeFromCents, currency)}`
      : preferEnglish
        ? "Based on address"
        : "Conforme endereço"
    : zones.length > 0
      ? `${preferEnglish ? "From " : "A partir de "}${formatCurrency(
          Math.min(...zones.map((z) => z.fee_cents)),
          currency,
        )}`
      : `+ ${formatCurrency(deliveryFee, currency)}`;

  const feeLineLabel = isPickup
    ? preferEnglish
      ? "Pickup"
      : "Retirada"
    : isAutoPricing
      ? feeQuote
        ? pricingMode === "cities"
          ? preferEnglish
            ? `Delivery (${feeQuote.tier_label})`
            : `Entrega (${feeQuote.tier_label})`
          : feeQuote.distance_miles != null
            ? preferEnglish
              ? `Delivery (~${feeQuote.distance_miles} mi)`
              : `Entrega (~${feeQuote.distance_miles} mi)`
            : preferEnglish
              ? "Delivery"
              : "Entrega"
        : preferEnglish
          ? "Delivery"
          : "Entrega"
      : selectedZone
        ? selectedZone.name.split("\n")[0]!.trim() || selectedZone.name
        : preferEnglish
          ? "Delivery"
          : "Entrega";

  const onSubmit = (form: CheckoutForm) => {
    if (items.length === 0) return;

    if (!paymentMethod) {
      setError(preferEnglish ? "Select a payment method" : "Selecione uma forma de pagamento");
      return;
    }

    if (!isPickup && pricingMode === "zones" && zones.length > 0 && !selectedZoneId) {
      setError(preferEnglish ? "Select your delivery zone" : "Selecione sua zona de entrega");
      return;
    }

    if (!isPickup && pricingMode === "cities") {
      if (!selectedCity) {
        setError(preferEnglish ? "Select your city" : "Selecione sua cidade");
        return;
      }
      if (!form.deliveryAddress?.trim()) {
        setError(preferEnglish ? "Enter your delivery address" : "Informe o endereço de entrega");
        return;
      }
      if (!feeQuote) {
        setError(
          preferEnglish
            ? "Select your city to calculate delivery"
            : "Selecione a cidade para calcular o frete",
        );
        return;
      }
    }

    if (!isPickup && pricingMode === "radius") {
      if (!form.deliveryAddress?.trim()) {
        setError(preferEnglish ? "Enter your delivery address" : "Informe o endereço de entrega");
        return;
      }
      if (!feeQuote || feeQuoteError) {
        setError(
          feeQuoteError ||
            (preferEnglish
              ? "Enter a valid address to calculate delivery"
              : "Informe um endereço válido para calcular o frete"),
        );
        return;
      }
    }

    if (paymentMethod === "cash" && needsCashChange) {
      const changeFor = Number(cashChangeFor.replace(",", "."));
      if (!Number.isFinite(changeFor) || changeFor <= 0) {
        setError(
          preferEnglish
            ? "Enter the amount you will pay (e.g. 100)"
            : "Informe o valor para troco (ex.: 100)",
        );
        return;
      }
    }

    const changeForCents =
      paymentMethod === "cash" && needsCashChange && cashChangeFor.trim()
        ? Math.round(Number(cashChangeFor.replace(",", ".")) * 100)
        : null;
    const trocoNote =
      paymentMethod === "cash"
        ? buildCashChangeNote(needsCashChange, changeForCents, currency)
        : null;
    const combinedNotes =
      [trocoNote, form.notes?.trim()].filter(Boolean).join("\n") || undefined;

    const payload = {
      fulfillment,
      customerName: form.customerName,
      deliveryPhone: form.deliveryPhone,
      deliveryAddress: isPickup
        ? undefined
        : appendCityToAddress(
            form.deliveryAddress || "",
            pricingMode === "cities" ? selectedCity : null,
            cities.map((c) => c.name),
          ) || undefined,
      deliveryReference: isPickup ? undefined : form.deliveryReference || undefined,
      deliveryZoneId:
        !isPickup && pricingMode === "zones" && selectedZoneId ? selectedZoneId : undefined,
      deliveryCity:
        !isPickup && pricingMode === "cities" && selectedCity ? selectedCity : undefined,
      notes: combinedNotes,
      paymentMethod,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes,
        modifiers: item.modifiers.map((m) => ({
          modifierId: m.modifierId,
          outsideCup: m.outsideCup || undefined,
        })),
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
        toast.success(preferEnglish ? "Order placed!" : "Pedido enviado!", {
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

  const canSubmitDelivery =
    isPickup ||
    pricingMode === "zones" ||
    (pricingMode === "cities" && Boolean(selectedCity) && Boolean(feeQuote) && !quoting) ||
    (pricingMode === "radius" && Boolean(feeQuote) && !feeQuoteError && !quoting);

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
        <div
          className={`grid gap-2 ${
            deliveryFulfillmentEnabled && pickupEnabled ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {deliveryFulfillmentEnabled && (
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
              <span className="text-[11px]">{deliveryFeeHint}</span>
            </button>
          )}
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
              <p className="text-xs font-medium text-[var(--d-text-muted)]">
                {pickupLabel} indisponível
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[var(--d-text-soft)]">
                {pickupSubtitle}
              </p>
            </div>
          )}
        </div>
      </div>

      {!isPickup && pricingMode === "zones" && zones.length > 0 && (
        <div className={`${deliveryClasses.cardInner} space-y-2`}>
          <p className="text-sm font-semibold text-[var(--d-text-strong)]">Zona de entrega</p>
          <p className="text-xs text-[var(--d-text-muted)]">
            Selecione seu bairro para calcular o frete
          </p>
          <div className="space-y-1.5">
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelectedZoneId(zone.id)}
                className={`w-full flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                  selectedZoneId === zone.id
                    ? "border-[var(--d-accent-dark)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                    : "border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
                }`}
              >
                <span className="font-medium text-left whitespace-pre-line">
                  {zone.name}
                </span>
                <span
                  className={`font-semibold shrink-0 ${selectedZoneId === zone.id ? "text-[var(--d-accent-dark)]" : ""}`}
                >
                  {formatCurrency(zone.fee_cents, currency)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isPickup && pricingMode === "cities" && cities.length > 0 && (
        <div className={`${deliveryClasses.cardInner} space-y-2`}>
          <p className="text-sm font-semibold text-[var(--d-text-strong)]">
            {preferEnglish ? "Delivery city" : "Cidade de entrega"}
          </p>
          <p className="text-xs text-[var(--d-text-muted)]">
            {preferEnglish
              ? "Select your city — fee may be confirmed by our team"
              : "Selecione sua cidade — o frete pode ser confirmado pela equipe"}
          </p>
          <div className="space-y-1.5">
            {cities.map((city) => (
              <button
                key={city.name}
                type="button"
                onClick={() => {
                  applyCityFee(city.name);
                  if ((deliveryAddress || "").trim().length >= 5) {
                    requestFeeQuote(deliveryAddress || "", city.name);
                  }
                }}
                className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                  selectedCity === city.name
                    ? "border-[var(--d-accent-dark)] bg-[var(--d-bg-soft)] text-[var(--d-text-strong)]"
                    : "border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
                }`}
              >
                <span className="font-medium">{city.name}</span>
                <span
                  className={`font-semibold ${selectedCity === city.name ? "text-[var(--d-accent-dark)]" : ""}`}
                >
                  {formatCurrency(city.fee_cents, currency)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const lineTotal = getDeliveryItemLineTotal(item);
          const promoApplied =
            item.promoQuantity && item.promoPriceCents && item.quantity >= item.promoQuantity;
          return (
            <div key={item.lineId} className={deliveryClasses.card}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--d-text-strong)]">{item.name}</p>
                    {promoApplied && (
                      <p className="mt-0.5 text-xs font-semibold text-[var(--d-accent-dark)]">
                        Promoção aplicada: {item.promoQuantity} por {formatCurrency(item.promoPriceCents!, currency)}
                      </p>
                    )}
                    {item.modifiers.length > 0 && (
                      <p className="mt-1 text-xs text-[var(--d-text-muted)]">
                        {(() => {
                          const counts = new Map<string, number>();
                          for (const m of item.modifiers) {
                            const label = formatModifierDisplayName(
                              m.name,
                              m.outsideCup,
                              preferEnglish,
                            );
                            counts.set(label, (counts.get(label) || 0) + 1);
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
                      aria-label={
                        item.modifiers.length > 0
                          ? "Montar outro com complementos"
                          : "Adicionar um"
                      }
                      onClick={() => {
                        if (item.modifiers.length > 0) {
                          router.push(`/delivery/${branchSlug}/menu/${item.menuItemId}`);
                          return;
                        }
                        updateQuantity(item.lineId, item.quantity + 1);
                      }}
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
          <span className="text-[var(--d-text-muted)]">{feeLineLabel}</span>
          <span className={isPickup && pickupFeeCents === 0 ? "font-semibold text-[var(--d-accent-dark)]" : ""}>
            {isPickup
              ? pickupFeeCents === 0
                ? preferEnglish
                  ? "Free"
                  : "Grátis"
                : formatCurrency(pickupFeeCents, currency)
              : isAutoPricing && !feeQuote
                ? quoting
                  ? "…"
                  : "—"
                : formatCurrency(effectiveDeliveryFee, currency)}
          </span>
        </div>
        {isPickup && pickupFeeCents > 0 && pickupFeeReason && (
          <p className="text-xs text-[var(--d-text-muted)]">{pickupFeeReason}</p>
        )}
        {!isPickup && isAutoPricing && feeQuoteError && pricingMode === "radius" && (
          <p className="text-xs text-red-600">{feeQuoteError}</p>
        )}
        {!isPickup &&
          pricingMode === "cities" &&
          feeQuote?.fee_status === "pending" &&
          !quoting && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {feeQuote.message ||
                (preferEnglish
                  ? "Delivery fee pending confirmation"
                  : "Frete a confirmar pela equipe")}
            </p>
          )}
        <div className="flex justify-between border-t border-[var(--d-bg-elevated)] pt-2 text-base font-semibold text-[var(--d-text-strong)]">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>

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
                  if (value !== "cash") {
                    setNeedsCashChange(false);
                    setCashChangeFor("");
                  }
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
        {paymentMethod === "cash" && (
          <div className="rounded-2xl border border-[var(--d-border)] bg-[var(--d-bg-elevated)]/50 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer text-[var(--d-text)]">
              <input
                type="checkbox"
                className="rounded border-[var(--d-border)]"
                checked={needsCashChange}
                onChange={(e) => {
                  setNeedsCashChange(e.target.checked);
                  if (!e.target.checked) setCashChangeFor("");
                }}
              />
              {preferEnglish ? "Need change" : "Precisa de troco"}
            </label>
            {needsCashChange && (
              <div className="space-y-1">
                <label htmlFor="cashChangeFor" className={deliveryClasses.label}>
                  {preferEnglish ? "Change for" : "Troco para"}
                </label>
                <input
                  id="cashChangeFor"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  className={deliveryClasses.input}
                  placeholder={preferEnglish ? "e.g. 100" : "ex.: 100"}
                  value={cashChangeFor}
                  onChange={(e) => setCashChangeFor(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={`${deliveryClasses.cardInner} space-y-4`}>
        <h2 className="font-semibold text-[var(--d-text-strong)]">
          {isPickup ? "Dados para retirada" : "Dados de entrega"}
        </h2>

        <div className="space-y-1.5">
          <label htmlFor="customerName" className={deliveryClasses.label}>
            {preferEnglish ? "Full name" : "Nome completo"}
          </label>
          <input
            id="customerName"
            className={deliveryClasses.input}
            {...register("customerName", { required: true })}
          />
          {errors.customerName && (
            <p className={deliveryClasses.error}>
              {preferEnglish ? "Enter your name" : "Informe seu nome"}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="deliveryPhone" className={deliveryClasses.label}>
            {preferEnglish ? "Phone / WhatsApp" : "Telefone / WhatsApp"}
          </label>
          <input
            id="deliveryPhone"
            className={deliveryClasses.input}
            placeholder={preferEnglish ? "(508) 555-1234" : "(11) 99999-9999"}
            {...register("deliveryPhone", { required: true })}
          />
          {errors.deliveryPhone && (
            <p className={deliveryClasses.error}>
              {preferEnglish ? "Enter a valid phone" : "Informe um telefone válido"}
            </p>
          )}
        </div>

        {!isPickup && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="deliveryAddress" className={deliveryClasses.label}>
                {preferEnglish ? "Delivery address" : "Endereço de entrega"}
              </label>
              {isAutoPricing ? (
                <>
                  <AddressAutocomplete
                    id="deliveryAddress"
                    value={deliveryAddress || ""}
                    onChange={(v) =>
                      setValue("deliveryAddress", v, { shouldValidate: true, shouldDirty: true })
                    }
                    onPlaceSelected={(v) => {
                      setValue("deliveryAddress", v, { shouldValidate: true });
                      requestFeeQuote(v, selectedCity);
                    }}
                    placeholder={
                      preferEnglish
                        ? "Street, number, ZIP"
                        : "Rua, número, bairro, CEP"
                    }
                    country={autocompleteCountry || (preferEnglish ? "us" : undefined)}
                    biasLat={storeLat}
                    biasLng={storeLng}
                    inputClassName={deliveryClasses.input}
                    disabled={pricingMode === "cities" && !selectedCity}
                  />
                  {pricingMode === "cities" && !selectedCity && (
                    <p className="text-xs text-[var(--d-text-muted)]">
                      {preferEnglish
                        ? "Select your city first"
                        : "Selecione a cidade primeiro"}
                    </p>
                  )}
                  {quoting && (
                    <p className="text-xs text-[var(--d-text-muted)] flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {preferEnglish ? "Calculating delivery…" : "Calculando frete…"}
                    </p>
                  )}
                  {feeQuote && !quoting && (
                    <p
                      className={`text-xs font-medium ${
                        feeQuote.fee_status === "pending"
                          ? "text-amber-700"
                          : "text-[var(--d-accent-dark)]"
                      }`}
                    >
                      {preferEnglish ? "Delivery" : "Frete"}:{" "}
                      {formatCurrency(feeQuote.fee_cents, currency)}
                      {feeQuote.tier_label ? ` · ${feeQuote.tier_label}` : ""}
                      {feeQuote.fee_status === "pending"
                        ? preferEnglish
                          ? " · pending confirmation"
                          : " · a confirmar"
                        : ""}
                      {feeQuote.fee_status !== "pending" &&
                      feeQuote.distance_miles != null &&
                      pricingMode === "radius"
                        ? preferEnglish
                          ? ` (~${feeQuote.distance_miles} mi)`
                          : ` (cerca de ${feeQuote.distance_miles} mi)`
                        : ""}
                    </p>
                  )}
                </>
              ) : (
                <input
                  id="deliveryAddress"
                  className={deliveryClasses.input}
                  placeholder={preferEnglish ? "Street, number, city" : "Rua, número, bairro"}
                  {...register("deliveryAddress", { required: !isPickup })}
                />
              )}
              {errors.deliveryAddress && (
                <p className={deliveryClasses.error}>
                  {preferEnglish ? "Enter the address" : "Informe o endereço"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="deliveryReference" className={deliveryClasses.label}>
                {preferEnglish ? "Apt / notes" : "Complemento / referência"}
              </label>
              <input
                id="deliveryReference"
                className={deliveryClasses.input}
                placeholder={
                  preferEnglish ? "Apt, floor, landmark" : "Apto, bloco, ponto de referência"
                }
                {...register("deliveryReference")}
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <label htmlFor="notes" className={deliveryClasses.label}>
            {preferEnglish ? "Order notes" : "Observações do pedido"}
          </label>
          <input
            id="notes"
            className={deliveryClasses.input}
            placeholder={preferEnglish ? "Optional" : "Opcional"}
            {...register("notes")}
          />
        </div>

        {error && <p className={deliveryClasses.error}>{error}</p>}

        <button
          type="submit"
          disabled={loading || !canSubmitDelivery}
          className={`${deliveryClasses.btnPrimary} w-full py-3.5 text-base disabled:opacity-60`}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {preferEnglish ? "Placing order…" : "Enviando pedido..."}
            </>
          ) : (
            `${isPickup ? (preferEnglish ? "Confirm pickup" : "Confirmar retirada") : preferEnglish ? "Place order" : "Confirmar pedido"} · ${formatCurrency(total, currency)}`
          )}
        </button>
      </form>
    </div>
  );
}
