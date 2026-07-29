"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  ChefHat,
  X,
  Plus,
  Minus,
  ShoppingBag,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useDeliveryStore } from "@/stores/delivery-store";
import { useDeliveryBranch } from "@/hooks/use-delivery-branch";
import { deliveryClasses } from "@/app/(delivery)/_components/delivery-theme";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const statusLabels: Record<string, string> = {
  pending: "Recebido",
  confirmed: "Confirmado",
  preparing: "Preparando",
  ready: "Pronto para entrega",
  served: "Saiu para entrega",
  completed: "Entregue",
  cancelled: "Cancelado",
};

const statusBadge: Record<string, string> = {
  pending: "bg-[#F5EDD6] text-[#8A7340] ring-[#E8DFC8]",
  confirmed: "bg-[#E3EEF5] text-[#4A6B7A] ring-[#D0E0EA]",
  preparing: "bg-[#EDE8F5] text-[#6B5A7A] ring-[#DDD4EA]",
  ready: "bg-[var(--d-bg-soft)] text-[var(--d-accent-dark)] ring-[var(--d-border-soft)]",
  served: "bg-[var(--d-bg-soft)] text-[var(--d-accent-dark)] ring-[var(--d-border-soft)]",
  completed: "bg-[var(--d-bg-elevated)] text-[var(--d-text-muted)] ring-[var(--d-border)]",
  cancelled: "bg-[#F5E8E8] text-[#8A4A4A] ring-[#EAD4D4]",
};

const EDITABLE_STATUSES = ["pending", "confirmed"];

