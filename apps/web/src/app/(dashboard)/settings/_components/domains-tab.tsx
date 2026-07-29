"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Globe, Plus, Star, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAddOrgDomain,
  useDeleteOrgDomain,
  useOrgDomains,
  useSetPrimaryDomain,
  useVerifyOrgDomain,
} from "@/hooks/use-settings";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

export function DomainsTab() {
  const { data, isLoading, error } = useOrgDomains();
  const addDomain = useAddOrgDomain();
  const setPrimary = useSetPrimaryDomain();
  const verify = useVerifyOrgDomain();
  const remove = useDeleteOrgDomain();
  const [hostname, setHostname] = useState("");

  const handleAdd = async () => {
    if (!hostname.trim()) {
      toast.error("Informe o hostname");
      return;
    }
    try {
      await addDomain.mutateAsync({ hostname: hostname.trim() });
      setHostname("");
      toast.success("Domínio adicionado. Aponte o DNS e marque como verificado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar domínio");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Domínios
        </CardTitle>
        <CardDescription>
          Domínio primário usado em QR, WhatsApp e link do cardápio. Subdomínio da
          plataforma é criado automaticamente; você pode adicionar um domínio próprio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">
            {(error as Error).message || "Erro ao carregar domínios"}
          </p>
        ) : (
          <>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground text-xs mb-1">Origem pública</p>
              <p className="font-mono text-xs break-all">{data?.primaryOrigin}</p>
            </div>

            <ul className="space-y-2">
              {(data?.domains ?? []).map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between border rounded-md p-3"
                >
                  <div>
                    <p className="font-mono text-sm">{d.hostname}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {d.isPrimary && (
                        <Badge variant="default" className="text-xs">
                          Primário
                        </Badge>
                      )}
                      {d.verifiedAt ? (
                        <Badge variant="secondary" className="text-xs">
                          Verificado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Pendente
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        SSL: {d.sslStatus}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {!d.isPrimary && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await setPrimary.mutateAsync(d.id);
                            toast.success("Domínio primário atualizado");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Erro");
                          }
                        }}
                      >
                        <Star className="h-3.5 w-3.5 mr-1" />
                        Primário
                      </Button>
                    )}
                    {!d.verifiedAt && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await verify.mutateAsync(d.id);
                            toast.success("Domínio marcado como verificado");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Erro");
                          }
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Verificar
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await remove.mutateAsync(d.id);
                          toast.success("Domínio removido");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Erro");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="newDomain">Adicionar domínio customizado</Label>
              <div className="flex gap-2">
                <Input
                  id="newDomain"
                  placeholder="meurestaurante.com.br"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={handleAdd}
                  disabled={addDomain.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Aponte um CNAME (ou A) para a VPS / proxy e clique em Verificar.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
