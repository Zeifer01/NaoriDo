"use client";

import { Button } from "@restai/ui/components/button";
import { DatePicker } from "@restai/ui/components/date-picker";
import { SearchInput } from "@/components/search-input";

const statusConfig: Record<string, { label: string }> = {
  pending: { label: "Pendente" },
  confirmed: { label: "Confirmado" },
  preparing: { label: "Preparando" },
  ready: { label: "Pronto" },
  served: { label: "Servido" },
  completed: { label: "Concluído" },
  cancelled: { label: "Cancelado" },
};

interface OrderFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
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
        {["all", "pending", "confirmed", "preparing", "ready", "served", "completed"].map(
          (status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => onStatusFilterChange(status)}
            >
              {status === "all"
                ? "Todos"
                : statusConfig[status]?.label || status}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
