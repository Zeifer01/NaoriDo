"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@restai/ui/components/card";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { Button } from "@restai/ui/components/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@restai/ui/components/select";
import { CURRENCIES, BRAZIL, getDeliveryFeeCents, DELIVERY_PAYMENT_METHOD_META } from "@restai/config";
import { cn } from "@/lib/utils";
import { DeliveryMenuLink } from "@/components/delivery-menu-link";
import { DeliveryZonesPanel } from "./delivery-zones-panel";
import { DeliveryRadiusPanel } from "./delivery-radius-panel";
import { useBranchSettings, useUpdateBranch } from "@/hooks/use-settings";
import { useFeatures } from "@/hooks/use-features";
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

/** BRL orgs only see payment methods that actually exist in Brazil — no Zelle/Venmo/Cash App. */
const PAYMENT_OPTIONS_BRL = (["cash", "card", "pix", "transfer"] as const).map((id) => ({
  id,
  label: DELIVERY_PAYMENT_METHOD_META[id].label,
}));

/** Everyone else (Açaí House / USD) keeps exactly what they've always seen — unchanged. */
const PAYMENT_OPTIONS_DEFAULT = [
  { id: "cash", label: "Dinheiro / Cash" },
  { id: "card", label: "Cartão pelo link / Card link" },
  { id: "pix", label: "PIX" },
  { id: "zelle", label: "Zelle" },
  { id: "venmo", label: "Venmo" },
  { id: "cashapp", label: "Cash App" },
  { id: "transfer", label: "Transferência" },
] as const;

