"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Building2, Minus } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { cn, formatCurrency } from "@/lib/utils";
import { useFeatures } from "@/hooks/use-features";
import {
  useDeliveryReport,
  type DeliveryReport,
  type DeliverySummary,
} from "@/hooks/use-deliveries";
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
import { exportDriversCsv, exportDriversXlsx } from "@/lib/report-exports";

const DRIVER_COLORS = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#ec4899"];
const TIP_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  zelle: "Zelle",
  venmo: "Venmo",
  cashapp: "Cash App",
  card: "Cartão",
};

const fmtMin = (m: number | null | undefined) => (m == null ? "—" : `${Math.round(m)} min`);
const fmtPct = (p: number | null | undefined) => (p == null ? "—" : `${p}%`);

function Delta({ current, previous, lowerIsBetter }: { current: number | null; previous: number | null | undefined; lowerIsBetter?: boolean }) {
  if (current == null || previous == null || previous === 0) return null;
  const ratio = (current - previous) / Math.abs(previous);
  const flat = Math.abs(ratio) < 0.005;
  const up = ratio > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        flat ? "text-muted-foreground" : good ? "text-emerald-600" : "text-rose-600",
      )}
    >
      {flat ? <Minus className="h-3.5 w-3.5" /> : up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {up && !flat ? "+" : ""}
      {(ratio * 100).toFixed(1)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-xl font-bold tabular-nums">{value}</p>
        {delta}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Kpis({ s, prev, limit }: { s: DeliverySummary; prev: DeliverySummary | null; limit: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Entregas" value={String(s.deliveries)} delta={<Delta current={s.deliveries} previous={prev?.deliveries} />} />
      <Kpi
        label="Valor das entregas"
        value={formatCurrency(s.valueCents)}
        hint={`Ticket médio ${formatCurrency(s.avgTicketCents)} · fretes ${formatCurrency(s.feeCents)}`}
        delta={<Delta current={s.valueCents} previous={prev?.valueCents} />}
      />
      <Kpi
        label="Tempo médio de entrega"
        value={fmtMin(s.avgTotalMinutes)}
        hint={`Do pedido até a porta · mediana ${fmtMin(s.medianTotalMinutes)}`}
        delta={<Delta current={s.avgTotalMinutes} previous={prev?.avgTotalMinutes} lowerIsBetter />}
      />
      <Kpi
        label={`Entregues em até ${limit} min`}
        value={fmtPct(s.withinLimitPct)}
        hint="Dentro do limite de espera"
        delta={<Delta current={s.withinLimitPct} previous={prev?.withinLimitPct} />}
      />
      <Kpi
        label="Pedido → saída"
        value={fmtMin(s.avgToPickupMinutes)}
        hint="Preparo + espera pela retirada"
        delta={<Delta current={s.avgToPickupMinutes} previous={prev?.avgToPickupMinutes} lowerIsBetter />}
      />
      <Kpi
        label="Saída → entrega"
        value={fmtMin(s.avgOnRoadMinutes)}
        hint="Tempo do entregador na rua"
        delta={<Delta current={s.avgOnRoadMinutes} previous={prev?.avgOnRoadMinutes} lowerIsBetter />}
      />
      <Kpi
        label="Dinheiro recebido"
        value={formatCurrency(s.cashCollectedCents)}
        hint="Pedidos em dinheiro cobrados na porta"
        delta={<Delta current={s.cashCollectedCents} previous={prev?.cashCollectedCents} />}
      />
      <Kpi
        label="Gorjetas"
        value={formatCurrency(s.tipsCents)}
        hint={`${s.tippedPct}% das entregas · média ${formatCurrency(s.avgTipCents)}`}
        delta={<Delta current={s.tipsCents} previous={prev?.tipsCents} />}
      />
    </div>
  );
}

function DriversTable({ data }: { data: DeliveryReport }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold mb-3">Por entregador</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="py-2 pr-3 font-medium">Entregador</th>
              <th className="py-2 px-3 font-medium text-right">Entregas</th>
              <th className="py-2 px-3 font-medium text-right">Valor</th>
              <th className="py-2 px-3 font-medium text-right">Tempo médio</th>
              <th className="py-2 px-3 font-medium text-right">Na rua</th>
              <th className="py-2 px-3 font-medium text-right">≤ {data.limitMinutes} min</th>
              <th className="py-2 px-3 font-medium text-right">Dinheiro</th>
              <th className="py-2 pl-3 font-medium text-right">Gorjetas</th>
            </tr>
          </thead>
          <tbody>
            {data.drivers.map((d, i) => (
              <tr key={d.driverId} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: DRIVER_COLORS[i % DRIVER_COLORS.length] }} />
                    {d.driverName}
                  </span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{d.deliveries}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(d.valueCents)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtMin(d.avgTotalMinutes)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtMin(d.avgOnRoadMinutes)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtPct(d.withinLimitPct)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(d.cashCollectedCents)}</td>
                <td className="py-2 pl-3 text-right tabular-nums">
                  {formatCurrency(d.tipsCents)}
                  {d.tipsCents > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      {Object.entries(d.tipsByMethod)
                        .map(([m, c]) => `${TIP_LABELS[m] ?? m} ${formatCurrency(c)}`)
                        .join(" · ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {data.drivers.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  Nenhuma entrega registrada pela tela Entregas neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Charts({ data }: { data: DeliveryReport }) {
  const names = new Map(data.drivers.map((d) => [d.driverId, d.driverName]));
  const dailyData = data.daily.map((d) => ({ ...d, label: d.date.slice(5).split("-").reverse().join("/") }));
  return (
    <>
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Entregas por dia</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              {data.drivers.length > 1 && <Legend />}
              {data.drivers.map((d, i) => (
                <Bar
                  key={d.driverId}
                  dataKey={d.driverId}
                  name={names.get(d.driverId)}
                  stackId="deliveries"
                  fill={DRIVER_COLORS[i % DRIVER_COLORS.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Por horário</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byHour}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [String(v), "Entregas"]} />
                <Bar dataKey="deliveries" fill="var(--primary)" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Por dia da semana</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byWeekday}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [String(v), "Entregas"]} />
                <Bar dataKey="deliveries" fill="var(--primary)" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}

function Details({ data }: { data: DeliveryReport }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Por cidade</h2>
        <ul className="space-y-2">
          {data.byCity.map((c) => (
            <li key={c.city} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{c.city}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {c.deliveries} · {formatCurrency(c.valueCents)} · {fmtMin(c.avgMinutes)}
              </span>
            </li>
          ))}
          {data.byCity.length === 0 && <p className="text-sm text-muted-foreground">Sem entregas no período.</p>}
        </ul>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-1">Entregas mais demoradas</h2>
        <p className="text-xs text-muted-foreground mb-3">Do pedido até a porta — para ver o que atrasou</p>
        <ul className="space-y-2">
          {data.slowest.map((s) => (
            <li key={`${s.orderNumber}-${s.date}`} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  #{s.orderNumber} · {s.address || s.city || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.driverName} · {s.date.split("-").reverse().join("/")}
                </p>
              </div>
              <span
                className={cn(
                  "tabular-nums font-medium shrink-0",
                  s.totalMinutes > data.limitMinutes && "text-rose-600",
                )}
              >
                {s.totalMinutes} min
              </span>
            </li>
          ))}
          {data.slowest.length === 0 && <p className="text-sm text-muted-foreground">Sem entregas no período.</p>}
        </ul>
      </div>
    </div>
  );
}

export default function ReportsEntregadoresPage() {
  return (
    <ReportsV2Gate>
      <ReportsEntregadoresContent />
    </ReportsV2Gate>
  );
}

function ReportsEntregadoresContent() {
  const { deliveryDispatch, isLoading: featuresLoading } = useFeatures();
  const dateState = useAnalyticsDateState();
  const [orgWide, setOrgWide] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useDeliveryReport(
    deliveryDispatch ? { startDate: dateState.startDate, endDate: dateState.endDate, orgWide } : null,
  );

  if (!featuresLoading && !deliveryDispatch) {
    return (
      <div className="space-y-4">
        <ReportsV2Nav />
        <p className="text-sm text-muted-foreground">O relatório de entregadores não está habilitado para esta organização.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ReportsV2Nav />
      <div className="report-print-root space-y-6">
        <ReportPrintChrome title="Entregadores" startDate={dateState.startDate} endDate={dateState.endDate} />
        <ReportPrintTitle title="Entregadores" subtitle="Entregas, tempos, dinheiro recebido e gorjetas" />
        <AnalyticsDateToolbar
          title="Entregadores"
          subtitle="Entregas por entregador, tempo de entrega, valores, dinheiro recebido e gorjetas"
          state={dateState}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          actions={
            <>
              <Button
                type="button"
                variant={orgWide ? "default" : "outline"}
                size="sm"
                className="h-9"
                onClick={() => setOrgWide((v) => !v)}
                title="Somar as entregas de todas as filiais"
              >
                <Building2 className="h-4 w-4" />
                Todas as filiais
              </Button>
              <ReportExportActions
                disabled={!data || isLoading}
                reportTitle="Entregadores"
                startDate={dateState.startDate}
                endDate={dateState.endDate}
                onCsv={(meta) => data && exportDriversCsv(data, meta)}
                onXlsx={(meta) => data && exportDriversXlsx(data, meta)}
              />
            </>
          }
        />

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl border bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            <Kpis s={data.summary} prev={data.previous} limit={data.limitMinutes} />
            <DriversTable data={data} />
            <Charts data={data} />
            <Details data={data} />
            <p className="text-xs text-muted-foreground">
              Considera as entregas marcadas como <b>Entregue</b> na tela Entregas, pela data da entrega. Comparação com o
              período anterior de mesma duração.
              {data.summary.timeExcluded > 0 &&
                ` ${data.summary.timeExcluded} entrega(s) marcada(s) com muitas horas de atraso ficaram fora das médias de tempo.`}
            </p>
          </>
        )}

        <ReportPrintFooter title="Entregadores" />
      </div>
    </div>
  );
}
