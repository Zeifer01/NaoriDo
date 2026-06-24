"use client";
/* eslint-disable react-hooks/todo, react-hooks/set-state-in-effect, react-doctor/prefer-useReducer, react-doctor/no-giant-component */

import { use, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@restai/ui/components/button";
import { Card, CardContent } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { useCartStore } from "@/stores/cart-store";
import { useCustomerStore } from "@/stores/customer-store";
import { formatCurrency } from "@/lib/utils";
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag, Ticket, Check, X, ChevronDown, Gift, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const TAX_RATE = 1800; // 18% IGV

function useCartPageLocalState() {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; name: string; type: string; discount_value: number; menu_item_id?: string | null } | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [pendingRedemptions, setPendingRedemptions] = useState<Array<{ id: string; reward_name: string; discount_type: string; discount_value: number }>>([]);
  const [appliedRedemption, setAppliedRedemption] = useState<{ id: string; reward_name: string; discount_type: string; discount_value: number } | null>(null);

  return {
    notes,
    setNotes,
    loading,
    setLoading,
    error,
    setError,
    sessionChecked,
    setSessionChecked,
    couponOpen,
    setCouponOpen,
    couponCode,
    setCouponCode,
    couponLoading,
    setCouponLoading,
    couponError,
    setCouponError,
    appliedCoupon,
    setAppliedCoupon,
    availableCoupons,
    setAvailableCoupons,
    pendingRedemptions,
    setPendingRedemptions,
    appliedRedemption,
    setAppliedRedemption,
  };
}

function SlideToConfirm({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const currentOffset = useRef(0);
  const thumbRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const THUMB_W = 64;
  const PAD = 4;

  const getMax = () => (trackRef.current ? trackRef.current.offsetWidth - THUMB_W - PAD * 2 : 250);

  const updateVisuals = (x: number) => {
    const max = getMax();
    const clamped = Math.max(0, Math.min(x, max));
    currentOffset.current = clamped;
    if (thumbRef.current) thumbRef.current.style.transform = `translateX(${clamped}px)`;
    if (labelRef.current) labelRef.current.style.opacity = `${1 - clamped / max}`;
    if (fillRef.current) fillRef.current.style.width = `${clamped + THUMB_W + PAD}px`;
  };

  const snapBack = () => {
    if (thumbRef.current) {
      thumbRef.current.style.transition = "transform 0.3s cubic-bezier(0.4,0,0.2,1)";
      thumbRef.current.style.transform = "translateX(0px)";
    }
    if (labelRef.current) {
      labelRef.current.style.transition = "opacity 0.3s";
      labelRef.current.style.opacity = "1";
    }
    if (fillRef.current) {
      fillRef.current.style.transition = "width 0.3s cubic-bezier(0.4,0,0.2,1)";
      fillRef.current.style.width = `${THUMB_W + PAD}px`;
    }
    currentOffset.current = 0;
    setTimeout(() => {
      if (thumbRef.current) thumbRef.current.style.transition = "none";
      if (labelRef.current) labelRef.current.style.transition = "none";
      if (fillRef.current) fillRef.current.style.transition = "none";
    }, 300);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (confirmed) return;
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX - currentOffset.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || confirmed) return;
    updateVisuals(e.clientX - startX.current);
  };

  const handlePointerUp = () => {
    if (!isDragging.current || confirmed) return;
    isDragging.current = false;
    const max = getMax();
    if (currentOffset.current >= max * 0.8) {
      updateVisuals(max);
      setConfirmed(true);
      onConfirm();
    } else {
      snapBack();
    }
  };

  return (
    <div
      ref={trackRef}
      className="relative h-16 rounded-2xl bg-foreground overflow-hidden select-none"
    >
      {/* Shimmer animation hint */}
      {!confirmed && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <div
            className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-background/10 to-transparent"
            style={{ animation: "slide-shimmer 2.5s ease-in-out infinite" }}
          />
        </div>
      )}

      {/* Fill behind thumb */}
      <div
        ref={fillRef}
        className="absolute inset-y-0 left-0 rounded-2xl"
        style={{
          width: THUMB_W + PAD,
          background: confirmed
            ? "oklch(0.55 0.18 142)"
            : "rgba(255,255,255,0.08)",
        }}
      />

      {/* Label — offset to center in the area right of the thumb */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingLeft: THUMB_W + PAD }}>
        <span
          ref={labelRef}
          className="text-sm font-semibold text-background/70 tracking-wide"
        >
          {confirmed ? "Pedido confirmado" : label}
        </span>
      </div>

      {/* Draggable thumb */}
      <div
        ref={thumbRef}
        className="absolute top-1 left-1 w-[60px] h-[56px] rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={{
          background: confirmed ? "oklch(0.55 0.18 142)" : "var(--background)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {confirmed ? (
          <Check className="h-6 w-6 text-white" />
        ) : (
          <div className="flex items-center -space-x-1.5">
            <ChevronRight className="h-5 w-5 text-foreground/40" />
            <ChevronRight className="h-5 w-5 text-foreground/70" />
            <ChevronRight className="h-5 w-5 text-foreground" />
          </div>
        )}
      </div>

    </div>
  );
}

