"use client";

import { useState } from "react";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { useCreateStaff } from "@/hooks/use-staff";
import { useBranches } from "@/hooks/use-settings";
import { useFeatures } from "@/hooks/use-features";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { Check } from "lucide-react";

interface CreateStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateStaffDialog({ open, onOpenChange }: CreateStaffDialogProps) {
  const selectedBranchId = useAuthStore((s) => s.selectedBranchId);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "waiter",
    isDriver: false,
    branchIds: selectedBranchId ? [selectedBranchId] : [] as string[],
  });

  const createStaff = useCreateStaff();
  const { data: branchesData } = useBranches();
  const { deliveryDispatch } = useFeatures();
  const branches = branchesData ?? [];

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    try {
      await createStaff.mutateAsync({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(deliveryDispatch && form.role !== "driver" ? { isDriver: form.isDriver } : {}),
        branchIds: form.branchIds,
      });
      toast.success("Membro da equipe criado");
      onOpenChange(false);
      setForm({ name: "", email: "", password: "", role: "waiter", isDriver: false, branchIds: selectedBranchId ? [selectedBranchId] : [] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar membro da equipe");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Membro da Equipe</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome completo"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@ejemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Senha</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Admin</SelectItem>
                <SelectItem value="branch_manager">Gerente</SelectItem>
                <SelectItem value="cashier">Caixa</SelectItem>
                <SelectItem value="waiter">Garçom</SelectItem>
                <SelectItem value="kitchen">Cozinha</SelectItem>
                {deliveryDispatch && <SelectItem value="driver">Entregador (só vê Entregas)</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          {deliveryDispatch && form.role !== "driver" && (
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={form.isDriver}
                onChange={(e) => setForm({ ...form, isDriver: e.target.checked })}
              />
              <span className="text-sm">
                <span className="font-medium">Também faz entregas</span>
                <span className="block text-xs text-muted-foreground">
                  Aparece na lista de entregadores e pode pegar pedidos na tela Entregas, sem mudar a função acima.
                </span>
              </span>
            </label>
          )}
          <div className="space-y-2">
            <Label>Filiais atribuídas *</Label>
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {branches.map((branch) => {
                const isChecked = form.branchIds.includes(branch.id);
                return (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        branchIds: isChecked
                          ? form.branchIds.filter((id) => id !== branch.id)
                          : [...form.branchIds, branch.id],
                      })
                    }
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <div
                      className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                        isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                      }`}
                    >
                      {isChecked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    {branch.name}
                  </button>
                );
              })}
            </div>
            {form.branchIds.length === 0 && (
              <p className="text-xs text-destructive">Selecione pelo menos uma filial</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={createStaff.isPending || form.branchIds.length === 0}
          >
            {createStaff.isPending ? "Criando..." : "Criar Membro"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
