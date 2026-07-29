"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Badge } from "@restai/ui/components/badge";
import { Globe, Plus, Star, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAddSuperAdminDomain,
  useDeleteSuperAdminDomain,
  useSetSuperAdminPrimaryDomain,
  useSuperAdminOrgDomains,
  useVerifySuperAdminDomain,
} from "@/hooks/use-super-admin";

export function OrgDomainsCard({ orgId }: { orgId: string }) {
  const { data: domains, isLoading } = useSuperAdminOrgDomains(orgId);
  const add = useAddSuperAdminDomain(orgId);
  const setPrimary = useSetSuperAdminPrimaryDomain(orgId);
  const verify = useVerifySuperAdminDomain(orgId);
  const remove = useDeleteSuperAdminDomain(orgId);
  const [hostname, setHostname] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" />
          Domínios
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="animate-pulse bg-muted h-16 rounded" />
        ) : (
          <ul className="space-y-2">
            {(domains ?? []).map((d) => (
              <li
                key={d.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-md p-2"
              >
                <div>
                  <p className="font-mono text-xs">{d.hostname}</p>
                  <div className="flex gap-1 mt-1">
                    {d.isPrimary && <Badge className="text-xs">Primário</Badge>}
                    {d.verifiedAt ? (
                      <Badge variant="secondary" className="text-xs">
                        Verificado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Pendente
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {!d.isPrimary && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await setPrimary.mutateAsync(d.id);
                          toast.success("Primário atualizado");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Erro");
                        }
                      }}
                    >
                      <Star className="h-3 w-3" />
                    </Button>
                  )}
                  {!d.verifiedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await verify.mutateAsync(d.id);
                          toast.success("Verificado");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Erro");
                        }
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await remove.mutateAsync(d.id);
                        toast.success("Removido");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro");
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="dominio.com.br"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={add.isPending}
            onClick={async () => {
              try {
                await add.mutateAsync({ hostname, markVerified: true, isPrimary: false });
                setHostname("");
                toast.success("Domínio adicionado");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro");
              }
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
