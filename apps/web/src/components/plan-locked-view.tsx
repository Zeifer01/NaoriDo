"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { Card, CardContent } from "@restai/ui/components/card";
import { buttonVariants } from "@restai/ui/components/button";
import {
  FEATURE_CATALOG,
  PLANS,
  PLAN_ORDER,
  type PlanFeature,
} from "@restai/config";
import { useFeatures } from "@/hooks/use-features";

interface PlanLockedViewProps {
  feature: PlanFeature;
  children: React.ReactNode;
}

/**
 * Wrap a route that depends on a plan feature. When the active plan does not
 * include `feature`, render a friendly upgrade prompt instead of the children.
 *
 * Sidebar links are also hidden in this case, so this screen is mostly for
 * users who land on the URL directly (bookmarks, shared links).
 */
export function PlanLockedView({ feature, children }: PlanLockedViewProps) {
  const { has, isLoading, plan } = useFeatures();

  if (isLoading) return <>{children}</>;
  if (has(feature)) return <>{children}</>;

  const meta = FEATURE_CATALOG[feature];
  const currentIdx = PLAN_ORDER.indexOf(plan);
  const upgradeId = PLAN_ORDER.find(
    (id, i) => i > currentIdx && PLANS[id].features.includes(feature),
  );
  const upgradeLabel = upgradeId ? PLANS[upgradeId].label : null;

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Card className="max-w-lg w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{meta.label} não está incluído no seu plano</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          {upgradeLabel ? (
            <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground inline-flex items-center gap-2 justify-center">
              <Sparkles className="h-4 w-4" />
              Disponível a partir do plano <strong className="text-foreground">{upgradeLabel}</strong>
            </div>
          ) : null}
          <div className="pt-2">
            <Link
              href="/"
              className={buttonVariants({ variant: "outline" })}
            >
              Voltar ao painel
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
