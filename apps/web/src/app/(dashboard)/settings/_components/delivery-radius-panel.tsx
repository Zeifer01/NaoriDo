"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, MapPin, Loader2 } from "lucide-react";
import { Button } from "@restai/ui/components/button";
import { Input } from "@restai/ui/components/input";
import { Label } from "@restai/ui/components/label";
import { apiFetch } from "@/lib/fetcher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";

type TierForm = { maxMiles: string; fee: string };
type CityForm = { name: string; fee: string };
type PricingMode = "zones" | "radius" | "cities";

type PricingData = {
  mode: PricingMode;
  store: { lat: number; lng: number; formatted_address?: string } | null;
  tiers: Array<{ maxMiles: number; feeCents: number }>;
  cities: Array<{ name: string; feeCents: number }>;
  branchAddress: string | null;
};

function tiersToForm(tiers: Array<{ maxMiles: number; feeCents: number }>): TierForm[] {
  if (tiers.length === 0) {
    return [
      { maxMiles: "2", fee: "3.00" },
      { maxMiles: "5", fee: "5.00" },
    ];
  }
  return tiers.map((t) => ({
    maxMiles: String(t.maxMiles),
    fee: (t.feeCents / 100).toFixed(2),
  }));
}

function citiesToForm(
  cities: Array<{ name: string; feeCents: number }>,
  currency: string,
): CityForm[] {
  if (cities.length === 0) {
    // BRL orgs get an empty starting row — pre-filling with a real US city name
    // (Worcester/Millbury only make sense for Açaí House) risks being saved as-is.
    if (currency === "BRL") {
      return [{ name: "", fee: "5.00" }];
    }
    return [
      { name: "Worcester", fee: "3.00" },
      { name: "Millbury", fee: "5.00" },
    ];
  }
  return cities.map((c) => ({
    name: c.name,
    fee: (c.feeCents / 100).toFixed(2),
  }));
}

