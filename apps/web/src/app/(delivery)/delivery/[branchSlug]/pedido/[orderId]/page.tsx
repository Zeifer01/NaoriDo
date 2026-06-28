"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, CheckCircle2, Clock, ChefHat, X } from "lucide-react";
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
  ready: "bg-[#EDF3E8] text-[#5C7A5F] ring-[#D8E6D4]",
  served: "bg-[#EDF3E8] text-[#5C7A5F] ring-[#D8E6D4]",
  completed: "bg-[#F0EBE3] text-[#6B7268] ring-[#EDE8DF]",
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
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ phone: phone.trim() });
    void fetch(
      `${API_URL}/api/delivery/${branchSlug}/orders/${orderId}/status?${qs}`,
    )
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
    if (!verified || !order || order.status === "completed" || order.status === "cancelled") {
      return;
    }
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

  const canEdit = order && EDITABLE_STATUSES.includes(order.status);

  return (
    <div className="space-y-5 pb-4">
      <div className={deliveryClasses.cardInner}>
        <h1 className="text-xl font-semibold text-[#2F342E]">Acompanhar pedido</h1>
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
          <div className={`${deliveryClasses.cardInner} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-[#6B7268]">Pedido</p>
                <p className="text-lg font-semibold text-[#2F342E]">#{order.order_number}</p>
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
                <span className="text-[#6B7268]">Cliente:</span> {order.customer_name}
              </p>
              <p>
                <span className="text-[#6B7268]">Endereço:</span> {order.delivery_address}
              </p>
              {order.delivery_reference && (
                <p>
                  <span className="text-[#6B7268]">Referência:</span>{" "}
                  {order.delivery_reference}
                </p>
              )}
              <p>
                <span className="text-[#6B7268]">Total:</span>{" "}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-[#2F342E]">Itens</h2>
              {canEdit && (
                <span className="text-xs text-[#7A9B7E]">Toque em × para remover</span>
              )}
            </div>

            {error && <p className={deliveryClasses.error}>{error}</p>}

            {(order.items || []).map((item: any) => (
              <div key={item.id}>
                <div
                  className="flex items-center justify-between rounded-xl border border-[#EDE8DF] bg-white/80 px-3 py-2.5 text-sm"
                >
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#5C7A5F]">
                      {formatCurrency(item.total, currency)}
                    </span>
                    {canEdit && (order.items || []).length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remover ${item.name}`}
                        onClick={() => setConfirmRemoveId(item.id)}
                        disabled={removingItemId !== null}
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-[#A8B5A0] transition hover:bg-[#F5E8E8] hover:text-[#8A4A4A] disabled:opacity-40"
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
                        className="flex-1 rounded-lg border border-[#EDE8DF] py-1.5 text-xs font-medium text-[#6B7268] transition hover:bg-[#F5F0EA] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              { key: "pending", icon: Clock, label: "Recebido" },
              { key: "preparing", icon: ChefHat, label: "Preparando" },
              { key: "ready", icon: CheckCircle2, label: "Pronto" },
            ].map(({ key, icon: Icon, label }) => {
              const steps = ["pending", "confirmed", "preparing", "ready", "served", "completed"];
              const currentIdx = steps.indexOf(order.status);
              const stepIdx = steps.indexOf(key === "pending" ? "pending" : key);
              const active = currentIdx >= stepIdx && order.status !== "cancelled";
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-xl border p-2.5",
                    active
                      ? "border-[#7A9B7E] bg-[#EDF3E8] text-[#5C7A5F]"
                      : "border-[#EDE8DF] bg-white/50 text-[#9A9F96] opacity-70",
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
