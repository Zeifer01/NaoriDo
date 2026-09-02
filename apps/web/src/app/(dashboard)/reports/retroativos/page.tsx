"use client";

import { useState } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { useHistoricalOrders, type HistoricalOrderRow } from "@/hooks/use-historical-orders";
import { ReportsV2Nav } from "../_components/reports-v2-shell";
import { ReportsV2Gate } from "../_components/reports-v2-gate";
import {
  ReportPrintChrome,
  ReportPrintFooter,
  ReportPrintTitle,
} from "../_components/report-print-chrome";

const YEARS = [2022, 2023, 2024, 2025, 2026];
const PAGE_SIZE = 200;

const FULFILLMENT_LABEL: Record<HistoricalOrderRow["fulfillment"], string> = {
  pickup: "Retirada",
  delivery: "Entrega",
  unknown: "Não informado",
};

const PAYMENT_LABEL: Record<string, string> = {
  zelle: "Zelle",
  cashapp: "Cash App",
  cash: "Dinheiro",
  card: "Cartão",
  venmo: "Venmo",
};

export default function ReportsRetroativosPage() {
  return (
    <ReportsV2Gate>
      <ReportsRetroativosContent />
    </ReportsV2Gate>
  );
}

function ReportsRetroativosContent() {
  const [year, setYear] = useState(2026);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { data, isLoading, isFetching, error, refetch } = useHistoricalOrders(year);

  const orders = data?.orders ?? [];
  const shown = orders.slice(0, visible);

  const changeYear = (y: number) => {
    setYear(y);
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="space-y-4">
      <ReportsV2Nav />
      <div className="report-print-root space-y-6">
        <ReportPrintChrome title="Pedidos Retroativos" startDate={`${year}-01-01`} endDate={`${year}-12-31`} />
        <ReportPrintTitle
          title="Pedidos Retroativos"
          subtitle="Histórico importado do WhatsApp, anterior ao sistema"
        />

        <div className="flex flex-col gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pedidos Retroativos</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Histórico de pedidos anteriores ao sistema, importado do grupo de WhatsApp.
              Somente informativo — não afeta clientes nem pedidos cadastrados hoje.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => changeYear(y)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md border transition-colors",
                  y === year
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {y}
              </button>
            ))}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="ml-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {isFetching ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pedidos em {year}
            </p>
            <p className="text-xl font-bold tabular-nums mt-1">
              {isLoading ? "…" : (data?.summary.totalOrders ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Receita extraída
            </p>
            <p className="text-xl font-bold tabular-nums mt-1">
              {isLoading ? "…" : formatCurrency(data?.summary.totalRevenue ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ticket médio
            </p>
            <p className="text-xl font-bold tabular-nums mt-1">
              {isLoading ? "…" : formatCurrency(data?.summary.averageOrderValue ?? 0)}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Data</th>
                  <th className="text-left font-medium px-3 py-2">Cliente</th>
                  <th className="text-left font-medium px-3 py-2">Contato</th>
                  <th className="text-left font-medium px-3 py-2">Itens</th>
                  <th className="text-left font-medium px-3 py-2">Pagamento</th>
                  <th className="text-right font-medium px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-3 py-3">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhum pedido retroativo encontrado em {year}.
                    </td>
                  </tr>
                )}
                {shown.map((o) => (
                  <tr key={o.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(o.order_date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 font-medium">{o.customer_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={cn(
                            "text-[11px] w-fit px-1.5 py-0.5 rounded font-medium",
                            o.fulfillment === "pickup"
                              ? "bg-sky-100 text-sky-800"
                              : o.fulfillment === "delivery"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {FULFILLMENT_LABEL[o.fulfillment]}
                        </span>
                        {o.phone && <span>{o.phone}</span>}
                        {o.address && <span>{o.address}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs whitespace-pre-line">
                      {o.items_text || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {o.payment_method ? (PAYMENT_LABEL[o.payment_method] ?? o.payment_method) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(o.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible < orders.length && (
            <div className="p-3 border-t flex justify-center print:hidden">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Carregar mais ({orders.length - visible} restantes)
              </button>
            </div>
          )}
        </div>
        <ReportPrintFooter title="Pedidos Retroativos" />
      </div>
    </div>
  );
}
