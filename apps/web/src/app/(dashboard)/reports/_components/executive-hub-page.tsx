"use client";

import type { AnalyticsInsight, AnalyticsMetric } from "@restai/types";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, cn } from "@/lib/utils";
import { useExecutiveHub } from "@/hooks/use-analytics";
import {
  AnalyticsDateToolbar,
  useAnalyticsDateState,
} from "./reports-v2-shell";
import { ReportExportActions } from "./report-export-actions";
import { ReportPrintChrome, ReportPrintFooter, ReportPrintTitle } from "./report-print-chrome";
import {
  exportHubCsv,
  exportHubXlsx,
} from "@/lib/report-exports";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Lightbulb,
  Minus,
  TrendingUp,
  Users,
} from "lucide-react";

function formatMetric(m: AnalyticsMetric): string {
  if (m.unit === "cents") return formatCurrency(m.value as number);
  if (m.unit === "percent") return `${m.value}%`;
  if (m.unit === "days") return `${m.value}d`;
  if (m.id === "hub.peak_hour" && m.value === -1) return "—";
  if (m.id === "hub.peak_hour") return `${String(m.value).padStart(2, "0")}:00`;
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

function InsightCard({ insight }: { insight: AnalyticsInsight }) {
  const tone =
    insight.severity === "critical"
      ? "border-rose-200 bg-rose-50/80"
      : insight.severity === "warning"
        ? "border-amber-200 bg-amber-50/80"
        : insight.severity === "positive"
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-border bg-muted/30";

  return (
    <div className={cn("rounded-lg border p-3.5 space-y-1", tone)}>
      <div className="flex items-start gap-2">
        {insight.severity === "warning" || insight.severity === "critical" ? (
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
        ) : (
          <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-sky-700" />
        )}
        <div>
          <p className="text-sm font-semibold leading-snug">{insight.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{insight.message}</p>
        </div>
      </div>
    </div>
  );
}

const HUB_KPI_IDS = [
  "hub.revenue",
  "hub.orders",
  "hub.ticket",
  "hub.new_customers",
  "hub.retention_rate",
  "hub.portfolio_ltv",
];

export function ExecutiveHubPage() {
  const dateState = useAnalyticsDateState();
  const { data, isLoading, isFetching, error, refetch } = useExecutiveHub(dateState.params);

  const kpis = HUB_KPI_IDS.map((id) => data?.metrics.find((m) => m.id === id)).filter(
    Boolean,
  ) as AnalyticsMetric[];

  return (
    <div className="report-print-root space-y-6">
      <ReportPrintChrome
        title="Hub Executivo"
        startDate={dateState.startDate}
        endDate={dateState.endDate}
      />
      <ReportPrintTitle
        title="Hub Executivo"
        subtitle="Saúde do negócio em um olhar"
      />
      <AnalyticsDateToolbar
        title="Hub Executivo"
        subtitle="Saúde do negócio em um olhar — compare com o período anterior"
        state={dateState}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        actions={
          <ReportExportActions
            disabled={!data || isLoading}
            reportTitle="Hub Executivo"
            startDate={dateState.startDate}
            endDate={dateState.endDate}
            onCsv={(meta) => data && exportHubCsv(data, meta)}
            onXlsx={(meta) => data && exportHubXlsx(data, meta)}
          />
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(isLoading ? HUB_KPI_IDS : kpis.map((k) => k.id)).map((id, i) => {
          const m = kpis[i];
          return (
            <div key={id} className="rounded-xl border bg-card p-4 space-y-1">
              {isLoading || !m ? (
                <div className="h-16 bg-muted animate-pulse rounded" />
              ) : (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {m.label}
                  </p>
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-2xl font-bold tabular-nums">{formatMetric(m)}</p>
                    <ChangeBadge ratio={m.changeRatio} />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Evolução do faturamento</h2>
          <div className="h-64">
            {isLoading ? (
              <div className="h-full bg-muted animate-pulse rounded" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(Number(v) / 100)}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Receita"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenueCents"
                    name="Atual"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.15)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          {data?.comparePeriod && (
            <p className="text-xs text-muted-foreground mt-2">
              Comparativo: {data.comparePeriod.start} a {data.comparePeriod.end}
              {data.compareSeries && data.compareSeries.length > 0
                ? ` · ${data.compareSeries.length} dias no período base`
                : ""}
            </p>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clientes
            </h2>
            {data && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Novos</dt>
                  <dd className="text-lg font-semibold">{data.customerHighlights.newCustomers}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recorrentes</dt>
                  <dd className="text-lg font-semibold">{data.customerHighlights.recurringCustomers}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Em risco</dt>
                  <dd className="text-lg font-semibold text-amber-700">{data.customerHighlights.atRiskCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">VIP</dt>
                  <dd className="text-lg font-semibold">{data.customerHighlights.vipCount}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <h2 className="text-sm font-semibold">Operação</h2>
            {data && (
              <ul className="text-sm space-y-1.5 text-muted-foreground">
                <li>
                  Pedidos ativos:{" "}
                  <span className="text-foreground font-medium">{data.operations.activeOrders}</span>
                </li>
                <li>
                  Concluídos no período:{" "}
                  <span className="text-foreground font-medium">{data.operations.completedOrders}</span>
                </li>
                <li>
                  Pico:{" "}
                  <span className="text-foreground font-medium">
                    {data.operations.peakWeekday ?? "—"}
                    {data.operations.peakHour !== null
                      ? ` · ${String(data.operations.peakHour).padStart(2, "0")}:00`
                      : ""}
                  </span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Itens que puxam o faturamento</h2>
          <ul className="space-y-2">
            {(data?.topProducts ?? []).map((p) => (
              <li key={`${p.menuItemId}-${p.name}`} className="flex items-center justify-between text-sm gap-3">
                <span className="truncate font-medium">{p.name}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {formatCurrency(p.revenueCents)} · {(p.revenueShare * 100).toFixed(1)}%
                </span>
              </li>
            ))}
            {!isLoading && (data?.topProducts.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Sem vendas no período.</p>
            )}
          </ul>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Projeções
          </h2>
          {data?.projection ? (
            <>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                    Semanas
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {(data.projection.nextWeeks ?? []).map((w) => (
                      <li key={w.weekStart} className="flex justify-between gap-3">
                        <span className="font-medium">Sem. {w.weekStart}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(w.projectedRevenueCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                    Meses
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {data.projection.nextMonths.map((m) => (
                      <li key={m.month} className="flex justify-between gap-3">
                        <span className="font-medium">{m.month}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(m.projectedRevenueCents)}
                          <span className="text-[10px] ml-1">
                            ({formatCurrency(m.lowCents)}–{formatCurrency(m.highCents)})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {data.projection.nextYear && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      12 meses
                    </p>
                    <div className="flex justify-between gap-3 mt-1 text-sm">
                      <span className="font-medium truncate">{data.projection.nextYear.yearLabel}</span>
                      <span className="tabular-nums font-semibold shrink-0">
                        {formatCurrency(data.projection.nextYear.projectedRevenueCents)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Faixa {formatCurrency(data.projection.nextYear.lowCents)}–
                      {formatCurrency(data.projection.nextYear.highCents)}
                    </p>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {data.projection.disclaimer}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados suficientes para projetar.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Insights Inteligentes</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
            {(data?.insights ?? []).map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
            {!isLoading && (data?.insights.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                Ainda não há insights para este período — aguarde mais movimento.
              </p>
            )}
          </div>
      </div>

      <ReportPrintFooter title="Hub Executivo" />
    </div>
  );
}