export function BranchTab() {
  const { data: branchData, isLoading: branchLoading } = useBranchSettings();
  const updateBranch = useUpdateBranch();
  const initializedRef = useRef(false);
  const { deliveryFulfillmentToggle, pickupFeeToggle } = useFeatures();

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
    deliveryFulfillmentEnabled: boolean;
    deliveryFee: string;
    tablesEnabled: boolean;
    landingEnabled: boolean;
    landingTitle: string;
    landingDescription: string;
    landingButtonText: string;
    landingButtonUrl: string;
    socialInstagram: string;
    socialTiktok: string;
    socialWhatsapp: string;
    menuDisplayName: string;
    menuSubtitle: string;
    menuDeliveryText: string;
    deliveryOfflineMessage: string;
    pickupEnabled: boolean;
    pickupFee: string;
    pickupFeeReason: string;
    pickupAddress: string;
    pickupHint: string;
    pickupUnavailableMessage: string;
    deliveryLabel: string;
    pickupLabel: string;
    paymentMethods: string[];
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
    deliveryFulfillmentEnabled: true,
    deliveryFee: "12.00",
    tablesEnabled: true,
    landingEnabled: false,
    landingTitle: "",
    landingDescription: "",
    landingButtonText: "",
    landingButtonUrl: "",
    socialInstagram: "",
    socialTiktok: "",
    socialWhatsapp: "",
    menuDisplayName: "",
    menuSubtitle: "",
    menuDeliveryText: "",
    deliveryOfflineMessage: "",
    pickupEnabled: true,
    pickupFee: "0.00",
    pickupFeeReason: "",
    pickupAddress: "",
    pickupHint: "",
    pickupUnavailableMessage: "",
    deliveryLabel: "",
    pickupLabel: "",
    paymentMethods: ["cash", "card", "pix"],
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
        deliveryFulfillmentEnabled:
          branchData.settings?.delivery_fulfillment_enabled !== false,
        deliveryFee: (getDeliveryFeeCents(branchData.settings) / 100).toFixed(2),
        tablesEnabled: branchData.settings?.tables_enabled !== false,
        landingEnabled: branchData.settings?.landing_enabled === true,
        landingTitle: (branchData.settings?.landing_title as string) || "",
        landingDescription: (branchData.settings?.landing_description as string) || "",
        landingButtonText: (branchData.settings?.landing_button_text as string) || "",
        landingButtonUrl: (branchData.settings?.landing_button_url as string) || "",
        socialInstagram: (branchData.settings?.social_instagram as string) || "",
        socialTiktok: (branchData.settings?.social_tiktok as string) || "",
        socialWhatsapp: (branchData.settings?.social_whatsapp as string) || "",
        menuDisplayName: (branchData.settings?.menu_display_name as string) || "",
        menuSubtitle: (branchData.settings?.menu_subtitle as string) || "",
        menuDeliveryText: (branchData.settings?.menu_delivery_text as string) || "",
        deliveryOfflineMessage: (branchData.settings?.delivery_offline_message as string) || "",
        pickupEnabled: branchData.settings?.pickup_enabled !== false,
        pickupFee: (((branchData.settings?.pickup_fee_cents as number) || 0) / 100).toFixed(2),
        pickupFeeReason: (branchData.settings?.pickup_fee_reason as string) || "",
        pickupAddress: (branchData.settings?.pickup_address as string) || "",
        pickupHint: (branchData.settings?.pickup_hint as string) || "",
        pickupUnavailableMessage:
          (branchData.settings?.pickup_unavailable_message as string) || "",
        deliveryLabel: (branchData.settings?.delivery_label as string) || "",
        pickupLabel: (branchData.settings?.pickup_label as string) || "",
        paymentMethods: Array.isArray(branchData.settings?.payment_methods)
          ? (branchData.settings.payment_methods as string[])
          : ["cash", "card", "pix"],
      });
    }
  }, [branchData]);

  const handleBranchSave = async () => {
    try {
      const taxRateNum = Math.round(parseFloat(branchForm.taxRate) * 100);
      const deliveryFeeCents = Math.round(parseFloat(branchForm.deliveryFee) * 100);
      const pickupFeeCents = Math.round((parseFloat(branchForm.pickupFee) || 0) * 100);
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
        deliveryFulfillmentEnabled: branchForm.deliveryFulfillmentEnabled,
        deliveryFeeCents,
        tablesEnabled: branchForm.tablesEnabled,
        landingEnabled: branchForm.landingEnabled,
        landingTitle: branchForm.landingTitle,
        landingDescription: branchForm.landingDescription,
        landingButtonText: branchForm.landingButtonText,
        landingButtonUrl: branchForm.landingButtonUrl,
        socialInstagram: branchForm.socialInstagram,
        socialTiktok: branchForm.socialTiktok,
        socialWhatsapp: branchForm.socialWhatsapp,
        menuDisplayName: branchForm.menuDisplayName,
        menuSubtitle: branchForm.menuSubtitle,
        menuDeliveryText: branchForm.menuDeliveryText,
        deliveryOfflineMessage: branchForm.deliveryOfflineMessage,
        pickupEnabled: branchForm.pickupEnabled,
        pickupFeeCents,
        pickupFeeReason: branchForm.pickupFeeReason,
        pickupAddress: branchForm.pickupAddress,
        pickupHint: branchForm.pickupHint,
        pickupUnavailableMessage: branchForm.pickupUnavailableMessage,
        deliveryLabel: branchForm.deliveryLabel,
        pickupLabel: branchForm.pickupLabel,
        paymentMethods: branchForm.paymentMethods,
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
            <div className="rounded-lg border p-4 space-y-2">
              <Label htmlFor="deliveryOfflineMessage">Mensagem quando cardápio estiver fechado</Label>
              <textarea
                id="deliveryOfflineMessage"
                rows={4}
                placeholder="Ex: No momento não estamos aceitando pedidos online. Voltamos em breve — obrigado!"
                value={branchForm.deliveryOfflineMessage}
                onChange={(e) =>
                  setBranchForm({ ...branchForm, deliveryOfflineMessage: e.target.value })
                }
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Exibida no link do cardápio quando os pedidos online estiverem desativados. Se vazio, usa uma mensagem padrão.
              </p>
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
                      placeholder="Peça online e receba onde estiver"
                      value={branchForm.menuSubtitle}
                      onChange={(e) =>
                        setBranchForm({ ...branchForm, menuSubtitle: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="menuDeliveryText">Texto de entrega</Label>
                    <textarea
                      id="menuDeliveryText"
                      rows={2}
                      placeholder={`Entrega · R$ ${branchForm.deliveryFee}`}
                      value={branchForm.menuDeliveryText}
                      onChange={(e) =>
                        setBranchForm({ ...branchForm, menuDeliveryText: e.target.value })
                      }
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se vazio, exibe "Entrega · {"{valor da taxa}"}". Use Enter para quebrar linha.
                    </p>
                  </div>
                </div>

                {deliveryFulfillmentToggle && (
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">Entrega (delivery)</p>
                        <p className="text-xs text-muted-foreground">
                          Quando inativo, a opção "Entrega" some do checkout — o cardápio continua aberto e o cliente só pode escolher retirada. Diferente do interruptor acima, que desliga o cardápio inteiro.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={branchForm.deliveryFulfillmentEnabled}
                        onClick={() =>
                          setBranchForm({
                            ...branchForm,
                            deliveryFulfillmentEnabled: !branchForm.deliveryFulfillmentEnabled,
                          })
                        }
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                          branchForm.deliveryFulfillmentEnabled ? "bg-primary" : "bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                            branchForm.deliveryFulfillmentEnabled ? "translate-x-5" : "translate-x-0",
                          )}
                        />
                      </button>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Retirada (pickup)</p>
                      <p className="text-xs text-muted-foreground">
                        Quando ativo, o cliente pode escolher retirar no local. Quando inativo, o cardápio informa que a retirada não está disponível.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={branchForm.pickupEnabled}
                      onClick={() =>
                        setBranchForm({
                          ...branchForm,
                          pickupEnabled: !branchForm.pickupEnabled,
                        })
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        branchForm.pickupEnabled ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                          branchForm.pickupEnabled ? "translate-x-5" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="deliveryLabel">Rótulo da entrega</Label>
                      <Input
                        id="deliveryLabel"
                        placeholder="Entrega"
                        value={branchForm.deliveryLabel}
                        onChange={(e) =>
                          setBranchForm({ ...branchForm, deliveryLabel: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pickupLabel">Rótulo da retirada</Label>
                      <Input
                        id="pickupLabel"
                        placeholder="Retirada"
                        value={branchForm.pickupLabel}
                        onChange={(e) =>
                          setBranchForm({ ...branchForm, pickupLabel: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  {branchForm.pickupEnabled ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="pickupAddress">Endereço de retirada</Label>
                        <Input
                          id="pickupAddress"
                          placeholder="Rua, número, bairro — onde o cliente retira"
                          value={branchForm.pickupAddress}
                          onChange={(e) =>
                            setBranchForm({ ...branchForm, pickupAddress: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pickupHint">Texto quando retirada está disponível</Label>
                        <Input
                          id="pickupHint"
                          placeholder={
                            branchForm.currency === "BRL"
                              ? "Ex: Retire na loja · Grátis"
                              : "Ex: Retire em Worcester · Grátis"
                          }
                          value={branchForm.pickupHint}
                          onChange={(e) =>
                            setBranchForm({ ...branchForm, pickupHint: e.target.value })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Se vazio, usa o endereço de retirada ou “Retire no local · Grátis”.
                        </p>
                      </div>
                      {pickupFeeToggle && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="pickupFee">Taxa de retirada (opcional)</Label>
                            <Input
                              id="pickupFee"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={branchForm.pickupFee}
                              onChange={(e) =>
                                setBranchForm({ ...branchForm, pickupFee: e.target.value })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Deixe 0,00 para retirada gratuita.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="pickupFeeReason">Motivo da taxa</Label>
                            <Input
                              id="pickupFeeReason"
                              placeholder="Ex: Taxa de embalagem"
                              value={branchForm.pickupFeeReason}
                              onChange={(e) =>
                                setBranchForm({ ...branchForm, pickupFeeReason: e.target.value })
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Exibido pro cliente junto do valor no carrinho.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="pickupUnavailableMessage">
                        Mensagem quando retirada está indisponível
                      </Label>
                      <textarea
                        id="pickupUnavailableMessage"
                        rows={2}
                        placeholder="No momento não estamos aceitando retirada"
                        value={branchForm.pickupUnavailableMessage}
                        onChange={(e) =>
                          setBranchForm({
                            ...branchForm,
                            pickupUnavailableMessage: e.target.value,
                          })
                        }
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Formas de pagamento no cardápio</p>
                    <p className="text-xs text-muted-foreground">
                      {branchForm.currency === "BRL"
                        ? "Escolha o que o cliente vê no checkout."
                        : "Escolha o que o cliente vê no checkout (ex.: EUA = Card link, Zelle, Venmo, Cash)."}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      branchForm.currency === "BRL"
                        ? PAYMENT_OPTIONS_BRL
                        : PAYMENT_OPTIONS_DEFAULT
                    ).map((opt) => {
                      const checked = branchForm.paymentMethods.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? branchForm.paymentMethods.filter((m) => m !== opt.id)
                                : [...branchForm.paymentMethods, opt.id];
                              setBranchForm({
                                ...branchForm,
                                paymentMethods: next.length > 0 ? next : [opt.id],
                              });
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
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

                <DeliveryRadiusPanel currency={branchForm.currency} />

                <DeliveryZonesPanel currency={branchForm.currency} />

                {/* Landing page section */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Página de boas-vindas</p>
                      <p className="text-xs text-muted-foreground">
                        Título e texto do site de marca (domínio principal) e da página antes do cardápio
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

                  <div className="space-y-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="landingTitle">Título da página de marca</Label>
                      <Input
                        id="landingTitle"
                        placeholder={
                          branchForm.currency === "BRL"
                            ? "Ex: Produtos fresquinhos, direto pra sua casa"
                            : "Ex: Açaí fresco, feito na hora"
                        }
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
                        placeholder="Conte um pouco sobre a história da sua marca..."
                        value={branchForm.landingDescription}
                        onChange={(e) =>
                          setBranchForm({ ...branchForm, landingDescription: e.target.value })
                        }
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="landingButtonText">Texto do botão Pedir</Label>
                      <Input
                        id="landingButtonText"
                        placeholder="Ex: Pedir online"
                        value={branchForm.landingButtonText}
                        onChange={(e) =>
                          setBranchForm({ ...branchForm, landingButtonText: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {branchForm.landingEnabled && (
                    <div className="space-y-4 pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        Página intermediária no caminho antigo do cardápio (opcional)
                      </p>
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
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="socialInstagram">Instagram</Label>
                      <Input
                        id="socialInstagram"
                        placeholder={
                          branchForm.currency === "BRL"
                            ? "@seurestaurante ou URL"
                            : "@worcesteracai ou URL"
                        }
                        value={branchForm.socialInstagram}
                        onChange={(e) =>
                          setBranchForm({ ...branchForm, socialInstagram: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="socialTiktok">TikTok</Label>
                      <Input
                        id="socialTiktok"
                        placeholder={
                          branchForm.currency === "BRL"
                            ? "@seurestaurante ou URL"
                            : "@worcesteracai ou URL"
                        }
                        value={branchForm.socialTiktok}
                        onChange={(e) =>
                          setBranchForm({ ...branchForm, socialTiktok: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="socialWhatsapp">WhatsApp (site / pedidos)</Label>
                      <Input
                        id="socialWhatsapp"
                        placeholder={
                          branchForm.currency === "BRL"
                            ? "Ex: 5511999999999 ou wa.me/..."
                            : "Ex: 15085551234 ou wa.me/..."
                        }
                        value={branchForm.socialWhatsapp}
                        onChange={(e) =>
                          setBranchForm({ ...branchForm, socialWhatsapp: e.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Usado na página de marca. Se vazio, usa o telefone da filial
                      </p>
                    </div>
                  </div>
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
