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
import { DeliveryZonesPanel } from "./delivery-zones-panel";
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
    tablesEnabled: boolean;
    landingEnabled: boolean;
    landingTitle: string;
    landingDescription: string;
    landingButtonText: string;
    landingButtonUrl: string;
    menuDisplayName: string;
    menuSubtitle: string;
    menuDeliveryText: string;
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
    tablesEnabled: true,
    landingEnabled: false,
    landingTitle: "",
    landingDescription: "",
    landingButtonText: "",
    landingButtonUrl: "",
    menuDisplayName: "",
    menuSubtitle: "",
    menuDeliveryText: "",
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
        tablesEnabled: branchData.settings?.tables_enabled !== false,
        landingEnabled: branchData.settings?.landing_enabled === true,
        landingTitle: (branchData.settings?.landing_title as string) || "",
        landingDescription: (branchData.settings?.landing_description as string) || "",
        landingButtonText: (branchData.settings?.landing_button_text as string) || "",
        landingButtonUrl: (branchData.settings?.landing_button_url as string) || "",
        menuDisplayName: (branchData.settings?.menu_display_name as string) || "",
        menuSubtitle: (branchData.settings?.menu_subtitle as string) || "",
        menuDeliveryText: (branchData.settings?.menu_delivery_text as string) || "",
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
        tablesEnabled: branchForm.tablesEnabled,
        landingEnabled: branchForm.landingEnabled,
        landingTitle: branchForm.landingTitle,
        landingDescription: branchForm.landingDescription,
        landingButtonText: branchForm.landingButtonText,
        landingButtonUrl: branchForm.landingButtonUrl,
        menuDisplayName: branchForm.menuDisplayName,
        menuSubtitle: branchForm.menuSubtitle,
        menuDeliveryText: branchForm.menuDeliveryText,
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
                <div className="rounded-lg border p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Aparência do cardápio</p>
                    <p className="text-xs text-muted-foreground">
                      Textos exibidos no topo do cardápio público. Deixe em branco para usar os padrões.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menuDisplayName">Nome exibido no cardápio</Label>
                    <Input
                      id="menuDisplayName"
                      placeholder={branchForm.name || "Nome da filial"}
                      value={branchForm.menuDisplayName}
                      onChange={(e) =>
                        setBranchForm({ ...branchForm, menuDisplayName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menuSubtitle">Subtítulo</Label>
                    <Input
                      id="menuSubtitle"
                      placeholder="Produtos naturais, entregues na sua porta"
                      value={branchForm.menuSubtitle}
                      onChange={(e) =>
                        setBranchForm({ ...branchForm, menuSubtitle: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menuDeliveryText">Texto de entrega</Label>
                    <Input
                      id="menuDeliveryText"
                      placeholder={`Entrega · R$ ${branchForm.deliveryFee}`}
                      value={branchForm.menuDeliveryText}
                      onChange={(e) =>
                        setBranchForm({ ...branchForm, menuDeliveryText: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Se vazio, exibe "Entrega · {"{valor da taxa}"}". Ex: "Frete grátis acima de R$ 100"
                    </p>
                  </div>
                </div>

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
                    Valor fixo cobrado em cada pedido de delivery (padrão R$ 12,00). Usado como fallback quando não há zonas cadastradas.
                  </p>
                </div>

                <DeliveryZonesPanel currency={branchForm.currency} />

                {/* Landing page section */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Página de boas-vindas</p>
                      <p className="text-xs text-muted-foreground">
                        Exibe uma página inicial com a história da marca antes do cardápio
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={branchForm.landingEnabled}
                      onClick={() =>
                        setBranchForm({ ...branchForm, landingEnabled: !branchForm.landingEnabled })
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        branchForm.landingEnabled ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                          branchForm.landingEnabled ? "translate-x-5" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>

                  {branchForm.landingEnabled && (
                    <div className="space-y-4 pt-2 border-t">
                      <div className="space-y-2">
                        <Label htmlFor="landingTitle">Título da página</Label>
                        <Input
                          id="landingTitle"
                          placeholder="Ex: Venha fazer parte de nossa história"
                          value={branchForm.landingTitle}
                          onChange={(e) =>
                            setBranchForm({ ...branchForm, landingTitle: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="landingDescription">Texto de apresentação</Label>
                        <textarea
                          id="landingDescription"
                          rows={4}
                          placeholder="Conte um pouco sobre a história da sua marca, clube ou estabelecimento..."
                          value={branchForm.landingDescription}
                          onChange={(e) =>
                            setBranchForm({ ...branchForm, landingDescription: e.target.value })
                          }
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="landingButtonText">Texto do botão</Label>
                          <Input
                            id="landingButtonText"
                            placeholder="Ex: Ver Cardápio"
                            value={branchForm.landingButtonText}
                            onChange={(e) =>
                              setBranchForm({ ...branchForm, landingButtonText: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="landingButtonUrl">Link do botão (opcional)</Label>
                          <Input
                            id="landingButtonUrl"
                            placeholder="Deixe em branco para ir ao cardápio"
                            value={branchForm.landingButtonUrl}
                            onChange={(e) =>
                              setBranchForm({ ...branchForm, landingButtonUrl: e.target.value })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Se vazio, leva direto ao cardápio
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
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
                <p className="text-sm font-medium">Usar mesas</p>
                <p className="text-xs text-muted-foreground">
                  Exibe o módulo de mesas na navegação lateral. Desative se o seu estabelecimento não usa mesas (ex: delivery, balcão).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={branchForm.tablesEnabled}
                onClick={() =>
                  setBranchForm({
                    ...branchForm,
                    tablesEnabled: !branchForm.tablesEnabled,
                  })
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  branchForm.tablesEnabled ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    branchForm.tablesEnabled ? "translate-x-5" : "translate-x-0",
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
