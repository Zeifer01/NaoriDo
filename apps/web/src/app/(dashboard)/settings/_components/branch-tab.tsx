"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { CURRENCIES, BRAZIL, getDeliveryFeeCents } from "@restai/config";
import { cn } from "@/lib/utils";
import { DeliveryMenuLink } from "@/components/delivery-menu-link";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import { toast } from "sonner";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />;
}

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
  "America/Buenos_Aires",
  "America/Santiago",
  "America/New_York",
];

export function BranchTab() {
  const { data: branchData, isLoading: branchLoading } = useBranchSettings();
  const updateBranch = useUpdateBranch();
  const initializedRef = useRef(false);

  const [branchForm, setBranchForm] = useState<{
    name: string;
    address: string;
    phone: string;
    taxRate: string;
    timezone: string;
    currency: string;
    inventoryEnabled: boolean;
    waiterTableAssignmentEnabled: boolean;
    deliveryEnabled: boolean;
    deliveryFee: string;
  }>({
    name: "",
    address: "",
    phone: "",
    taxRate: "0.00",
    timezone: BRAZIL.TIMEZONE,
    currency: BRAZIL.CURRENCY,
    inventoryEnabled: false,
    waiterTableAssignmentEnabled: false,
    deliveryEnabled: true,
    deliveryFee: "12.00",
  });

  useEffect(() => {
    if (branchData && !initializedRef.current) {
      initializedRef.current = true;
      setBranchForm({
        name: branchData.name || "",
        address: branchData.address || "",
        phone: branchData.phone || "",
        taxRate: ((branchData.tax_rate ?? 0) / 100).toFixed(2),
        timezone: branchData.timezone || BRAZIL.TIMEZONE,
        currency: branchData.currency || BRAZIL.CURRENCY,
        inventoryEnabled: branchData.settings?.inventory_enabled ?? false,
        waiterTableAssignmentEnabled:
          branchData.settings?.waiter_table_assignment_enabled ?? false,
        deliveryEnabled: branchData.settings?.delivery_enabled !== false,
        deliveryFee: (getDeliveryFeeCents(branchData.settings) / 100).toFixed(2),
      });
    }
  }, [branchData]);

  const handleBranchSave = async () => {
    try {
      const taxRateNum = Math.round(parseFloat(branchForm.taxRate) * 100);
      const deliveryFeeCents = Math.round(parseFloat(branchForm.deliveryFee) * 100);
      await updateBranch.mutateAsync({
        name: branchForm.name,
        address: branchForm.address,
        phone: branchForm.phone,
        taxRate: taxRateNum,
        timezone: branchForm.timezone,
        currency: branchForm.currency,
        inventoryEnabled: branchForm.inventoryEnabled,
        waiterTableAssignmentEnabled: branchForm.waiterTableAssignmentEnabled,
        deliveryEnabled: branchForm.deliveryEnabled,
        deliveryFeeCents,
      });
      toast.success("Filial atualizada com sucesso");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar filial");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filial Atual</CardTitle>
        <CardDescription>
          Configurações da filial selecionada
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {branchLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branchName">Nome da Filial</Label>
                <Input
                  id="branchName"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchPhone">Telefone</Label>
                <Input
                  id="branchPhone"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchAddress">Endereço</Label>
              <Input
                id="branchAddress"
                value={branchForm.address}
                onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fuso Horário</Label>
                <Select
                  value={branchForm.timezone}
                  onValueChange={(v) => setBranchForm({ ...branchForm, timezone: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fuso horário" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select
                  value={branchForm.currency}
                  onValueChange={(v) => setBranchForm({ ...branchForm, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a moeda" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CURRENCIES).map(([code, info]) => (
                      <SelectItem key={code} value={code}>
                        {code} — {info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchTaxRate">Impostos (%)</Label>
              <Input
                id="branchTaxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={branchForm.taxRate}
                onChange={(e) => setBranchForm({ ...branchForm, taxRate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Informe a porcentagem (ex: 18,00 para 18%)
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Pedidos online (delivery)</p>
                <p className="text-xs text-muted-foreground">
                  Permite que clientes façam pedidos pelo link público do cardápio
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={branchForm.deliveryEnabled}
                onClick={() =>
                  setBranchForm({ ...branchForm, deliveryEnabled: !branchForm.deliveryEnabled })
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  branchForm.deliveryEnabled ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    branchForm.deliveryEnabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
            {branchForm.deliveryEnabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="deliveryFee">Taxa de entrega</Label>
                  <Input
                    id="deliveryFee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={branchForm.deliveryFee}
                    onChange={(e) =>
                      setBranchForm({ ...branchForm, deliveryFee: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor fixo cobrado em cada pedido de delivery (padrão R$ 12,00)
                  </p>
                </div>
                <div className="rounded-lg border p-4 bg-muted/30">
                  <DeliveryMenuLink branchSlug={branchData?.slug} />
                </div>
              </>
            )}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Controle de Inventário</p>
                <p className="text-xs text-muted-foreground">
                  Ative o controle de estoque e receitas
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={branchForm.inventoryEnabled}
                onClick={() =>
                  setBranchForm({ ...branchForm, inventoryEnabled: !branchForm.inventoryEnabled })
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  branchForm.inventoryEnabled ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    branchForm.inventoryEnabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Atribuição de garçons às mesas</p>
                <p className="text-xs text-muted-foreground">
                  Permite atribuir garçons específicos a cada mesa
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={branchForm.waiterTableAssignmentEnabled}
                onClick={() =>
                  setBranchForm({
                    ...branchForm,
                    waiterTableAssignmentEnabled: !branchForm.waiterTableAssignmentEnabled,
                  })
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  branchForm.waiterTableAssignmentEnabled ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    branchForm.waiterTableAssignmentEnabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
            <Button onClick={handleBranchSave} disabled={updateBranch.isPending}>
              {updateBranch.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
