"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@restai/ui/components/button";
import { DatePicker } from "@restai/ui/components/date-picker";
import { Label } from "@restai/ui/components/label";
import { Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeatures } from "@/hooks/use-features";

const V2_NAV = [
  { href: "/reports", label: "Hub", exact: true },
  { href: "/reports/clientes", label: "Clientes" },
  { href: "/reports/financeiro", label: "Financeiro" },
  { href: "/reports/produtos", label: "Pedidos" },
];

const V2_NAV_HISTORICAL = { href: "/reports/retroativos", label: "Pedidos Retroativos", exact: false };

export function getDefaultAnalyticsDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export function getTodayRange() {
  const today = new Date().toISOString().split("T")[0];
  return { start: today, end: today };
}

export function getLastDaysRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start: start.toISOString().split("T")[0],
    end: now.toISOString().split("T")[0],
  };
}

export function useAnalyticsDateState() {
  const defaults = useMemo(() => getDefaultAnalyticsDates(), []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [draftStartDate, setDraftStartDate] = useState(defaults.start);
  const [draftEndDate, setDraftEndDate] = useState(defaults.end);
  const [compareMode, setCompareMode] = useState<"auto" | "yoy" | "custom" | "off">("auto");
  const [draftCompareStart, setDraftCompareStart] = useState("");
  const [draftCompareEnd, setDraftCompareEnd] = useState("");
  const [compareStartDate, setCompareStartDate] = useState<string | undefined>();
  const [compareEndDate, setCompareEndDate] = useState<string | undefined>();

  const hasPending = draftStartDate !== startDate || draftEndDate !== endDate;
  const invalid = !!draftStartDate && !!draftEndDate && draftStartDate > draftEndDate;

  const resolveCompare = (start: string, end: string, mode: typeof compareMode) => {
    if (mode === "off") return { start: undefined, end: undefined };
    if (mode === "custom" && draftCompareStart && draftCompareEnd) {
      return { start: draftCompareStart, end: draftCompareEnd };
    }
    if (mode === "yoy") {
      const s = new Date(start);
      const e = new Date(end);
      s.setFullYear(s.getFullYear() - 1);
      e.setFullYear(e.getFullYear() - 1);
      return {
        start: s.toISOString().split("T")[0],
        end: e.toISOString().split("T")[0],
      };
    }
    // auto = previous equal-length period (backend also does this if omitted)
    return { start: undefined, end: undefined };
  };

  const applyRange = (range: { start: string; end: string }) => {
    setDraftStartDate(range.start);
    setDraftEndDate(range.end);
    setStartDate(range.start);
    setEndDate(range.end);
    const cmp = resolveCompare(range.start, range.end, compareMode);
    setCompareStartDate(cmp.start);
    setCompareEndDate(cmp.end);
  };

  const applyFilters = () => {
    if (invalid || (!hasPending && compareMode !== "custom")) {
      // still allow re-applying compare custom
    }
    if (invalid) return;
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    const cmp = resolveCompare(draftStartDate, draftEndDate, compareMode);
    setCompareStartDate(cmp.start);
    setCompareEndDate(cmp.end);
  };

  const setCompareModeAndApply = (mode: typeof compareMode) => {
    setCompareMode(mode);
    const cmp = resolveCompare(startDate, endDate, mode);
    setCompareStartDate(cmp.start);
    setCompareEndDate(cmp.end);
  };

  return {
    startDate,
    endDate,
    draftStartDate,
    draftEndDate,
    setDraftStartDate,
    setDraftEndDate,
    hasPending,
    invalid,
    applyRange,
    applyFilters,
    compareMode,
    setCompareMode: setCompareModeAndApply,
    draftCompareStart,
    draftCompareEnd,
    setDraftCompareStart,
    setDraftCompareEnd,
    compareStartDate,
    compareEndDate,
    params: {
      startDate,
      endDate,
      ...(compareStartDate && compareEndDate
        ? { compareStartDate, compareEndDate }
        : {}),
    },
  };
}

export function ReportsV2Nav() {
  const pathname = usePathname();
  const { reportsUx, isLoading, historicalOrdersReport } = useFeatures();
  if (isLoading || reportsUx !== "v2") return null;

  const items = historicalOrdersReport ? [...V2_NAV, V2_NAV_HISTORICAL] : V2_NAV;

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-px mb-2 print:hidden">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "px-3 py-2 text-sm font-medium rounded-t-md transition-colors",
              active
                ? "bg-background text-foreground border border-b-background -mb-px"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AnalyticsDateToolbar({
  title,
  subtitle,
  state,
  onRefresh,
  isRefreshing,
  actions,
}: {
  title: string;
  subtitle?: string;
  state: ReturnType<typeof useAnalyticsDateState>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-4 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">De</Label>
            <DatePicker
              value={state.draftStartDate}
              onChange={(d) => state.setDraftStartDate(d ?? "")}
              className="w-[200px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <DatePicker
              value={state.draftEndDate}
              onChange={(d) => state.setDraftEndDate(d ?? "")}
              className="w-[200px]"
            />
          </div>
          <Button
            size="sm"
            className="h-9"
            disabled={!state.hasPending || state.invalid || isRefreshing}
            onClick={state.applyFilters}
          >
            <Check className="h-4 w-4" />
            Aplicar
          </Button>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={isRefreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          )}
          {actions}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => state.applyRange(getTodayRange())}>
          Hoje
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => state.applyRange(getLastDaysRange(7))}>
          7 dias
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => state.applyRange(getLastDaysRange(30))}>
          30 dias
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => state.applyRange(getCurrentMonthRange())}>
          Este mês
        </Button>
        <span className="text-xs text-muted-foreground self-center mx-1">Comparar:</span>
        <Button
          type="button"
          variant={state.compareMode === "auto" ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => state.setCompareMode("auto")}
        >
          Período anterior
        </Button>
        <Button
          type="button"
          variant={state.compareMode === "yoy" ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => state.setCompareMode("yoy")}
        >
          Ano anterior
        </Button>
        <Button
          type="button"
          variant={state.compareMode === "off" ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => state.setCompareMode("off")}
        >
          Sem comparação
        </Button>
      </div>
      {state.compareMode === "yoy" && state.compareStartDate && (
        <p className="text-xs text-muted-foreground">
          Comparando com {state.compareStartDate} a {state.compareEndDate}
        </p>
      )}
      {state.compareMode === "auto" && (
        <p className="text-xs text-muted-foreground">
          Variações vs período imediatamente anterior de mesma duração.
        </p>
      )}
      {state.invalid && (
        <p className="text-sm text-destructive">Intervalo inválido: "De" deve ser ≤ "Até".</p>
      )}
    </div>
  );
}
