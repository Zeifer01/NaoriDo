"use client";

import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { Store } from "lucide-react";
import type { OrgBranch } from "@/hooks/use-super-admin";

interface OrgBranchesCardProps {
  branches: OrgBranch[];
}

export function OrgBranchesCard({ branches }: OrgBranchesCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Filiais</h3>
            <p className="text-xs text-muted-foreground">
              {branches.length} {branches.length === 1 ? "unidade" : "unidades"} desta empresa
            </p>
          </div>
        </div>

        {branches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma filial cadastrada
          </p>
        ) : (
          <div className="space-y-2">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <div className="h-9 w-9 shrink-0 rounded-md bg-muted flex items-center justify-center">
                  <Store className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{branch.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    /{branch.slug} · {branch.currency} · {branch.timezone}
                  </p>
                </div>
                {branch.is_active ? (
                  <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                    Ativa
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inativa
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
