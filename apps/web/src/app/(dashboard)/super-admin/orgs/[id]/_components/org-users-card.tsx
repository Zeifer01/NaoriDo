"use client";

import { useState } from "react";
import { Card, CardContent } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { UserPlus, KeyRound, UserX, UserCheck, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  useUpdateOrgUser,
  type OrgUser,
  type OrgBranch,
} from "@/hooks/use-super-admin";
import { CreateOrgUserDialog } from "./create-org-user-dialog";
import { ResetOrgUserPasswordDialog } from "./reset-org-user-password-dialog";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  org_admin: "Admin",
  branch_manager: "Gerente",
  cashier: "Caixa",
  waiter: "Garçom",
  kitchen: "Cozinha",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  super_admin: "default",
  org_admin: "default",
  branch_manager: "default",
  cashier: "secondary",
  waiter: "secondary",
  kitchen: "outline",
};

interface OrgUsersCardProps {
  orgId: string;
  users: OrgUser[];
  branches: OrgBranch[];
}

export function OrgUsersCard({ orgId, users, branches }: OrgUsersCardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<OrgUser | null>(null);

  const updateUser = useUpdateOrgUser(orgId);

  const handleToggleActive = async (user: OrgUser) => {
    if (user.role === "super_admin") {
      toast.error("Não é possível alterar usuários super_admin daqui");
      return;
    }
    try {
      await updateUser.mutateAsync({ userId: user.id, isActive: !user.is_active });
      toast.success(user.is_active ? "Usuário desativado" : "Usuário reativado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar status");
    }
  };

  return (
    <>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <h3 className="font-semibold">Usuários</h3>
              <p className="text-xs text-muted-foreground">
                Quem tem acesso ao painel desta empresa
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo usuário
            </Button>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum usuário cadastrado
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card flex-wrap"
                >
                  <div className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium uppercase">
                    {user.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <Badge variant={ROLE_VARIANTS[user.role] ?? "outline"}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                      {!user.is_active && (
                        <Badge
                          variant="outline"
                          className="text-amber-700 border-amber-200 bg-amber-50"
                        >
                          Inativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {user.email}
                    </p>
                    {user.branches.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {user.branches.map((b) => b.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResetUser(user)}
                      title="Resetar senha"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleActive(user)}
                      disabled={updateUser.isPending || user.role === "super_admin"}
                      title={user.is_active ? "Desativar" : "Reativar"}
                    >
                      {user.is_active ? (
                        <UserX className="h-3.5 w-3.5" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateOrgUserDialog
        orgId={orgId}
        branches={branches}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <ResetOrgUserPasswordDialog
        orgId={orgId}
        user={resetUser}
        onClose={() => setResetUser(null)}
      />
    </>
  );
}