export function DeliveryRadiusPanel({ currency }: { currency: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<PricingMode>("zones");
  const [store, setStore] = useState<PricingData["store"]>(null);
  const [tiers, setTiers] = useState<TierForm[]>(tiersToForm([]));
  const [cities, setCities] = useState<CityForm[]>(citiesToForm([], currency));
  const [previewAddress, setPreviewAddress] = useState("");
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const { data } = useQuery<PricingData>({
    queryKey: ["delivery-pricing"],
    queryFn: () => apiFetch("/api/settings/delivery-pricing"),
  });

  useEffect(() => {
    if (!data) return;
    setMode(data.mode);
    setStore(data.store);
    setTiers(tiersToForm(data.tiers));
    setCities(citiesToForm(data.cities || [], currency));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/settings/delivery-pricing", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["delivery-pricing"] });
      toast.success("Frete automático salvo");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao salvar"),
  });

  const handleGeocodeBranch = async () => {
    const address = data?.branchAddress?.trim();
    if (!address) {
      toast.error("Cadastre o endereço da filial primeiro");
      return;
    }
    setGeocoding(true);
    try {
      const result = await apiFetch<{
        lat: number;
        lng: number;
        formattedAddress: string;
      }>("/api/settings/delivery-pricing/geocode", {
        method: "POST",
        body: JSON.stringify({ address }),
      });
      setStore({
        lat: result.lat,
        lng: result.lng,
        formatted_address: result.formattedAddress,
      });
      toast.success("Localização da loja atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao geocodificar");
    } finally {
      setGeocoding(false);
    }
  };

  const handleSave = () => {
    const parsedTiers = tiers
      .map((t) => ({
        maxMiles: parseFloat(t.maxMiles),
        feeCents: Math.round(parseFloat(t.fee || "0") * 100),
      }))
      .filter(
        (t) =>
          Number.isFinite(t.maxMiles) &&
          t.maxMiles > 0 &&
          Number.isFinite(t.feeCents) &&
          t.feeCents >= 0,
      )
      .sort((a, b) => a.maxMiles - b.maxMiles);

    const parsedCities = cities
      .map((c) => ({
        name: c.name.trim(),
        feeCents: Math.round(parseFloat(c.fee || "0") * 100),
      }))
      .filter((c) => c.name.length > 0 && Number.isFinite(c.feeCents) && c.feeCents >= 0);

    if (mode === "radius") {
      if (!store) {
        toast.error("Geocode o endereço da filial antes de ativar");
        return;
      }
      if (parsedTiers.length === 0) {
        toast.error("Adicione ao menos uma faixa de raio");
        return;
      }
    }

    if (mode === "cities" && parsedCities.length === 0) {
      toast.error("Adicione ao menos uma cidade");
      return;
    }

    saveMutation.mutate({
      mode,
      store: store
        ? {
            lat: store.lat,
            lng: store.lng,
            formattedAddress: store.formatted_address,
          }
        : null,
      tiers: parsedTiers,
      cities: parsedCities,
    });
  };

  const handlePreview = async () => {
    if (previewAddress.trim().length < 5) {
      toast.error("Informe um endereço de teste");
      return;
    }
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const result = await apiFetch<{
        fee_cents: number;
        distance_miles: number | null;
        tier_label: string;
        city: string | null;
        formatted_address: string;
      }>("/api/settings/delivery-pricing/preview", {
        method: "POST",
        body: JSON.stringify({ address: previewAddress.trim() }),
      });
      const bits = [
        formatCurrency(result.fee_cents, currency),
        result.city || result.tier_label,
        result.distance_miles != null ? `~${result.distance_miles} mi` : null,
      ].filter(Boolean);
      setPreviewResult(`${bits.join(" · ")}\n${result.formatted_address}`);
    } catch (err) {
      setPreviewResult(err instanceof Error ? err.message : "Fora da área / erro");
    } finally {
      setPreviewing(false);
    }
  };

  const autoEnabled = mode === "radius" || mode === "cities";

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <p className="text-sm font-medium">Frete automático por endereço</p>
        <p className="text-xs text-muted-foreground">
          O servidor geocodifica o endereço do cliente (anti-trapaça). Sem seletor de zona no
          cardápio.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Modo de cálculo</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { id: "zones" as const, label: "Zonas manuais", hint: "Cliente escolhe" },
              {
                id: "cities" as const,
                label: "Por cidade",
                hint: currency === "BRL" ? "Sua cidade, cidade vizinha…" : "Worcester, Millbury…",
              },
              { id: "radius" as const, label: "Por raio (mi)", hint: "Distância até a loja" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition",
                mode === opt.id ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-[11px] text-muted-foreground">{opt.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {mode === "cities" && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <Label>Cidades atendidas</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCities((prev) => [...prev, { name: "", fee: "5.00" }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Cidade
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {currency === "BRL"
              ? "Ex.: Sua cidade → R$3,00 · Cidade vizinha → R$5,00. Cidades fora da lista = não entrega."
              : "Ex.: Worcester → $3,00 · Millbury → $5,00. Cidades fora da lista = não entrega."}
          </p>
          <div className="space-y-2">
            {cities.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="Cidade"
                  value={row.name}
                  onChange={(e) => {
                    const next = [...cities];
                    next[idx] = { ...row, name: e.target.value };
                    setCities(next);
                  }}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Frete"
                  value={row.fee}
                  onChange={(e) => {
                    const next = [...cities];
                    next[idx] = { ...row, fee: e.target.value };
                    setCities(next);
                  }}
                  className="w-28"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setCities((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={cities.length <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "radius" && (
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label>Localização da loja</Label>
            {store ? (
              <p className="text-xs text-muted-foreground">
                {store.formatted_address || `${store.lat.toFixed(5)}, ${store.lng.toFixed(5)}`}
              </p>
            ) : (
              <p className="text-xs text-amber-600">Ainda sem coordenadas — use o botão abaixo.</p>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleGeocodeBranch()}
              disabled={geocoding}
            >
              {geocoding ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <MapPin className="h-3.5 w-3.5 mr-1" />
              )}
              Usar endereço da filial
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Faixas (até X milhas → frete)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setTiers((prev) => [...prev, { maxMiles: "", fee: "" }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Faixa
              </Button>
            </div>
            <div className="space-y-2">
              {tiers.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="Milhas"
                    value={tier.maxMiles}
                    onChange={(e) => {
                      const next = [...tiers];
                      next[idx] = { ...tier, maxMiles: e.target.value };
                      setTiers(next);
                    }}
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">mi →</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Frete"
                    value={tier.fee}
                    onChange={(e) => {
                      const next = [...tiers];
                      next[idx] = { ...tier, fee: e.target.value };
                      setTiers(next);
                    }}
                    className="w-28"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setTiers((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={tiers.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {autoEnabled && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <Label htmlFor="preview-address">Testar endereço</Label>
          <div className="flex gap-2">
            <Input
              id="preview-address"
              value={previewAddress}
              onChange={(e) => setPreviewAddress(e.target.value)}
              placeholder={
                currency === "BRL"
                  ? "Ex: Rua das Flores, 123, Centro, Santos - SP"
                  : "Ex: 123 Main St, Millbury, MA 01527"
              }
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handlePreview()}
              disabled={previewing}
            >
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ver"}
            </Button>
          </div>
          {previewResult && (
            <p className="text-xs whitespace-pre-line text-muted-foreground">{previewResult}</p>
          )}
        </div>
      )}

      <Button type="button" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Salvando…" : "Salvar frete automático"}
      </Button>
    </div>
  );
}
