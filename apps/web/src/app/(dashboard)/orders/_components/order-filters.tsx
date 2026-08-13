"use client";

import { Button } from "@restai/ui/components/button";
import { DatePicker } from "@restai/ui/components/date-picker";
import { SearchInput } from "@/components/search-input";

const STATUS_FILTERS_V1 = [
  "all",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "served",
  "completed",
] as const;

/** Filter values passed to the API (comma lists expand on the backend). */
const STATUS_FILTERS_SIMPLIFIED = [
  { value: "all", label: "Todos" },
  { value: "pending,confirmed", label: "Comanda criada" },
  { value: "preparing", label: "Em preparo" },
  { value: "ready", label: "Saiu / Pronto" },
  { value: "served,completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
] as const;

const statusConfigV1: Record<string, { label: string }> = {
  pending: { label: "Pendente" },
  confirmed: { label: "Confirmado" },
  preparing: { label: "Preparando" },
  ready: { label: "Pronto" },
  served: { label: "Servido" },
  completed: { label: "Concluído" },
  cancelled: { label: "Cancelado" },
};

const SOURCE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "online", label: "Online" },
  { value: "pos", label: "PDV" },
] as const;

interface OrderFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  simplifiedOrderStatus?: boolean;
  /** Canal do pedido (online vs PDV) — só exibido quando a org tem a flag habilitada. */
  showSourceFilter?: boolean;
  sourceFilter?: string;
  onSourceFilterChange?: (source: string) => void;
}

export function OrderFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  simplifiedOrderStatus = false,
  showSourceFilter = false,
  sourceFilter = "all",
  onSourceFilterChange,
}: OrderFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Buscar por número, mesa ou cliente..."
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <DatePicker
            value={startDate}
            onChange={(d) => onStartDateChange(d ?? "")}
            className="w-[150px]"
          />
          <span className="text-muted-foreground text-sm shrink-0">até</span>
          <DatePicker
            value={endDate}
            onChange={(d) => onEndDateChange(d ?? "")}
            className="w-[150px]"
          />
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onStartDateChange("");
                onEndDateChange("");
              }}
            >
              Limpar
            </Button>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {simplifiedOrderStatus
          ? STATUS_FILTERS_SIMPLIFIED.map((item) => (
              <Button
                key={item.value}
                variant={statusFilter === item.value ? "default" : "outline"}
                size="sm"
                onClick={() => onStatusFilterChange(item.value)}
              >
                {item.label}
              </Button>
            ))
          : STATUS_FILTERS_V1.map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => onStatusFilterChange(status)}
              >
                {status === "all" ? "Todos" : statusConfigV1[status]?.label || status}
              </Button>
            ))}
      </div>
      {showSourceFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">Canal:</span>
          {SOURCE_FILTERS.map((item) => (
            <Button
              key={item.value}
              variant={sourceFilter === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => onSourceFilterChange?.(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