export default function DeliveryOrderStatusPage({
  params,
}: {
  params: Promise<{ branchSlug: string; orderId: string }>;
}) {
  const { branchSlug, orderId } = use(params);
  const storedPhone = useDeliveryStore((s) => s.customerPhone);
  const { currency } = useDeliveryBranch(branchSlug);

  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // Remove item
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Add items
  const [showAddItems, setShowAddItems] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [additions, setAdditions] = useState<Record<string, number>>({});
  const [addingItems, setAddingItems] = useState(false);

  const fetchStatus = useCallback(() => {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ phone: phone.trim() });
    void fetch(`${API_URL}/api/delivery/${branchSlug}/orders/${orderId}/status?${qs}`)
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) {
          setError(result.error?.message || "Não foi possível carregar o pedido");
          setVerified(false);
          setOrder(null);
        } else {
          setOrder(result.data);
          setVerified(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Erro ao consultar pedido");
        setLoading(false);
      });
  }, [branchSlug, orderId, phone]);

  useEffect(() => {
    if (storedPhone) setPhone(storedPhone);
  }, [storedPhone]);

  useEffect(() => {
    if (storedPhone) fetchStatus();
  }, [storedPhone, fetchStatus]);

  useEffect(() => {
    if (!verified || !order || order.status === "completed" || order.status === "cancelled") return;
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [verified, order, fetchStatus]);

  const handleRemoveItem = async (itemId: string) => {
    if (!phone.trim()) return;
    setRemovingItemId(itemId);
    setConfirmRemoveId(null);
    const qs = new URLSearchParams({ phone: phone.trim() });
    try {
      const res = await fetch(
        `${API_URL}/api/delivery/${branchSlug}/orders/${orderId}/items/${itemId}?${qs}`,
        { method: "DELETE" },
      );
      const result = await res.json();
      if (result.success) {
        setOrder(result.data);
      } else {
        setError(result.error?.message || "Erro ao remover item");
      }
    } catch {
      setError("Erro ao remover item");
    } finally {
      setRemovingItemId(null);
    }
  };

  const loadMenu = useCallback(async () => {
    if (menuItems.length > 0) return;
    setMenuLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/delivery/${branchSlug}/menu`);
      const result = await res.json();
      if (result.success) {
        setMenuItems(result.data.items.filter((i: any) => i.is_available));
        setMenuCategories(
          [...result.data.categories]
            .filter((c: any) => c.is_active)
            .sort((a: any, b: any) => a.sort_order - b.sort_order),
        );
      }
    } finally {
      setMenuLoading(false);
    }
  }, [branchSlug, menuItems.length]);

  const toggleAddItems = () => {
    if (!showAddItems) void loadMenu();
    setShowAddItems((v) => !v);
    setAdditions({});
  };

  const changeAddition = (itemId: string, delta: number) => {
    setAdditions((prev) => {
      const next = Math.max(0, (prev[itemId] || 0) + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const totalAdditions = Object.values(additions).reduce((a, b) => a + b, 0);

  const handleAddItems = async () => {
    if (totalAdditions === 0 || !phone.trim()) return;
    setAddingItems(true);
    setError(null);
    const qs = new URLSearchParams({ phone: phone.trim() });
    const items = Object.entries(additions).map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
    }));
    try {
      const res = await fetch(
        `${API_URL}/api/delivery/${branchSlug}/orders/${orderId}/items?${qs}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        },
      );
      const result = await res.json();
      if (result.success) {
        setOrder(result.data);
        setShowAddItems(false);
        setAdditions({});
      } else {
        setError(result.error?.message || "Erro ao adicionar itens");
      }
    } catch {
      setError("Erro ao adicionar itens");
    } finally {
      setAddingItems(false);
    }
  };

  const canEdit = order && EDITABLE_STATUSES.includes(order.status);
  const visibleItems =
    selectedCategory === "all"
      ? menuItems
      : menuItems.filter((i: any) => i.category_id === selectedCategory);

  return (
    <div className="space-y-5 pb-4">
      <div className={deliveryClasses.cardInner}>
        <h1 className="text-xl font-semibold text-[var(--d-text-strong)]">Acompanhar pedido</h1>
        <p className={`mt-2 ${deliveryClasses.muted}`}>
          Informe o telefone usado no pedido para ver o status em tempo real.
        </p>
      </div>

      {!verified && (
        <div className={`${deliveryClasses.cardInner} space-y-3`}>
          <div className="space-y-1.5">
            <label htmlFor="phone" className={deliveryClasses.label}>
              Telefone do pedido
            </label>
            <input
              id="phone"
              className={deliveryClasses.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          {error && <p className={deliveryClasses.error}>{error}</p>}
          <button
            type="button"
            className={`${deliveryClasses.btnPrimary} w-full py-3 text-sm`}
            onClick={fetchStatus}
            disabled={loading || !phone.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Consultar pedido
          </button>
        </div>
      )}

      {verified && order && (
        <>
          {/* Order summary */}
          <div className={`${deliveryClasses.cardInner} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-[var(--d-text-muted)]">Pedido</p>
                <p className="text-lg font-semibold text-[var(--d-text-strong)]">#{order.order_number}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                  statusBadge[order.status] || statusBadge.pending
                }`}
              >
                {statusLabels[order.status] || order.status}
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-[var(--d-text-muted)]">Cliente:</span> {order.customer_name}
              </p>
              <p>
                <span className="text-[var(--d-text-muted)]">Endereço:</span> {order.delivery_address}
              </p>
              {order.delivery_reference && (
                <p>
                  <span className="text-[var(--d-text-muted)]">Referência:</span> {order.delivery_reference}
                </p>
              )}
              <p>
                <span className="text-[var(--d-text-muted)]">Total:</span>{" "}
                {formatCurrency(order.total, currency)}
              </p>
            </div>
            <button
              type="button"
              className={`${deliveryClasses.btnSecondary} px-4 py-2 text-sm`}
              onClick={fetchStatus}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

          {/* Items list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-[var(--d-text-strong)]">Itens</h2>
              {canEdit && (
                <span className="text-xs text-[var(--d-accent)]">Toque em × para remover</span>
              )}
            </div>

            {error && <p className={deliveryClasses.error}>{error}</p>}

            {(order.items || []).map((item: any) => (
              <div key={item.id}>
                <div className="flex items-center justify-between rounded-xl border border-[var(--d-border)] bg-[var(--d-card)] px-3 py-2.5 text-sm">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--d-accent-dark)]">
                      {formatCurrency(item.total, currency)}
                    </span>
                    {canEdit && (order.items || []).length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remover ${item.name}`}
                        onClick={() => setConfirmRemoveId(item.id)}
                        disabled={removingItemId !== null}
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-[var(--d-placeholder)] transition hover:bg-[#F5E8E8] hover:text-[#8A4A4A] disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {confirmRemoveId === item.id && (
                  <div className="mt-1 rounded-xl border border-[#EAD4D4] bg-[#FDF5F5] px-3 py-3 text-sm">
                    <p className="text-[#8A4A4A]">
                      Remover <strong>{item.name}</strong> do pedido?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        disabled={removingItemId !== null}
                        className="flex-1 rounded-lg bg-[#8A4A4A] py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        {removingItemId === item.id ? (
                          <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Sim, remover"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        disabled={removingItemId !== null}
                        className="flex-1 rounded-lg border border-[var(--d-border)] py-1.5 text-xs font-medium text-[var(--d-text-muted)] transition hover:bg-[var(--d-bg-elevated)] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add items section */}
          {canEdit && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={toggleAddItems}
                className={`${deliveryClasses.btnSecondary} w-full py-3 text-sm`}
              >
                {showAddItems ? (
                  <>
                    <X className="mr-2 h-4 w-4" />
                    Fechar
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar mais itens
                  </>
                )}
              </button>

              {showAddItems && (
                <div className="rounded-2xl border border-[var(--d-border)] bg-[var(--d-card)] p-4 space-y-4">
                  {menuLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-[var(--d-accent-dark)]" />
                    </div>
                  ) : (
                    <>
                      {/* Category filter */}
                      {menuCategories.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                          <button
                            onClick={() => setSelectedCategory("all")}
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                              selectedCategory === "all"
                                ? "bg-[var(--d-accent-dark)] text-white"
                                : "border border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
                            }`}
                          >
                            Todos
                          </button>
                          {menuCategories.map((cat: any) => (
                            <button
                              key={cat.id}
                              onClick={() => setSelectedCategory(cat.id)}
                              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                                selectedCategory === cat.id
                                  ? "bg-[var(--d-accent-dark)] text-white"
                                  : "border border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-text-muted)]"
                              }`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Items */}
                      <div className="space-y-2">
                        {visibleItems.length === 0 ? (
                          <p className="py-4 text-center text-sm text-[var(--d-placeholder)]">
                            Nenhum item disponível nesta categoria.
                          </p>
                        ) : (
                          visibleItems.map((item: any) => {
                            const qty = additions[item.id] || 0;
                            return (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 rounded-xl border border-[var(--d-border)] bg-[var(--d-card-solid)] px-3 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium leading-snug text-[var(--d-text-strong)]">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-[var(--d-accent-dark)]">
                                    {formatCurrency(item.price, currency)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {qty > 0 && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => changeAddition(item.id, -1)}
                                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--d-border)] bg-[var(--d-card-solid)] text-[var(--d-accent-dark)] transition active:scale-95"
                                      >
                                        <Minus className="h-3.5 w-3.5" />
                                      </button>
                                      <span className="min-w-[1rem] text-center text-sm font-semibold text-[var(--d-text-strong)]">
                                        {qty}
                                      </span>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => changeAddition(item.id, 1)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--d-accent-dark)] text-white transition active:scale-95"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Confirm button */}
                      {totalAdditions > 0 && (
                        <button
                          type="button"
                          onClick={handleAddItems}
                          disabled={addingItems}
                          className={`${deliveryClasses.btnPrimary} w-full py-3 text-sm`}
                        >
                          {addingItems ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ShoppingBag className="mr-2 h-4 w-4" />
                          )}
                          Adicionar {totalAdditions}{" "}
                          {totalAdditions === 1 ? "item" : "itens"} ao pedido
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Progress steps */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              { key: "pending", icon: Clock, label: "Recebido" },
              { key: "preparing", icon: ChefHat, label: "Preparando" },
              { key: "ready", icon: CheckCircle2, label: "Pronto" },
            ].map(({ key, icon: Icon, label }) => {
              const steps = ["pending", "confirmed", "preparing", "ready", "served", "completed"];
              const currentIdx = steps.indexOf(order.status);
              const stepIdx = steps.indexOf(key);
              const active = currentIdx >= stepIdx && order.status !== "cancelled";
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-xl border p-2.5",
                    active
                      ? "border-[var(--d-accent)] bg-[var(--d-bg-soft)] text-[var(--d-accent-dark)]"
                      : "border-[var(--d-border)] bg-white/50 text-[var(--d-placeholder)] opacity-70",
                  )}
                >
                  <Icon className="mx-auto mb-1 h-4 w-4" />
                  {label}
                </div>
              );
            })}
          </div>
        </>
      )}

      <Link
        href={`/delivery/${branchSlug}/menu`}
        className={`${deliveryClasses.btnSecondary} w-full py-3 text-center text-sm`}
      >
        Fazer novo pedido
      </Link>
    </div>
  );
}
