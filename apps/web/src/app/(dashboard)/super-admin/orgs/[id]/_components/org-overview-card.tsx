"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Badge } from "@restai/ui/components/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import { Building2, Save, PauseCircle, PlayCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useUpdateOrg,
  useSuspendOrg,
  useReactivateOrg,
  type OrgDetail,
  type Plan,
} from "@/hooks/use-super-admin";
import { PlanFeatureList } from "../../../_components/plan-feature-list";

const SLUG_REGEX = /^[a-z0-9-]+$/;

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

interface OrgOverviewCardProps {
  org: OrgDetail;
}

export function OrgOverviewCard({ org }: OrgOverviewCardProps) {
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [plan, setPlan] = useState<Plan>(org.plan);

  useEffect(() => {
    setName(org.name);
    setSlug(org.slug);
    setPlan(org.plan);
  }, [org.id, org.name, org.slug, org.plan]);

  const update = useUpdateOrg(org.id);
  const suspend = useSuspendOrg();
  const reactivate = useReactivateOrg();

  const dirty = name !== org.name || slug !== org.slug || plan !== org.plan;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome da empresa");
      return;
    }
    if (!SLUG_REGEX.test(slug)) {
      toast.error("Slug inválido. Use apenas letras minúsculas, números e hífens");
      return;
    }
    try {
      await update.mutateAsync({ name, slug, plan });
      toast.success("Empresa atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar empresa");
    }
  };

  const handleToggleActive = async () => {
    try {
      if (org.is_active) {
        await suspend.mutateAsync(org.id);
        toast.success("Empresa suspensa");
      } else {
        await reactivate.mutateAsync(org.id);
        toast.success("Empresa reativada");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar status");
    }
  };

  const isPending = update.isPending || suspend.isPending || reactivate.isPending;

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 shrink-0 rounded-lg bg-muted flex items-center justify-center">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-lg truncate">{org.name}</h2>
              <p className="text-xs text-muted-foreground font-mono truncate">/{org.slug}</p>
            </div>
          </div>
          {org.is_active ? (
            <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Ativa
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
              <PauseCircle className="h-3 w-3 mr-1" />
              Suspensa
            </Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              className="font-mono"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org-plan">Plano atual</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as Plan)}>
              <SelectTrigger id="org-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">{PLAN_LABELS.free}</SelectItem>
                <SelectItem value="starter">{PLAN_LABELS.starter}</SelectItem>
                <SelectItem value="pro">{PLAN_LABELS.pro}</SelectItem>
                <SelectItem value="enterprise">{PLAN_LABELS.enterprise}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <PlanFeatureList plan={plan} showUnavailable />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            variant={org.is_active ? "outline" : "default"}
            onClick={handleToggleActive}
            disabled={isPending}
          >
            {org.is_active ? (
              <>
                <PauseCircle className="h-4 w-4 mr-2" />
                Suspender empresa
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Reativar empresa
              </>
            )}
          </Button>

          <Button onClick={handleSave} disabled={!dirty || isPending}>
            <Save className="h-4 w-4 mr-2" />
            {update.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
