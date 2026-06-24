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
import { Eye, EyeOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useResetOrgUserPassword, type OrgUser } from "@/hooks/use-super-admin";

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

interface ResetOrgUserPasswordDialogProps {
  orgId: string;
  user: OrgUser | null;
  onClose: () => void;
}

export function ResetOrgUserPasswordDialog({
  orgId,
  user,
  onClose,
}: ResetOrgUserPasswordDialogProps) {
  const reset = useResetOrgUserPassword(orgId);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const open = !!user;

  useEffect(() => {
    if (!open) {
      setPassword("");
      setShowPassword(false);
    }
  }, [open]);

  const handleGenerate = () => {
    setPassword(generatePassword(14));
    setShowPassword(true);
  };

  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Senha copiada");
    } catch {
      toast.error("Não foi possível copiar a senha");
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (password.length < 8) {
      toast.error("Senha precisa de pelo menos 8 caracteres");
      return;
    }
    try {
      await reset.mutateAsync({ userId: user.id, password });
      toast.success("Senha redefinida. As sessões ativas foram invalidadas.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao redefinir senha");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            {user
              ? `Definir nova senha para ${user.name} (${user.email})`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">Nova senha</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <Button type="button" variant="outline" onClick={handleGenerate}>
                <Wand2 className="h-4 w-4 mr-2" />
                Gerar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!password}
                onClick={handleCopy}
              >
                Copiar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao confirmar, todas as sessões ativas deste usuário serão encerradas.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={reset.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={reset.isPending}>
              {reset.isPending ? "Redefinindo..." : "Redefinir senha"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
