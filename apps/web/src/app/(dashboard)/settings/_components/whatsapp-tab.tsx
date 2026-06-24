"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@restai/ui/components/card";
import { Button } from "@restai/ui/components/button";
import { Badge } from "@restai/ui/components/badge";
import { Loader2, MessageCircle, Pencil, QrCode, Unplug } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useConnectWhatsApp,
  useDisconnectWhatsApp,
  useUpdateWhatsAppSettings,
  useWhatsAppStatus,
} from "@/hooks/use-whatsapp";
import { WhatsAppMessagesDialog, DEFAULT_WHATSAPP_TEMPLATES } from "./whatsapp-messages-dialog";

const stateLabels: Record<string, { label: string; className: string }> = {
  open: { label: "Conectado", className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20" },
  close: { label: "Desconectado", className: "bg-muted text-muted-foreground border-border" },
  connecting: { label: "Conectando...", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  unknown: { label: "Indisponível", className: "bg-muted text-muted-foreground border-border" },
};

export function WhatsAppTab() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pollConnecting, setPollConnecting] = useState(false);
  const [messagesDialogOpen, setMessagesDialogOpen] = useState(false);

  const { data: status, isLoading, isError, error } = useWhatsAppStatus({ pollWhileConnecting: pollConnecting });
  const connect = useConnectWhatsApp();
  const disconnect = useDisconnectWhatsApp();
  const updateSettings = useUpdateWhatsAppSettings();

  useEffect(() => {
    if (status?.connected) {
      setQrCode(null);
      setPairingCode(null);
      setPollConnecting(false);
    }
  }, [status?.connected]);

  const normalizeQrcode = (value: string) =>
    value.startsWith("data:") ? value : `data:image/png;base64,${value}`;

  const handleConnect = async () => {
    try {
      setPollConnecting(true);
      setQrCode(null);
      setPairingCode(null);
      toast.message("Gerando QR Code… pode levar até 40 segundos");
      const result = await connect.mutateAsync();
      if (result.qrcode) {
        setQrCode(normalizeQrcode(result.qrcode));
      }
      if (result.pairingCode) {
        setPairingCode(result.pairingCode);
      }
      if (result.state === "open") {
        toast.success("WhatsApp conectado");
        setPollConnecting(false);
      } else if (result.qrcode || result.pairingCode) {
        toast.success("QR Code pronto — escaneie no WhatsApp");
      } else {
        toast.error("QR Code não retornado. Tente novamente em alguns segundos.");
        setPollConnecting(false);
      }
    } catch (err: any) {
      setPollConnecting(false);
      toast.error(err.message || "Erro ao conectar WhatsApp");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      setQrCode(null);
      setPairingCode(null);
      setPollConnecting(false);
      toast.success("WhatsApp desconectado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao desconectar");
    }
  };

  const handleToggleNotifications = async () => {
    if (!status) return;
    try {
      await updateSettings.mutateAsync({
        notificationsEnabled: !status.notificationsEnabled,
      });
      toast.success(
        status.notificationsEnabled
          ? "Notificações automáticas desativadas"
          : "Notificações automáticas ativadas",
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar preferência");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const errorMessage = (error as Error | undefined)?.message || "";
  const apiRouteMissing =
    isError &&
    (errorMessage.includes("404") ||
      errorMessage.includes("Rota não encontrada") ||
      errorMessage.includes("não encontrada"));

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-destructive font-medium">
            {apiRouteMissing
              ? "A API está desatualizada — falta a rota /api/whatsapp."
              : "Não foi possível consultar o status do WhatsApp."}
          </p>
          {apiRouteMissing ? (
            <p className="text-muted-foreground">
              Pare o servidor (<code className="text-xs bg-muted px-1 rounded">Ctrl+C</code>) e rode{" "}
              <code className="text-xs bg-muted px-1 rounded">bun run dev</code> de novo na raiz do
              projeto.
            </p>
          ) : (
            <p className="text-muted-foreground">{errorMessage}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const stateInfo = stateLabels[status?.state || "unknown"] || stateLabels.unknown;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </CardTitle>
              <CardDescription>
                Conecte o WhatsApp da filial para enviar confirmações e atualizações de pedidos delivery.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("border", stateInfo.className)}>
              {stateInfo.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.configured ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">API não configurada</p>
              <p>
                No servidor da API, configure no <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code>:
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                <li>WHATSAPP_ENABLED=true</li>
                <li>WHATSAPP_API_URL=http://localhost:8085</li>
                <li>WHATSAPP_API_KEY=restai-evolution-dev-key</li>
                <li>WHATSAPP_INSTANCE=restai</li>
              </ul>
              <p className="mt-3 font-medium text-foreground">Modo local (mesmo PC)</p>
              <p>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">docker compose up -d evolution-api</code>
              </p>
              <p className="mt-3 font-medium text-foreground">Modo túnel (acesso pela internet)</p>
              <ul className="mt-1 space-y-1 font-mono text-xs">
                <li>bun run tunnel:apply</li>
                <li>reinicie a API (bun run dev)</li>
              </ul>
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                Instância: <span className="font-mono text-foreground">{status.instanceName}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {!status.connected ? (
                  <Button onClick={handleConnect} disabled={connect.isPending}>
                    {connect.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4 mr-2" />
                    )}
                    Conectar WhatsApp
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleDisconnect} disabled={disconnect.isPending}>
                    {disconnect.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Unplug className="h-4 w-4 mr-2" />
                    )}
                    Desconectar
                  </Button>
                )}
              </div>

              {(connect.isPending || pollConnecting || qrCode || pairingCode) &&
                !status.connected && (
                <div className="rounded-lg border bg-muted/30 p-4 flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground text-center">
                    WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo
                  </p>
                  {connect.isPending && !qrCode && (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Gerando QR Code…</p>
                    </div>
                  )}
                  {qrCode && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCode}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 rounded-lg border bg-white p-2"
                      />
                    </>
                  )}
                  {pairingCode && (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Código de pareamento</p>
                      <p className="text-2xl font-mono tracking-widest">{pairingCode}</p>
                    </div>
                  )}
                  {pollConnecting && !connect.isPending && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Aguardando conexão…
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Problemas? Abra{" "}
                    <a
                      href="http://localhost:8085/manager"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground"
                    >
                      Evolution Manager
                    </a>{" "}
                    e conecte a instância{" "}
                    <span className="font-mono">{status.instanceName}</span>.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {status?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cloudflare Tunnel</CardTitle>
            <CardDescription>
              Para expor a Evolution na internet sem domínio próprio, use o Quick Tunnel.
              A URL muda ao reiniciar o túnel — rode <code className="text-xs bg-muted px-1 rounded">bun run tunnel:apply</code> de novo.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {status?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notificações automáticas</CardTitle>
            <CardDescription>
              Enviar mensagens ao cliente quando um pedido delivery for criado ou mudar de status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              role="switch"
              aria-checked={status.notificationsEnabled}
              onClick={handleToggleNotifications}
              disabled={updateSettings.isPending}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                status.notificationsEnabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition",
                  status.notificationsEnabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
            <p className="text-xs text-muted-foreground">
              {status.notificationsEnabled
                ? "Clientes receberão confirmação e atualizações de status por WhatsApp."
                : "Nenhuma mensagem será enviada automaticamente."}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={() => setMessagesDialogOpen(true)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar mensagens automáticas
            </Button>

            <WhatsAppMessagesDialog
              open={messagesDialogOpen}
              onOpenChange={setMessagesDialogOpen}
              templates={status.messageTemplates ?? DEFAULT_WHATSAPP_TEMPLATES}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
