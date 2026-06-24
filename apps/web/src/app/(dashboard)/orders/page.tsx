"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { RefreshCw, RotateCcw } from "lucide-react";
import { useOrders, useUpdateOrderStatus, useDeleteOrder, useResetOrderSequence } from "@/hooks/use-orders";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { usePrintReceipt } from "@/components/print-ticket";
import { apiFetch } from "@/lib/fetcher";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OrderFilters } from "./_components/order-filters";
import { OrdersTable } from "./_components/orders-table";
import { EditOrderSheet } from "./_components/edit-order-sheet";
import { PaymentDialog } from "../payments/_components/payment-dialog";
import { toast } from "sonner";

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [chargeOrderId, setChargeOrderId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<any | null>(null);
  const [resetSequenceOpen, setResetSequenceOpen] = useState(false);

  const { data, isLoading, error, refetch } = useOrders({ status: statusFilter, page, limit: PAGE_SIZE });
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteOrder();
  const resetSequence = useResetOrderSequence();
  const { data: orgSettings } = useOrgSettings();
  const { data: branchSettings } = useBranchSettings();
  const printReceipt = usePrintReceipt();
  const updatingOrderId = updateStatus.isPending ? updateStatus.variables?.id ?? null : null;
  const updatingTargetStatus = updateStatus.isPending ? updateStatus.variables?.status ?? null : null;

  const handlePrintReceipt = async (order: any) => {
    try {
      const orderDetail = await apiFetch(`/api/orders/${order.id}`);
      const org = orgSettings as any;
      const branch = branchSettings as any;
      const items = (orderDetail as any)?.items || [];
      printReceipt({
        businessName: org?.name || "Restaurante",
        ruc: org?.settings?.ruc || undefined,
        address: branch?.address || undefined,
        orderNumber: order.order_number || order.id,
        createdAt: order.created_at || new Date().toISOString(),
        items: items.map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
        })),
        subtotal: order.subtotal ?? 0,
        tax: order.tax ?? 0,
        total: order.total ?? 0,
        customerName: order.customer_name || undefined,
      });
    } catch {
      const org = orgSettings as any;
      printReceipt({
        businessName: org?.name || "Restaurante",
        orderNumber: order.order_number || order.id,
        createdAt: order.created_at || new Date().toISOString(),
        items: [],
        subtotal: order.subtotal ?? 0,
        tax: order.tax ?? 0,
        total: order.total ?? 0,
        customerName: order.customer_name || undefined,
      });
    }
  };

  const orders: any[] = data?.orders ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleDeleteOrder = async () => {
    if (!deleteOrderTarget) return;
    try {
      await deleteOrder.mutateAsync(deleteOrderTarget.id);
      toast.success(`Pedido #${deleteOrderTarget.order_number || deleteOrderTarget.id} excluído`);
      setDeleteOrderTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir pedido");
    }
  };

  const handleResetSequence = async () => {
    try {
      const result = await resetSequence.mutateAsync();
      toast.success(
        result.deletedCount > 0
          ? `${result.deletedCount} pedido(s) removido(s). Próximo pedido será #${result.nextOrderNumber}.`
          : "Sequência reiniciada. Próximo pedido será #1.",
      );
      setResetSequenceOpen(false);
      setPage(1);
    } catch (err: any) {
      toast.error(err.message || "Erro ao reiniciar sequência");
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Pedidos" />
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">Erro ao carregar pedidos: {(error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Gerencie e acompanhe todos os pedidos"
        actions={
          <Button variant="outline" onClick={() => setResetSequenceOpen(true)}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reiniciar sequência
          </Button>
        }
      />

      <OrderFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilter}
      />

      <OrdersTable
        orders={orders}
        isLoading={isLoading}
        search={search}
        pagination={pagination}
        page={page}
        onPageChange={setPage}
        updateStatusPending={updateStatus.isPending}
        updatingOrderId={updatingOrderId}
        updatingTargetStatus={updatingTargetStatus}
        activeChargeOrderId={chargeOrderId}
        onUpdateStatus={(id, status) => updateStatus.mutate({ id, status })}
        onPrintReceipt={handlePrintReceipt}
        onCharge={(order) => setChargeOrderId(order.id)}
        onEdit={(order) => setEditOrderId(order.id)}
        onDelete={(order) => setDeleteOrderTarget(order)}
        deletePending={deleteOrder.isPending}
        deletingOrderId={deleteOrder.isPending ? deleteOrder.variables ?? null : null}
      />

      <EditOrderSheet
        orderId={editOrderId}
        onOpenChange={(open) => {
          if (!open) setEditOrderId(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteOrderTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteOrderTarget(null);
        }}
        title="Excluir pedido"
        description={`Excluir permanentemente o pedido #${deleteOrderTarget?.order_number || deleteOrderTarget?.id}? Pagamentos e itens vinculados também serão removidos.`}
        onConfirm={handleDeleteOrder}
        loading={deleteOrder.isPending}
      />

      <ConfirmDialog
        open={resetSequenceOpen}
        onOpenChange={setResetSequenceOpen}
        title="Reiniciar sequência de pedidos"
        description="Isso exclui todos os pedidos desta filial e faz o próximo pedido começar em #1. Use para limpar pedidos de teste antes de operar com clientes reais."
        onConfirm={handleResetSequence}
        loading={resetSequence.isPending}
        confirmLabel="Reiniciar sequência"
      />

      <PaymentDialog
        open={!!chargeOrderId}
        onOpenChange={(v) => { if (!v) setChargeOrderId(null); }}
        preselectedOrderId={chargeOrderId ?? undefined}
      />
    </div>
  );
}
