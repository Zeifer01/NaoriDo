"use client";

import { formatCurrency } from "@/lib/utils";
import { useProductAnalytics } from "@/hooks/use-analytics";
import {
  AnalyticsDateToolbar,
  ReportsV2Nav,
  useAnalyticsDateState,
} from "../_components/reports-v2-shell";
import { ReportsV2Gate } from "../_components/reports-v2-gate";
import { ReportExportActions } from "../_components/report-export-actions";
import {
  ReportPrintChrome,
  ReportPrintFooter,
  ReportPrintTitle,
} from "../_components/report-print-chrome";
import { exportProductsCsv, exportProductsXlsx } from "@/lib/report-exports";

export default function ReportsProdutosPage() {
  return (
    <ReportsV2Gate>
      <ReportsProdutosContent />
    </ReportsV2Gate>
  );
}

function ReportsProdutosContent() {
  const dateState = useAnalyticsDateState();
  const { data, isLoading, isFetching, error, refetch } = useProductAnalytics(dateState.params);

  return (
    <div className="space-y-4">
      <ReportsV2Nav />
      <div className="report-print-root space-y-6">
        <ReportPrintChrome
          title="Pedidos"
          startDate={dateState.startDate}
          endDate={dateState.endDate}
        />
        <ReportPrintTitle
          title="Pedidos"
          subtitle="Itens, complementos, mix e o que não vendeu"
        />
        <AnalyticsDateToolbar
          title="Pedidos"
          subtitle="Ranking de itens, top complementos, mix por categoria e itens sem venda"
          state={dateState}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          actions={
            <ReportExportActions
              disabled={!data || isLoading}
              reportTitle="Pedidos"
              startDate={dateState.startDate}
              endDate={dateState.endDate}
              onCsv={(meta) => data && exportProductsCsv(data, meta)}
              onXlsx={(meta) => data && exportProductsXlsx(data, meta)}
            />
          }
        />

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(data?.metrics ?? []).map((m) => (
            <div key={m.id} className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {m.label}
              </p>
              <p className="text-xl font-bold tabular-nums mt-1">
                {m.unit === "cents"
                  ? formatCurrency(m.value as number)
                  : m.unit === "percent"
                    ? `${m.value}%`
                    : m.value}
              </p>
            </div>
          ))}
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl border bg-muted animate-pulse" />
            ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold">Itens mais vendidos (receita)</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground text-left">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3">Qtd</th>
                  <th className="p-3">Receita</th>
                  <th className="p-3">Share</th>
                  <th className="p-3">Margem</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topByRevenue ?? []).map((p) => (
                  <tr key={`${p.menuItemId}-${p.name}`} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.categoryName ?? "—"}</div>
                    </td>
                    <td className="p-3 tabular-nums">{p.quantity}</td>
                    <td className="p-3 tabular-nums">{formatCurrency(p.revenueCents)}</td>
                    <td className="p-3 tabular-nums">{(p.revenueShare * 100).toFixed(1)}%</td>
                    <td className="p-3 tabular-nums">
                      {p.marginRatio !== null
                        ? `${(p.marginRatio * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
                {!isLoading && (data?.topByRevenue.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Sem vendas no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold">Top complementos</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mais escolhidos nos pedidos concluídos
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground text-left">
                <tr>
                  <th className="p-3">Complemento</th>
                  <th className="p-3">Vezes</th>
                  <th className="p-3">Receita</th>
                  <th className="p-3">Share</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topModifiers ?? []).map((m) => (
                  <tr key={`${m.modifierId}-${m.name}`} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.groupName ?? "—"}</div>
                    </td>
                    <td className="p-3 tabular-nums">{m.quantity}</td>
                    <td className="p-3 tabular-nums">{formatCurrency(m.revenueCents)}</td>
                    <td className="p-3 tabular-nums">{(m.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {!isLoading && (data?.topModifiers?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Sem complementos registrados no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Por categoria</h2>
            <ul className="space-y-2 text-sm">
              {(data?.byCategory ?? []).map((c) => (
                <li key={c.categoryName} className="flex justify-between gap-3">
                  <span className="truncate">{c.categoryName}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {formatCurrency(c.revenueCents)} · {(c.share * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Sem venda no período</h2>
            <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto print:max-h-none print:overflow-visible">
              {(data?.withoutSales ?? []).map((p) => (
                <li key={p.menuItemId} className="text-muted-foreground">
                  {p.name}
                  {p.categoryName ? ` · ${p.categoryName}` : ""}
                </li>
              ))}
              {!isLoading && (data?.withoutSales.length ?? 0) === 0 && (
                <p className="text-muted-foreground">Todos os itens disponíveis tiveram venda.</p>
              )}
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              Dica: revise cardápio ou promova itens parados — estoque parado é custo.
            </p>
          </div>
        </div>

        <ReportPrintFooter title="Pedidos" />
      </div>
    </div>
  );
}
