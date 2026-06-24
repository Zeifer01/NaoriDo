"use client";

import { Check, X } from "lucide-react";
import {
  ALL_FEATURES,
  FEATURE_CATALOG,
  getPlan,
  type PlanId,
} from "@restai/config";

interface PlanFeatureListProps {
  plan: PlanId;
  /** When true, also lists the features that the plan does NOT include (greyed out). */
  showUnavailable?: boolean;
  /** Hide tagline + caps and just show the features grid. */
  compact?: boolean;
}

function formatPriceCents(cents: number): string {
  if (cents === 0) return "Grátis";
  const reais = (cents / 100).toFixed(2).replace(".", ",");
  return `R$ ${reais}/mês`;
}

function formatLimit(value: number | null, singular: string, plural: string): string {
  if (value === null) return `Ilimitado de ${plural}`;
  return `Até ${value} ${value === 1 ? singular : plural}`;
}

export function PlanFeatureList({
  plan,
  showUnavailable = false,
  compact = false,
}: PlanFeatureListProps) {
  const def = getPlan(plan);
  const enabled = new Set(def.features);

  const featuresToRender = showUnavailable
    ? ALL_FEATURES
    : ALL_FEATURES.filter((f) => enabled.has(f));

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{def.label}</p>
            <p className="text-sm text-muted-foreground">
              {formatPriceCents(def.price_cents)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{def.tagline}</p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
            <span>{formatLimit(def.max_branches, "filial", "filiais")}</span>
            <span>·</span>
            <span>{formatLimit(def.max_users, "usuário", "usuários")}</span>
          </div>
        </div>
      )}

      {featuresToRender.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Apenas funcionalidades essenciais (POS, pedidos, mesas, cozinha, pagamentos).
        </p>
      ) : (
        <ul className="space-y-1.5">
          {featuresToRender.map((id) => {
            const meta = FEATURE_CATALOG[id];
            const has = enabled.has(id);
            return (
              <li key={id} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${
                    has
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {has ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                </span>
                <span className={has ? "text-foreground" : "text-muted-foreground line-through"}>
                  <strong>{meta.label}</strong>
                  <span className="text-muted-foreground font-normal">
                    {" "}— {meta.description}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
