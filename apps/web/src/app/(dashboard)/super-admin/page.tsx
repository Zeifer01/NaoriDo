"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useSuperAdminOrgs, type OrgListItem } from "@/hooks/use-super-admin";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Card, CardContent } from "@restai/ui/components/card";
import {
  Building2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  Store,
  CheckCircle2,
  PauseCircle,
  ExternalLink,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { CreateOrgDialog } from "./_components/create-org-dialog";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  free: "outline",
  starter: "secondary",
  pro: "default",
  enterprise: "default",
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useSuperAdminOrgs();

  const orgs = data ?? [];

  const filteredOrgs = useMemo(() => {
    if (!search.trim()) return orgs;
    const term = search.trim().toLowerCase();
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(term) ||
        o.slug.toLowerCase().includes(term),
    );
  }, [orgs, search]);

  const totals = useMemo(() => {
    const active = orgs.filter((o) => o.is_active).length;
    const branches = orgs.reduce((acc, o) => acc + o.branchCount, 0);
    const users = orgs.reduce((acc, o) => acc + o.userCount, 0);
    return { total: orgs.length, active, branches, users };
  }, [orgs]);

  if (user && user.role !== "super_admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Esta área é apenas para o super administrador da plataforma.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/")}>
          Voltar ao painel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Super Admin"
        description="Gestão da plataforma — empresas, planos e acessos"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova empresa
            </Button>
          </>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Building2 className="h-4 w-4" />}
          label="Empresas"
          value={totals.total}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          label="Ativas"
          value={totals.active}
        />
        <SummaryCard
          icon={<Store className="h-4 w-4" />}
          label="Filiais"
          value={totals.branches}
        />
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="Usuários"
          value={totals.users}
        />
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar empresa por nome ou slug..."
          className="max-w-md"
        />
      </div>

      {error ? (
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-center justify-between">
          <p className="text-sm text-destructive">
            Erro ao carregar empresas: {(error as Error).message}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : filteredOrgs.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-base font-medium">
              {search ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {search
                ? "Tente ajustar a busca ou cadastre uma nova empresa."
                : "Comece criando sua primeira empresa para começar a usar a plataforma."}
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova empresa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrgs.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      )}

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className="text-2xl font-semibold mt-2">{value}</p>
      </CardContent>
    </Card>
  );
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function OrgCard({ org }: { org: OrgListItem }) {
  const expiresAt = org.plan_expires_at ? new Date(org.plan_expires_at) : null;
  const daysRemaining = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / MS_PER_DAY)
    : null;

  return (
    <Link
      href={`/super-admin/orgs/${org.id}`}
      className="block group focus:outline-none"
    >
      <Card className="transition-colors group-hover:border-primary/40">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                {org.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={org.logo_url}
                    alt={org.name}
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{org.name}</p>
                <p className="text-xs text-muted-foreground truncate font-mono">
                  /{org.slug}
                </p>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={PLAN_VARIANTS[org.plan] ?? "outline"}>
              {PLAN_LABELS[org.plan] ?? org.plan}
            </Badge>
            {!org.is_active ? (
              <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                <PauseCircle className="h-3 w-3 mr-1" />
                Suspensa
              </Badge>
            ) : daysRemaining !== null && daysRemaining < 0 ? (
              <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10">
                <XCircle className="h-3 w-3 mr-1" />
                Vencido
              </Badge>
            ) : daysRemaining !== null && daysRemaining <= 7 ? (
              <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Vence em {daysRemaining}d
              </Badge>
            ) : (
              <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ativa
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Store className="h-3.5 w-3.5" />
              {org.branchCount} {org.branchCount === 1 ? "filial" : "filiais"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {org.userCount} {org.userCount === 1 ? "usuário" : "usuários"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
