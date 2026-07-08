"use client";

import { useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { useOrders, useUpdateOrderStatus, useDeleteOrder, useResetOrderSequence } from "@/hooks/use-orders";
import { useOrgSettings, useBranchSettings } from "@/hooks/use-settings";
import { usePrintReceipt } from "@/components/print-ticket";
import { apiFetch } from "@/lib/fetcher";
import { downloadXlsx } from "@/lib/export-xlsx";
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
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [chargeOrderId, setChargeOrderId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<any | null>(null);
  const [resetSequenceOpen, setResetSequenceOpen] = useState(false);

  const { data, isLoading, error, refetch } = useOrders({ status: statusFilter, page, limit: PAGE_SIZE, startDate: startDate || undefined, endDate: endDate || undefined });
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

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    setPage(1);
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
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
        result.archivedCount > 0
          ? `${result.archivedCount} pedido(s) da ${result.sessionName} arquivado(s). Próximos pedidos começam em #1 (${result.nextSessionName}).`
          : `Sequência reiniciada. Próximos pedidos serão da ${result.nextSessionName}, começando em #1.`,
      );
      setResetSequenceOpen(false);
      setPage(1);
    } catch (err: any) {
      toast.error(err.message || "Erro ao arquivar sessão");
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const orders: any[] = await apiFetch(`/api/orders/export?${params.toString()}`);

      const statusLabel: Record<string, string> = {
        pending: "Pendente", confirmed: "Confirmado", preparing: "Preparando",
        ready: "Pronto", served: "Servido", completed: "Concluído", cancelled: "Cancelado",
      };
      const typeLabel: Record<string, string> = {
        dine_in: "Mesa", takeout: "Retirada", delivery: "Entrega",
      };
      const payLabel: Record<string, string> = {
        cash: "Dinheiro", card: "Cartão", pix: "PIX",
      };

      const headers = [
        "Nº Pedido", "Data", "Status", "Tipo", "Mesa",
        "Cliente", "Telefone", "Endereço", "Referência",
        "Forma de Pagamento", "Subtotal (R$)", "Taxa Entrega (R$)", "Desconto (R$)", "Total (R$)", "Pago (R$)",
        "Observações", "Itens",
      ];

      const rows = orders.map((o: any) => {
        const items: any[] = o.items ?? [];
        const itemsSummary = items
          .map((i: any) => `${i.quantity}x ${i.name}${i.notes ? ` (${i.notes})` : ""}`)
          .join("\r\n");

        return [
          typeof o.order_number === "number" ? o.order_number : Number(o.order_number) || o.id,
          o.created_at ? new Date(o.created_at) : null,
          statusLabel[o.status] ?? o.status,
          typeLabel[o.type] ?? o.type ?? null,
          o.table_number != null ? `Mesa ${o.table_number}` : null,
          o.customer_name ?? null,
          o.delivery_phone ?? null,
          o.delivery_address ?? null,
          o.delivery_reference ?? null,
          o.payment_method ? (payLabel[o.payment_method] ?? o.payment_method) : null,
          (o.subtotal ?? 0) / 100,
          (o.delivery_fee ?? 0) / 100,
          (o.discount ?? 0) / 100,
          (o.total ?? 0) / 100,
          (o.total_paid ?? 0) / 100,
          o.notes ?? null,
          itemsSummary || null,
        ];
      });

      const colWidths = [10, 18, 12, 10, 8, 28, 16, 35, 20, 16, 14, 16, 12, 14, 14, 30, 50];
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadXlsx(`pedidos_${dateStr}.xlsx`, "Pedidos", headers, rows, colWidths);
    } catch {
      // silent — user can retry
    } finally {
      setExportLoading(false);
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
          <div className="flex gap-2">
            <Button variant="outline" disabled={exportLoading} onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {exportLoading ? "Exportando..." : "Exportar Excel"}
            </Button>
            <Button variant="outline" onClick={() => setResetSequenceOpen(true)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reiniciar sequência
            </Button>
          </div>
        }
      />

      <OrderFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilter}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
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
        title="Arquivar sessão e reiniciar contagem"
        description="Os pedidos atuais terão seus números arquivados com o prefixo da sessão (ex: feira1-1, feira1-120). Nenhum pedido será apagado ou alterado. A contagem reinicia em #1 para a próxima sessão."
        onConfirm={handleResetSequence}
        loading={resetSequence.isPending}
        confirmLabel="Arquivar e reiniciar"
      />

      <PaymentDialog
        open={!!chargeOrderId}
        onOpenChange={(v) => { if (!v) setChargeOrderId(null); }}
        preselectedOrderId={chargeOrderId ?? undefined}
      />
    </div>
  );
}
