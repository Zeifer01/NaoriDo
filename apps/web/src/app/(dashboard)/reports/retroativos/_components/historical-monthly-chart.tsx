"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { formatCurrency } from "@/lib/utils";
import type { HistoricalMonthPoint } from "@/hooks/use-historical-orders";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

interface HistoricalMonthlyChartProps {
  monthly: HistoricalMonthPoint[];
  isLoading: boolean;
}

export function HistoricalMonthlyChart({ monthly, isLoading }: HistoricalMonthlyChartProps) {
  const data = monthly.map((m) => ({ ...m, label: MONTH_LABELS[m.month - 1] }));
  const hasData = data.some((m) => m.orders > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução mensal</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fill: "currentColor" }} />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "currentColor" }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 100)}`}
                />
                <Tooltip
                  formatter={(value: number, name) => [
                    name === "revenue" ? formatCurrency(value) : value,
                    name === "revenue" ? "Receita" : "Pedidos",
                  ]}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Sem pedidos retroativos neste ano
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
