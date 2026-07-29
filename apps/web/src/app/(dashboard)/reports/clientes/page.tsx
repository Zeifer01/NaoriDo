"use client";

import type { AnalyticsMetric, CustomerAnalyticsRow, RfmSegment } from "@restai/types";
import { formatCurrency, cn } from "@/lib/utils";
import { useCustomerAnalytics } from "@/hooks/use-analytics";
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
import { exportCustomersCsv, exportCustomersXlsx } from "@/lib/report-exports";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Lightbulb,
  Minus,
} from "lucide-react";

const RFM_LABELS: Record<RfmSegment, string> = {
  champions: "Campeões",
  loyal: "Fiéis",
  potential: "Potenciais",
  new: "Novos",
  at_risk: "Em risco",
  hibernating: "Hibernando",
  lost: "Perdidos",
  other: "Outros",
};

const CRM_KPI_IDS = [
  "crm.customers_total",
  "crm.customers_new",
  "crm.portfolio_ltv",
  "crm.avg_ltv",
  "crm.retention_rate",
  "crm.churn_estimate",
  "crm.customers_at_risk",
  "crm.customers_vip",
];

function formatMetric(m: AnalyticsMetric): string {
  if (m.unit === "cents") return formatCurrency(m.value as number);
  if (m.unit === "percent") return `${m.value}%`;
  if (m.unit === "days") return `${m.value} dias`;
  return String(m.value);
}

function ChangeBadge({ ratio }: { ratio: number | null | undefined }) {
  if (ratio === null || ratio === undefined) return null;
  const pct = (ratio * 100).toFixed(1);
  const up = ratio > 0.005;
  const down = ratio < -0.005;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        up && "text-emerald-600",
        down && "text-rose-600",
        !up && !down && "text-muted-foreground",
      )}
    >
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : down ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function SegmentBadge({ segment }: { segment: RfmSegment }) {
  const tone =
    segment === "champions" || segment === "loyal"
      ? "bg-emerald-100 text-emerald-800"
      : segment === "at_risk" || segment === "lost"
        ? "bg-rose-100 text-rose-800"
        : segment === "new"
          ? "bg-sky-100 text-sky-800"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium", tone)}>
      {RFM_LABELS[segment]}
    </span>
  );
}

export default function ReportsClientesPage() {
  return (
    <ReportsV2Gate>
      <ReportsClientesContent />
    </ReportsV2Gate>
  );
}

