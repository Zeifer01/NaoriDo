"use client";

import type { AnalyticsMetric } from "@restai/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, cn } from "@/lib/utils";
import { useFinanceAnalytics } from "@/hooks/use-analytics";
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
import { exportFinanceCsv, exportFinanceXlsx } from "@/lib/report-exports";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  card: "Cartão",
  pix: "PIX",
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferência",
  other: "Outro",
};

function formatMetric(m: AnalyticsMetric): string {
  if (m.unit === "cents") return formatCurrency(m.value as number);
  if (m.unit === "percent") return `${m.value}%`;
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

export default function ReportsFinanceiroPage() {
  return (
    <ReportsV2Gate>
      <ReportsFinanceiroContent />
    </ReportsV2Gate>
  );
}

function ReportsFinanceiroContent() {
  const dateState = useAnalyticsDateState();
  const { data, isLoading, isFetching, error, refetch } = useFinanceAnalytics(dateState.params);

  return (
    <div className="space-y-4">
      <ReportsV2Nav />
      <div className="report-print-root space-y-6">
        <ReportPrintChrome
          title="Financeiro"
          startDate={dateState.startDate}
          endDate={dateState.endDate}
        />
        <ReportPrintTitle
          title="Financeiro"
          subtitle="Faturamento, ticket e sazonalidade"
        />
        <AnalyticsDateToolbar
          title="Financeiro"
          subtitle="Faturamento, ticket, formas de pagamento e sazonalidade"
          state={dateState}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          actions={
            <ReportExportActions
              disabled={!data || isLoading}
              reportTitle="Financeiro"
              startDate={dateState.startDate}
              endDate={dateState.endDate}
              onCsv={(meta) => data && exportFinanceCsv(data, meta)}
              onXlsx={(meta) => data && exportFinanceXlsx(data, meta)}
            />
          }
        />

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(data?.metrics ?? []).slice(0, 8).map((m) => (
            <div key={m.id} className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {m.label}
              </p>
              <div className="flex items-end justify-between gap-2">
                <p className="text-xl font-bold tabular-nums">{formatMetric(m)}</p>
                <ChangeBadge ratio={m.changeRatio} />
              </div>
            </div>
          ))}
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl border bg-muted animate-pulse" />
            ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Por dia da semana</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.byWeekday ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 100)}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Receita"]} />
                  <Bar dataKey="revenueCents" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Por horário</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.byHour ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 100)}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Receita"]} />
                  <Bar dataKey="revenueCents" fill="hsl(var(--primary) / 0.7)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Formas de pagamento</h2>
          <ul className="space-y-2">
            {(data?.paymentMethods ?? []).map((p) => (
              <li key={p.method} className="flex items-center justify-between text-sm">
                <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(p.amountCents)} · {(p.share * 100).toFixed(1)}%
                  {p.tipCents > 0 ? ` · gorjeta ${formatCurrency(p.tipCents)}` : ""}
                </span>
              </li>
            ))}
            {!isLoading && (data?.paymentMethods.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Sem pagamentos no período.</p>
            )}
          </ul>
        </div>

        <ReportPrintFooter title="Financeiro" />
      </div>
    </div>
  );
}
