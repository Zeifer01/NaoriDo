"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@restai/ui/components/button";
import { Card, CardContent } from "@restai/ui/components/card";
import { Badge } from "@restai/ui/components/badge";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  RefreshCw,
  Route as RouteIcon,
  Share2,
  Undo2,
} from "lucide-react";
import { googleMapsRouteUrl, googleMapsStopUrl, wazeStopUrl, formatUsPhone } from "@restai/config";
import { cn, formatCurrency } from "@/lib/utils";
import {
  useReleaseDelivery,
  useReorderDeliveries,
  useReplanDeliveries,
  type DeliveryBoard,
  type DeliveryStop,
  type MyDeliveryStop,
} from "@/hooks/use-deliveries";
import {
  getCurrentPosition,
  navAddress,
  paymentText,
  telHref,
  waitChipClass,
  whatsappHref,
} from "./delivery-utils";

function PaymentChip({ stop }: { stop: DeliveryStop }) {
  if (stop.collectCents > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
        <Banknote className="h-3.5 w-3.5" />
        Receber {formatCurrency(stop.collectCents)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {stop.paymentMethod ? `Já pago · ${paymentText(stop.paymentMethod)}` : "Pagamento não informado"}
    </span>
  );
}

function WaitChip({ minutes, limit }: { minutes: number; limit: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
        waitChipClass(minutes, limit),
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {minutes} min
    </span>
  );
}

function NextStopCard({
  stop,
  total,
  limit,
  onDeliver,
}: {
  stop: MyDeliveryStop;
  total: number;
  limit: number;
  onDeliver: (stop: DeliveryStop) => void;
}) {
  const address = navAddress(stop);
  const mapsUrl = googleMapsStopUrl(address);
  const tel = telHref(stop.phone);
  const wa = whatsappHref(stop.phone);

  const share = async () => {
    try {
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (typeof nav.share === "function") {
        await nav.share({ title: `Entrega #${stop.orderNumber}`, text: address, url: mapsUrl });
        return;
      }
      await navigator.clipboard.writeText(address);
      toast.success("Endereço copiado");
    } catch {
      /* user cancelled the share sheet */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Endereço copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Card className="border-2 border-primary/40 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Próxima parada · 1 de {total}
            </p>
            <p className="text-lg font-bold leading-tight">
              #{stop.orderNumber} · {stop.customerName || "Cliente"}
            </p>
          </div>
          <WaitChip minutes={stop.waitMinutes} limit={limit} />
        </div>

        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-base font-semibold leading-snug break-words">{stop.address || "Sem endereço"}</p>
            {stop.city && <p className="text-sm text-muted-foreground">{stop.city}</p>}
            {stop.reference && (
              <p className="mt-1 text-sm rounded bg-muted px-2 py-1">
                <span className="font-medium">Referência:</span> {stop.reference}
              </p>
            )}
            {stop.notes && (
              <p className="mt-1 text-sm rounded bg-muted px-2 py-1">
                <span className="font-medium">Obs.:</span> {stop.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PaymentChip stop={stop} />
          {stop.phone && <span className="text-sm text-muted-foreground">{formatUsPhone(stop.phone) || stop.phone}</span>}
        </div>

        {stop.reason !== "route" && (
          <p
            className={cn(
              "text-xs font-medium rounded px-2 py-1",
              stop.reason === "overdue" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
            )}
          >
            {stop.reasonText}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants(), "h-12 text-base")}
          >
            <Navigation className="h-5 w-5" />
            Navegar
          </a>
          <Button className="h-12 text-base bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onDeliver(stop)}>
            <CheckCircle2 className="h-5 w-5" />
            Entregue
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={wazeStopUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Waze
          </a>
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 className="h-4 w-4" />
            Tesla / Compartilhar
          </Button>
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
          {tel && (
            <a href={tel} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Phone className="h-4 w-4" />
              Ligar
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface RouteSectionProps {
  board: DeliveryBoard;
  onDeliver: (stop: DeliveryStop) => void;
}

/** "Minha rota": next stop + the rest in the driver's own order (↑↓), with the system's suggestion one tap away. */
export function RouteSection({ board, onDeliver }: RouteSectionProps) {
  const reorder = useReorderDeliveries();
  const replan = useReplanDeliveries();
  const release = useReleaseDelivery();
  const [busyId, setBusyId] = useState<string | null>(null);

  const mine = board.mine;
  const limit = board.settings.waitLimitMinutes;
  if (mine.length === 0) return null;

  const [next, ...rest] = mine;

  const move = async (index: number, delta: -1 | 1) => {
    const ids = mine.map((m) => m.orderId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    try {
      await reorder.mutateAsync(ids);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível reordenar");
    }
  };

  const useSuggestion = async () => {
    const pos = await getCurrentPosition();
    try {
      await replan.mutateAsync(pos ?? undefined);
      toast.success("Rota reorganizada pela sugestão");
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível reorganizar");
    }
  };

  const giveBack = async (stop: DeliveryStop) => {
    setBusyId(stop.orderId);
    try {
      await release.mutateAsync(stop.orderId);
      toast.success(`Pedido #${stop.orderNumber} voltou para a fila`);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível devolver");
    } finally {
      setBusyId(null);
    }
  };

  const routeUrl = googleMapsRouteUrl(mine.map((m) => navAddress(m)));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          Minha rota <span className="text-muted-foreground font-normal">({mine.length})</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={routeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <RouteIcon className="h-4 w-4" />
            Rota completa no Maps
          </a>
          <Button variant="outline" size="sm" onClick={useSuggestion} disabled={replan.isPending}>
            <RefreshCw className={cn("h-4 w-4", replan.isPending && "animate-spin")} />
            Usar sugestão
          </Button>
        </div>
      </div>

      {board.suggestionDiffers && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          A ordem sugerida pelo sistema (espera + distância) é outra. Você decide: siga a sua ou toque em{" "}
          <b>Usar sugestão</b>.
        </p>
      )}

      {next && <NextStopCard stop={next} total={mine.length} limit={limit} onDeliver={onDeliver} />}

      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((stop, i) => {
            const index = i + 1;
            return (
              <Card key={stop.orderId}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">
                        #{stop.orderNumber} · {stop.customerName || "Cliente"}
                      </p>
                      <p className="text-sm break-words">{stop.address || "Sem endereço"}</p>
                      {stop.city && <p className="text-xs text-muted-foreground">{stop.city}</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                        aria-label="Subir na rota"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === mine.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                        aria-label="Descer na rota"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <WaitChip minutes={stop.waitMinutes} limit={limit} />
                    <PaymentChip stop={stop} />
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {stop.reasonText}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onDeliver(stop)}>
                      <CheckCircle2 className="h-4 w-4" />
                      Entregue
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={busyId === stop.orderId}
                      onClick={() => giveBack(stop)}
                    >
                      <Undo2 className="h-4 w-4" />
                      Devolver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {next && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={busyId === next.orderId}
            onClick={() => giveBack(next)}
          >
            <Undo2 className="h-4 w-4" />
            Devolver a próxima à fila
          </Button>
        </div>
      )}
    </section>
  );
}

export { PaymentChip, WaitChip };
