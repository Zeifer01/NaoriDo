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
import { useChangePassword } from "@/hooks/use-staff";
import { toast } from "sonner";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: any | null;
}

export function PasswordDialog({ open, onOpenChange, member }: PasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const changePassword = useChangePassword();

  const handleChange = async () => {
    if (!member || newPassword.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }
    try {
      await changePassword.mutateAsync({ id: member.id, password: newPassword });
      toast.success(`Senha de ${member.name} actualizada`);
      onOpenChange(false);
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar Senha</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {member && (
            <p className="text-sm text-muted-foreground">
              Alterar senha de <span className="font-medium text-foreground">{member.name}</span>
            </p>
          )}
          <div className="space-y-2">
            <Label>Nova Senha</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-destructive">Deve ter pelo menos 8 caracteres</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleChange}
            disabled={changePassword.isPending || newPassword.length < 8}
          >
            {changePassword.isPending ? "Alterando..." : "Cambiar Senha"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
