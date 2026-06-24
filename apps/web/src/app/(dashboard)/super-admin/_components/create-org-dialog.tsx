"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Eye, EyeOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateOrg, type CreateOrgInput, type Plan } from "@/hooks/use-super-admin";
import { PlanFeatureList } from "./plan-feature-list";

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SLUG_REGEX = /^[a-z0-9-]+$/;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function generatePassword(length = 14): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
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
  organizationName: "",
  slug: "",
  plan: "starter" as Plan,
  branchName: "Sede Principal",
  branchSlug: "",
  branchTimezone: "America/Sao_Paulo",
  branchCurrency: "BRL",
  branchTaxRate: 0,
  adminName: "",
  adminEmail: "",
  adminPassword: "",
};

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const router = useRouter();
  const createOrg = useCreateOrg();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [autoSlug, setAutoSlug] = useState(true);
  const [autoBranchSlug, setAutoBranchSlug] = useState(true);

  useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setShowPassword(false);
      setAutoSlug(true);
      setAutoBranchSlug(true);
    }
  }, [open]);

  // Auto-derive slugs from org name when user hasn't typed manually
  useEffect(() => {
    if (autoSlug) {
      const next = slugify(form.organizationName);
      setForm((f) => ({ ...f, slug: next }));
    }
  }, [form.organizationName, autoSlug]);

  useEffect(() => {
    if (autoBranchSlug) {
      setForm((f) => ({ ...f, branchSlug: f.slug }));
    }
  }, [form.slug, autoBranchSlug]);

  const handleGeneratePassword = () => {
    const password = generatePassword(14);
    setForm((f) => ({ ...f, adminPassword: password }));
    setShowPassword(true);
  };

  const handleCopyPassword = async () => {
    if (!form.adminPassword) return;
    try {
      await navigator.clipboard.writeText(form.adminPassword);
      toast.success("Senha copiada");
    } catch {
      toast.error("Não foi possível copiar a senha");
    }
  };

  const validate = (): string | null => {
    if (!form.organizationName.trim()) return "Informe o nome da empresa";
    if (!SLUG_REGEX.test(form.slug)) return "Slug da empresa inválido";
    if (!form.branchName.trim()) return "Informe o nome da filial";
    if (form.branchSlug && !SLUG_REGEX.test(form.branchSlug)) {
      return "Slug da filial inválido";
    }
    if (!form.adminName.trim()) return "Informe o nome do admin";
    if (!form.adminEmail.includes("@")) return "Informe um e-mail válido";
    if (form.adminPassword.length < 8) {
      return "Senha do admin precisa de pelo menos 8 caracteres";
    }
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    const payload: CreateOrgInput = {
      organizationName: form.organizationName.trim(),
      slug: form.slug,
      plan: form.plan,
      branchName: form.branchName.trim(),
      branchSlug: form.branchSlug || undefined,
      branchTimezone: form.branchTimezone,
      branchCurrency: form.branchCurrency,
      branchTaxRate: form.branchTaxRate,
      adminName: form.adminName.trim(),
      adminEmail: form.adminEmail.trim().toLowerCase(),
      adminPassword: form.adminPassword,
    };

    try {
      const result = (await createOrg.mutateAsync(payload)) as {
        org: { id: string; name: string };
      };
      toast.success(`Empresa "${result.org.name}" criada`);
      onOpenChange(false);
      router.push(`/super-admin/orgs/${result.org.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar empresa";
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
          <DialogDescription>
            Cria a empresa, a filial principal e o usuário administrador inicial em uma única operação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Empresa</h3>

            <div className="space-y-2">
              <Label htmlFor="org-name">Nome da empresa</Label>
              <Input
                id="org-name"
                value={form.organizationName}
                onChange={(e) =>
                  setForm({ ...form, organizationName: e.target.value })
                }
                placeholder="Ex.: Naori Do"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={form.slug}
                onChange={(e) => {
                  setAutoSlug(false);
                  setForm({ ...form, slug: e.target.value.toLowerCase() });
                }}
                placeholder="naori-do"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Identificador interno. Usado em URLs e relatórios. Apenas letras minúsculas, números e hífens.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-plan">Plano</Label>
              <Select
                value={form.plan}
                onValueChange={(v) => setForm({ ...form, plan: v as Plan })}
              >
                <SelectTrigger id="org-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Você pode alterar o plano a qualquer momento depois.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <PlanFeatureList plan={form.plan} />
            </div>
          </section>

          <section className="space-y-3 border-t pt-5">
            <h3 className="text-sm font-medium text-foreground">Filial principal</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch-name">Nome</Label>
                <Input
                  id="branch-name"
                  value={form.branchName}
                  onChange={(e) =>
                    setForm({ ...form, branchName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-slug">Slug</Label>
                <Input
                  id="branch-slug"
                  value={form.branchSlug}
                  onChange={(e) => {
                    setAutoBranchSlug(false);
                    setForm({ ...form, branchSlug: e.target.value.toLowerCase() });
                  }}
                  placeholder={form.slug || "sede-principal"}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-tz">Fuso horário</Label>
                <Input
                  id="branch-tz"
                  value={form.branchTimezone}
                  onChange={(e) =>
                    setForm({ ...form, branchTimezone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-curr">Moeda</Label>
                <Select
                  value={form.branchCurrency}
                  onValueChange={(v) =>
                    setForm({ ...form, branchCurrency: v })
                  }
                >
                  <SelectTrigger id="branch-curr">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">Real (BRL)</SelectItem>
                    <SelectItem value="USD">Dólar (USD)</SelectItem>
                    <SelectItem value="EUR">Euro (EUR)</SelectItem>
                    <SelectItem value="PEN">Sol (PEN)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t pt-5">
            <h3 className="text-sm font-medium text-foreground">Usuário administrador</h3>
            <p className="text-xs text-muted-foreground">
              Esta pessoa receberá acesso de <strong>org_admin</strong> à empresa criada. Anote ou copie a senha — ela será mostrada apenas uma vez.
            </p>

            <div className="space-y-2">
              <Label htmlFor="admin-name">Nome</Label>
              <Input
                id="admin-name"
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">E-mail</Label>
              <Input
                id="admin-email"
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                placeholder="admin@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Senha</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={form.adminPassword}
                    onChange={(e) =>
                      setForm({ ...form, adminPassword: e.target.value })
                    }
                    placeholder="Mínimo 8 caracteres"
                    className="pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    title={showPassword ? "Ocultar" : "Mostrar"}
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
                  disabled={!form.adminPassword}
                  onClick={handleCopyPassword}
                >
                  Copiar
                </Button>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createOrg.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createOrg.isPending}>
              {createOrg.isPending ? "Criando..." : "Criar empresa"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