function ReportsClientesContent() {
  const dateState = useAnalyticsDateState();
  const { data, isLoading, isFetching, error, refetch } = useCustomerAnalytics({
    ...dateState.params,
    orgWide: true,
  });

  const kpis = CRM_KPI_IDS.map((id) => data?.metrics.find((m) => m.id === id)).filter(
    Boolean,
  ) as AnalyticsMetric[];

  return (
    <div className="space-y-4">
      <ReportsV2Nav />
      <div className="report-print-root space-y-6">
        <ReportPrintChrome
          title="Clientes (CRM)"
          startDate={dateState.startDate}
          endDate={dateState.endDate}
        />
        <ReportPrintTitle
          title="Clientes (CRM)"
          subtitle="Valor da carteira, retenção e oportunidades"
        />
        <AnalyticsDateToolbar
          title="Clientes (CRM)"
          subtitle="Valor da carteira, retenção, RFM e oportunidades de recuperação"
          state={dateState}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          actions={
            <ReportExportActions
              disabled={!data || isLoading}
              reportTitle="Clientes (CRM)"
              startDate={dateState.startDate}
              endDate={dateState.endDate}
              onCsv={(meta) => data && exportCustomersCsv(data, meta)}
              onXlsx={(meta) => data && exportCustomersXlsx(data, meta)}
            />
          }
        />

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(isLoading ? CRM_KPI_IDS : kpis.map((k) => k.id)).map((id, i) => {
            const m = kpis[i];
            return (
              <div key={id} className="rounded-xl border bg-card p-4 space-y-1">
                {isLoading || !m ? (
                  <div className="h-14 bg-muted animate-pulse rounded" />
                ) : (
                  <>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {m.label}
                    </p>
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-xl font-bold tabular-nums">{formatMetric(m)}</p>
                      <ChangeBadge ratio={m.changeRatio} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">Insights Inteligentes</h2>
            <div className="space-y-2 max-h-72 overflow-y-auto print:max-h-none print:overflow-visible">
              {(data?.insights ?? []).map((insight) => (
                <div
                  key={insight.id}
                  className={cn(
                    "rounded-lg border p-3",
                    insight.severity === "critical" || insight.severity === "warning"
                      ? "border-amber-200 bg-amber-50/70"
                      : insight.severity === "positive"
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "bg-muted/30",
                  )}
                >
                  <div className="flex gap-2">
                    {insight.severity === "warning" || insight.severity === "critical" ? (
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    ) : (
                      <Lightbulb className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-semibold">{insight.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{insight.message}</p>
                    </div>
                  </div>
                </div>
              ))}
              {!isLoading && (data?.insights.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">Sem insights neste período.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Segmentos RFM</h2>
              <ul className="space-y-2">
                {(data?.segments ?? []).map((s) => (
                  <li key={s.segment} className="flex items-center justify-between text-sm">
                    <SegmentBadge segment={s.segment} />
                    <span className="tabular-nums text-muted-foreground">
                      {s.count} · {formatCurrency(s.revenueCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Curva ABC</h2>
              <ul className="space-y-2">
                {(data?.abc ?? []).map((a) => (
                  <li key={a.class} className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Classe {a.class}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {a.count} clientes · {(a.share * 100).toFixed(1)}% da receita
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-sm font-semibold">Ranking — melhores clientes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ordenado por valor total gasto (LTV)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Cliente</th>
                  <th className="p-3 font-medium">Pedidos</th>
                  <th className="p-3 font-medium">LTV</th>
                  <th className="p-3 font-medium">Ticket</th>
                  <th className="p-3 font-medium">Última compra</th>
                  <th className="p-3 font-medium">RFM</th>
                  <th className="p-3 font-medium">ABC</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                )}
                {(data?.ranking ?? []).map((row: CustomerAnalyticsRow) => (
                  <tr key={row.customerId} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[row.neighborhood, row.city].filter(Boolean).join(" · ") || row.phone || "—"}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {row.isVip && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-medium">
                            VIP
                          </span>
                        )}
                        {row.isAtRisk && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                            Em risco
                          </span>
                        )}
                        {row.isLost && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-medium">
                            Perdido
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 tabular-nums">{row.orderCount}</td>
                    <td className="p-3 tabular-nums font-medium">{formatCurrency(row.totalSpentCents)}</td>
                    <td className="p-3 tabular-nums">{formatCurrency(row.avgTicketCents)}</td>
                    <td className="p-3 text-muted-foreground">
                      {row.daysSinceLastOrder !== null ? `${row.daysSinceLastOrder}d atrás` : "—"}
                    </td>
                    <td className="p-3">
                      <SegmentBadge segment={row.rfm.segment} />
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        R{row.rfm.r} F{row.rfm.f} M{row.rfm.m}
                      </div>
                    </td>
                    <td className="p-3 font-semibold">{row.abc}</td>
                  </tr>
                ))}
                {!isLoading && (data?.ranking.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Nenhum cliente com pedidos concluídos ainda. Vincule clientes aos pedidos no
                      delivery/POS para popular o CRM.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {(data?.byCity.length ?? 0) > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Por cidade</h2>
              <ul className="space-y-2 text-sm">
                {data!.byCity.slice(0, 10).map((c) => (
                  <li key={c.city} className="flex justify-between">
                    <span>{c.city}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {c.customers} · {formatCurrency(c.revenueCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Por bairro</h2>
              <ul className="space-y-2 text-sm">
                {(data?.byNeighborhood ?? []).slice(0, 10).map((n) => (
                  <li key={n.neighborhood} className="flex justify-between">
                    <span>{n.neighborhood}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {n.customers} · {formatCurrency(n.revenueCents)}
                    </span>
                  </li>
                ))}
                {(data?.byNeighborhood.length ?? 0) === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Preencha bairro nos cadastros para destravar este mapa.
                  </p>
                )}
              </ul>
            </div>
          </div>
        )}

        <ReportPrintFooter title="Clientes (CRM)" />
      </div>
    </div>
  );
}