export default function CartPage({
  params,
}: {
  params: Promise<{ branchSlug: string; tableCode: string }>;
}) {
  "use no memo";
  const { branchSlug, tableCode } = use(params);
  const router = useRouter();
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    getSubtotal,
    getTax,
    getTotal,
  } = useCartStore();
  const customerToken = useCustomerStore((s) => s.token);
  const setOrderId = useCustomerStore((s) => s.setOrderId);
  const clearSession = useCustomerStore((s) => s.clear);
  const addToOrderId = useCustomerStore((s) => s.addToOrderId);
  const setAddToOrderId = useCustomerStore((s) => s.setAddToOrderId);
  const isAddMode = Boolean(addToOrderId);
  const {
    notes,
    setNotes,
    loading,
    setLoading,
    error,
    setError,
    sessionChecked,
    setSessionChecked,
    couponOpen,
    setCouponOpen,
    couponCode,
    setCouponCode,
    couponLoading,
    setCouponLoading,
    couponError,
    setCouponError,
    appliedCoupon,
    setAppliedCoupon,
    availableCoupons,
    setAvailableCoupons,
    pendingRedemptions,
    setPendingRedemptions,
    appliedRedemption,
    setAppliedRedemption,
  } = useCartPageLocalState();

  const getToken = useCallback(() => {
    if (customerToken) return customerToken;
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("customer_token");
    }
    return null;
  }, [customerToken]);

  const validateSession = useCallback(() => {
    const token = getToken();
    if (!token) {
      clearSession();
      router.replace(`/${branchSlug}/${tableCode}`);
      return;
    }
    void fetch(`${API_URL}/api/customer/${branchSlug}/${tableCode}/check-session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((result) => {
        if (result.success && result.data.hasSession && result.data.status === "active") {
          setSessionChecked(true);
        } else {
          clearSession();
          router.replace(`/${branchSlug}/${tableCode}`);
        }
      })
      .catch(() => {
        clearSession();
        router.replace(`/${branchSlug}/${tableCode}`);
      });
  }, [getToken, clearSession, router, branchSlug, tableCode, setSessionChecked]);

  // Validate session on mount
  useEffect(() => {
    const timeout = setTimeout(() => {
      validateSession();
    }, 0);
    return () => clearTimeout(timeout);
  }, [validateSession]);

  const loadDiscounts = useCallback(() => {
    const token = getToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    void Promise.all([
      fetch(`${API_URL}/api/customer/my-coupons`, { headers }),
      fetch(`${API_URL}/api/customer/my-redemptions`, { headers }),
    ])
      .then(([couponsRes, redemptionsRes]) => Promise.all([
        couponsRes.json(),
        redemptionsRes.json(),
      ]))
      .then(([couponsData, redemptionsData]) => {
        if (couponsData.success && couponsData.data?.length > 0) {
          setAvailableCoupons(couponsData.data);
        }
        if (redemptionsData.success && redemptionsData.data?.length > 0) {
          setPendingRedemptions(redemptionsData.data);
        }
      })
      .catch(() => {
        // Ignore discounts errors
      });
  }, [getToken, setAvailableCoupons, setPendingRedemptions]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadDiscounts();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadDiscounts]);

  const subtotal = getSubtotal();
  const tax = getTax(TAX_RATE);
  const total = getTotal(TAX_RATE);

  const handleValidateCoupon = () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    const token = getToken();
    void fetch(`${API_URL}/api/customer/validate-coupon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ code: couponCode.toUpperCase() }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setCouponError(data.error?.message || "Cupom inválido");
          setCouponLoading(false);
          return;
        }
        setAppliedCoupon({
          code: data.data.code,
          name: data.data.name,
          type: data.data.type,
          discount_value: data.data.discount_value || 0,
          menu_item_id: data.data.menu_item_id || null,
        });
        setCouponCode("");
        setCouponLoading(false);
      })
      .catch(() => {
        setCouponError("Erro ao validar cupom");
        setCouponLoading(false);
      });
  };

  function getCouponDiscount(): number {
    if (!appliedCoupon) return 0;
    let discount = 0;
    switch (appliedCoupon.type) {
      case "percentage":
        discount = Math.round(subtotal * (appliedCoupon.discount_value / 100));
        break;
      case "fixed":
        discount = Math.min(appliedCoupon.discount_value, subtotal);
        break;
      case "item_free": {
        if (appliedCoupon.menu_item_id) {
          const match = items.find((i) => i.menuItemId === appliedCoupon.menu_item_id);
          if (match) discount = match.unitPrice;
        } else if (items.length > 0) {
          const cheapest = items.reduce((min, i) => (i.unitPrice < min.unitPrice ? i : min), items[0]);
          discount = cheapest.unitPrice;
        }
        break;
      }
      case "item_discount": {
        if (appliedCoupon.menu_item_id) {
          const match = items.find((i) => i.menuItemId === appliedCoupon.menu_item_id);
          if (match) discount = Math.round(match.unitPrice * match.quantity * (appliedCoupon.discount_value / 100));
        }
        break;
      }
      case "buy_x_get_y": {
        // Server calculates exact discount — show approximate as "promo applied"
        discount = 0;
        break;
      }
      default:
        discount = 0;
    }
    return Math.min(discount, subtotal);
  }

  const couponDiscount = getCouponDiscount();

  function getRedemptionDiscount(): number {
    if (!appliedRedemption) return 0;
    const remaining = subtotal - couponDiscount;
    if (remaining <= 0) return 0;
    if (appliedRedemption.discount_type === "percentage") {
      return Math.round(remaining * (appliedRedemption.discount_value / 100));
    }
    return Math.min(appliedRedemption.discount_value, remaining);
  }

  const redemptionDiscount = getRedemptionDiscount();
  const totalDiscount = couponDiscount + redemptionDiscount;
  // IGV is calculated on (subtotal - discount) to match backend logic
  const taxableBase = subtotal - totalDiscount;
  const adjustedTax = totalDiscount > 0 ? Math.round((taxableBase * TAX_RATE) / 10000) : tax;
  const adjustedTotal = totalDiscount > 0 ? taxableBase + adjustedTax : total;

  const handleConfirmOrder = async () => {
    setLoading(true);
    setError(null);
    const token = getToken();

    // Fase C: se houver pedido aberto editável, ADICIONA itens a ele em vez de criar novo
    if (isAddMode && addToOrderId) {
      try {
        let lastOrderNumber: string | null = null;
        for (const item of items) {
          const res = await fetch(
            `${API_URL}/api/customer/orders/${addToOrderId}/items`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                notes: notes[item.menuItemId] || undefined,
                modifiers: item.modifiers.map((m) => ({
                  modifierId: m.modifierId,
                })),
              }),
            },
          );
          const data = await res.json();
          if (!data.success) {
            const code = data.error?.code;
            const message =
              code === "CONFLICT"
                ? "O pedido já está sendo preparado. Vamos criar um novo pedido."
                : data.error?.message || "Erro ao adicionar item ao pedido";
            // Se o pedido não é mais editável, limpa o modo "add" para criar pedido novo
            if (code === "CONFLICT") {
              setAddToOrderId(null);
            }
            setError(message);
            setLoading(false);
            return;
          }
          lastOrderNumber = data.data?.order_number ?? lastOrderNumber;
        }

        clearCart();
        setAddToOrderId(null);
        toast.success("Itens adicionados ao pedido", {
          description: lastOrderNumber ? `Pedido #${lastOrderNumber}` : undefined,
        });
        setLoading(false);
        router.push(`/${branchSlug}/${tableCode}/status`);
        return;
      } catch {
        setError("Erro inesperado ao adicionar itens");
        setLoading(false);
        return;
      }
    }

    void fetch(`${API_URL}/api/customer/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        type: "dine_in",
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: notes[item.menuItemId] || undefined,
          modifiers: item.modifiers.map((m) => ({
            modifierId: m.modifierId,
          })),
        })),
        ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
        ...(appliedRedemption ? { redemptionId: appliedRedemption.id } : {}),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setError(data.error?.message || "Erro ao criar pedido");
          setLoading(false);
          return;
        }

        if (data.data?.id) {
          setOrderId(data.data.id);
        }

        clearCart();
        toast.success("Pedido enviado para a cozinha", {
          description: `Pedido #${data.data?.order_number || ""} recebido`,
        });
        setLoading(false);
        router.push(`/${branchSlug}/${tableCode}/status`);
      })
      .catch(() => {
        setError("Erro inesperado");
        setLoading(false);
      });
  };

  if (items.length === 0) {
    return (
      <div className="p-6 mt-12 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Carrinho vazio</h2>
        <p className="text-muted-foreground mb-6">Adicione produtos do cardápio</p>
        <Button
          variant="outline"
          onClick={() => router.push(`/${branchSlug}/${tableCode}/menu`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Cardápio
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/${branchSlug}/${tableCode}/menu`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">
          {isAddMode ? "Adicionar ao Pedido" : "Seu Pedido"}
        </h1>
        <span className="text-sm text-muted-foreground">({items.length} {items.length === 1 ? "item" : "itens"})</span>
      </div>

      {isAddMode && (
        <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-sm">
          <p className="font-medium text-foreground">Adicionando ao seu pedido atual</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Os itens abaixo serão incluídos no pedido em andamento. Cupons e recompensas não se aplicam.
          </p>
          <button
            type="button"
            className="text-xs text-primary font-medium mt-2 underline-offset-2 hover:underline"
            onClick={() => setAddToOrderId(null)}
          >
            Criar um pedido novo
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Cart items */}
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.menuItemId}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{item.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(item.unitPrice)} cada
                  </p>
                  {item.modifiers.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.modifiers.map((m) => m.name).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-7 text-center font-bold text-sm">
                    {item.quantity}
                  </span>
                  <Button
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeItem(item.menuItemId)}
                    className="text-destructive hover:text-destructive/80 mt-1 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <Input
                  placeholder="Observações (ex: sem cebola)"
                  className="text-sm h-9"
                  value={notes[item.menuItemId] || ""}
                  onChange={(e) =>
                    setNotes({ ...notes, [item.menuItemId]: e.target.value })
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Coupon section */}
      {!isAddMode && (
      <Card>
        <CardContent className="p-4">
          <button
            onClick={() => setCouponOpen(!couponOpen)}
            className="flex items-center gap-2 text-sm font-medium text-foreground w-full"
          >
            <Ticket className="h-4 w-4 text-primary" />
            Tenho um cupom
            {appliedCoupon && (
              <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                Aplicado
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 ${
                couponOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
            style={{ gridTemplateRows: couponOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
            <div className="pt-3 space-y-2">
              {availableCoupons.length > 0 && !appliedCoupon && (
                <div className="space-y-2 mb-3">
                  <p className="text-xs font-medium text-muted-foreground">Cupons disponíveis:</p>
                  {availableCoupons.map((coupon: any) => (
                    <button
                      key={coupon.id}
                      onClick={() => {
                        setAppliedCoupon({
                          code: coupon.code,
                          name: coupon.name,
                          type: coupon.type,
                          discount_value: coupon.discount_value || 0,
                          menu_item_id: coupon.menu_item_id || null,
                        });
                      }}
                      className="w-full flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3 hover:bg-primary/10 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm font-medium">{coupon.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{coupon.code}</p>
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {coupon.type === "percentage" || coupon.type === "item_discount"
                          ? `${coupon.discount_value}%`
                          : coupon.type === "item_free"
                            ? "Grátis"
                            : coupon.type === "buy_x_get_y"
                              ? "Promo"
                              : formatCurrency(coupon.discount_value || 0)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">{appliedCoupon.code}</p>
                      <p className="text-xs text-green-600 dark:text-green-400">{appliedCoupon.name} - {formatCurrency(couponDiscount)} de desconto</p>
                    </div>
                  </div>
                  <button onClick={() => setAppliedCoupon(null)} className="p-1">
                    <X className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Digite seu código"
                      value={couponCode}
                      onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); }}
                      className="text-sm h-9 font-mono"
                    />
                    <Button
                      size="sm"
                      onClick={handleValidateCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="h-9 px-4"
                    >
                      {couponLoading ? "..." : "Aplicar"}
                    </Button>
                  </div>
                  {couponError && (
                    <p className="text-xs text-destructive">{couponError}</p>
                  )}
                </>
              )}
            </div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Reward redemptions section */}
      {!isAddMode && (pendingRedemptions.length > 0 || appliedRedemption) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <Gift className="h-4 w-4 text-primary" />
              Recompensas Resgatadas
              {appliedRedemption && (
                <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                  Aplicada
                </span>
              )}
            </div>

            {appliedRedemption ? (
              <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">{appliedRedemption.reward_name}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {appliedRedemption.discount_type === "percentage"
                        ? `${appliedRedemption.discount_value}% de desconto`
                        : `${formatCurrency(appliedRedemption.discount_value)} de desconto`}
                      {redemptionDiscount > 0 && ` · -${formatCurrency(redemptionDiscount)}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setAppliedRedemption(null)} className="p-1">
                  <X className="h-4 w-4 text-green-600 dark:text-green-400" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingRedemptions.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setAppliedRedemption(r)}
                    className="w-full flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3 hover:bg-primary/10 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.reward_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.discount_type === "percentage"
                          ? `${r.discount_value}% de desconto`
                          : `${formatCurrency(r.discount_value)} de desconto`}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-primary">Aplicar</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          {couponDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-600 dark:text-green-400">Cupom ({appliedCoupon?.code})</span>
              <span className="font-medium text-green-600 dark:text-green-400">-{formatCurrency(couponDiscount)}</span>
            </div>
          )}
          {redemptionDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-600 dark:text-green-400">Recompensa</span>
              <span className="font-medium text-green-600 dark:text-green-400">-{formatCurrency(redemptionDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Impostos (18%)</span>
            <span className="font-medium">{formatCurrency(totalDiscount > 0 ? adjustedTax : tax)}</span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(adjustedTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fixed bottom — Slide to confirm */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-md border-t border-border">
        <div className="max-w-lg mx-auto">
          {loading ? (
            <div className="h-14 rounded-2xl bg-foreground flex items-center justify-center gap-2">
              <div className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
              <span className="text-background font-semibold">
                {isAddMode ? "Adicionando itens..." : "Enviando pedido..."}
              </span>
            </div>
          ) : (
            <SlideToConfirm
              onConfirm={handleConfirmOrder}
              label={
                isAddMode
                  ? `Deslize para adicionar · +${formatCurrency(subtotal)}`
                  : `Deslize para confirmar · ${formatCurrency(adjustedTotal)}`
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
