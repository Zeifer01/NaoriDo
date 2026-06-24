"use client";

import { useEffect, useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@restai/ui/components/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@restai/ui/components/select";
import { Check, Eye, EyeOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateOrgUser,
  type StaffRole,
  type OrgBranch,
} from "@/hooks/use-super-admin";

interface CreateOrgUserDialogProps {
  orgId: string;
  branches: OrgBranch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generatePassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  if (typeof window === "undefined" || !window.crypto?.getRandomValues) {
    let out = "";
    for (let i = 0; i < length; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
  const arr = new Uint32Array(length);
  window.crypto.getRandomValues(arr);
  return Array.from(arr, (n) => alphabet[n % alphabet.length]).join("");
}

const initialForm = {
  name: "",
  email: "",
  password: "",
  role: "branch_manager" as StaffRole,
  branchIds: [] as string[],
};

export function CreateOrgUserDialog({
  orgId,
  branches,
  open,
  onOpenChange,
}: CreateOrgUserDialogProps) {
  const createUser = useCreateOrgUser(orgId);
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setShowPassword(false);
    }
  }, [open]);

  const requiresBranches = form.role !== "org_admin";

  const handleToggleBranch = (branchId: string) => {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(branchId)
        ? f.branchIds.filter((id) => id !== branchId)
        : [...f.branchIds, branchId],
    }));
  };

  const handleGeneratePassword = () => {
    setForm((f) => ({ ...f, password: generatePassword(14) }));
    setShowPassword(true);
  };

  const handleCopyPassword = async () => {
    if (!form.password) return;
    try {
      await navigator.clipboard.writeText(form.password);
      toast.success("Senha copiada");
    } catch {
      toast.error("Não foi possível copiar a senha");
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome");
    if (!form.email.includes("@")) return toast.error("E-mail inválido");
    if (form.password.length < 8)
      return toast.error("Senha precisa de pelo menos 8 caracteres");
    if (requiresBranches && form.branchIds.length === 0)
      return toast.error("Selecione pelo menos uma filial");

    try {
      await createUser.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        branchIds: form.branchIds,
      });
      toast.success("Usuário criado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar usuário");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cria um usuário com acesso ao painel desta empresa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-name">Nome</Label>
            <Input
              id="user-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">E-mail</Label>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-role">Função</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}
            >
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Admin (acesso total à empresa)</SelectItem>
                <SelectItem value="branch_manager">Gerente</SelectItem>
                <SelectItem value="cashier">Caixa</SelectItem>
                <SelectItem value="waiter">Garçom</SelectItem>
                <SelectItem value="kitchen">Cozinha</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Senha</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="user-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="pr-10 font-mono"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" onClick={handleGeneratePassword}>
                <Wand2 className="h-4 w-4 mr-2" />
                Gerar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!form.password}
                onClick={handleCopyPassword}
              >
                Copiar
              </Button>
            </div>
          </div>

          {requiresBranches && (
            <div className="space-y-2">
              <Label>Filiais atribuídas</Label>
              {branches.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Esta empresa ainda não tem filiais cadastradas.
                </p>
              ) : (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {branches.map((branch) => {
                    const checked = form.branchIds.includes(branch.id);
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => handleToggleBranch(branch.id)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        <div
                          className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                            checked
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </div>
                        {branch.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={createUser.isPending}
          >
            {createUser.isPending ? "Criando..." : "Criar usuário"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
