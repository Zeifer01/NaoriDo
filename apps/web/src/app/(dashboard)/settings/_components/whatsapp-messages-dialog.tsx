"use client";

import { useEffect, useState } from "react";
import { Button } from "@restai/ui/components/button";
import { Label } from "@restai/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@restai/ui/components/dialog";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useUpdateWhatsAppSettings,
  type WhatsAppMessageKey,
  type WhatsAppMessageTemplates,
} from "@/hooks/use-whatsapp";

const MESSAGE_LABELS: Record<WhatsAppMessageKey, string> = {
  order_created: "Pedido recebido",
  status_confirmed: "Pedido confirmado",
  status_preparing: "Em preparo",
  status_ready: "Pronto para entrega",
  status_completed: "Pedido entregue",
  status_cancelled: "Pedido cancelado",
  auto_reply: "Resposta automática",
};

const MESSAGE_KEYS: WhatsAppMessageKey[] = [
  "order_created",
  "status_confirmed",
  "status_preparing",
  "status_ready",
  "status_completed",
  "status_cancelled",
  "auto_reply",
];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppMessageTemplates = {
  order_created: [
    "Olá, {cliente}! 👋",
    "",
    "Recebemos seu pedido de delivery *#{pedido}*.",
    "Total: {total}",
    "{endereco_bloco}",
    "",
    "Acompanhe o status aqui:",
    "{link}",
  ].join("\n"),
  status_confirmed: [
    "Olá, {cliente}!",
    "",
    "Pedido *#{pedido}*",
    "Seu pedido foi *confirmado* e em breve entrará em preparo.",
    "",
    "Acompanhe: {link}",
  ].join("\n"),
  status_preparing: [
    "Olá, {cliente}!",
    "",
    "Pedido *#{pedido}*",
    "Seu pedido está *em preparo* na cozinha.",
    "",
    "Acompanhe: {link}",
  ].join("\n"),
  status_ready: [
    "Olá, {cliente}!",
    "",
    "Pedido *#{pedido}*",
    "Seu pedido está *pronto* e sairá para entrega em instantes.",
    "",
    "Acompanhe: {link}",
  ].join("\n"),
  status_completed: [
    "Olá, {cliente}!",
    "",
    "Pedido *#{pedido}*",
    "Seu pedido foi *entregue*. Obrigado pela preferência!",
    "",
    "Acompanhe: {link}",
  ].join("\n"),
  status_cancelled: [
    "Olá, {cliente}!",
    "",
    "Pedido *#{pedido}*",
    "Seu pedido foi *cancelado*. Entre em contato conosco se precisar de ajuda.",
    "",
    "Acompanhe: {link}",
  ].join("\n"),
  auto_reply: [
    "Olá! 👋 Obrigado por entrar em contato com *{estabelecimento}*!",
    "",
    "Confira nosso cardápio e faça seu pedido:",
    "{link_cardapio}",
    "",
    "Em breve um atendente irá te responder. 🙏",
  ].join("\n"),
};

type WhatsAppMessagesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: WhatsAppMessageTemplates;
};

export function WhatsAppMessagesDialog({
  open,
  onOpenChange,
  templates,
}: WhatsAppMessagesDialogProps) {
  const updateSettings = useUpdateWhatsAppSettings();
  const [draft, setDraft] = useState<WhatsAppMessageTemplates>(templates);
  const [activeKey, setActiveKey] = useState<WhatsAppMessageKey>("order_created");

  useEffect(() => {
    if (open) {
      setDraft(templates);
      setActiveKey("order_created");
    }
  }, [open, templates]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({ messageTemplates: draft });
      toast.success("Mensagens automáticas salvas");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar mensagens");
    }
  };

  const handleResetAll = () => {
    setDraft(DEFAULT_WHATSAPP_TEMPLATES);
    toast.message("Mensagens restauradas para o padrão. Clique em Salvar para aplicar.");
  };

  const handleResetOne = (key: WhatsAppMessageKey) => {
    setDraft((current) => ({
      ...current,
      [key]: DEFAULT_WHATSAPP_TEMPLATES[key],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Mensagens automáticas</DialogTitle>
          <DialogDescription>
            Personalize os textos enviados aos clientes. Use negrito com *asteriscos* como no WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-h-0 flex-1 overflow-hidden md:flex-row">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto md:min-w-[180px] shrink-0">
            {MESSAGE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveKey(key)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm whitespace-nowrap transition-colors",
                  activeKey === key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                {MESSAGE_LABELS[key]}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 min-h-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="whatsapp-message-template">{MESSAGE_LABELS[activeKey]}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleResetOne(activeKey)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Restaurar
              </Button>
            </div>
            <textarea
              id="whatsapp-message-template"
              value={draft[activeKey]}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  [activeKey]: e.target.value,
                }))
              }
              rows={12}
              className={cn(
                "flex min-h-[240px] w-full rounded-md border border-input bg-background px-3 py-2",
                "text-sm ring-offset-background placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50 resize-y",
              )}
            />
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Variáveis disponíveis</p>
              {activeKey === "auto_reply" ? (
                <p>
                  <code className="bg-muted px-1 rounded">{"{estabelecimento}"}</code> nome da filial ·{" "}
                  <code className="bg-muted px-1 rounded">{"{link_cardapio}"}</code> link do cardápio online
                </p>
              ) : (
                <>
                  <p>
                    <code className="bg-muted px-1 rounded">{"{cliente}"}</code> nome do cliente ·{" "}
                    <code className="bg-muted px-1 rounded">{"{pedido}"}</code> número do pedido ·{" "}
                    <code className="bg-muted px-1 rounded">{"{total}"}</code> valor total
                  </p>
                  <p>
                    <code className="bg-muted px-1 rounded">{"{endereco_bloco}"}</code> endereço (só no
                    pedido recebido) · <code className="bg-muted px-1 rounded">{"{link}"}</code> link de
                    acompanhamento
                  </p>
                </>
              )}
              <p>Deixe uma linha em branco entre os blocos para criar espaçamento no WhatsApp.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleResetAll}>
            Restaurar tudo
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Salvar mensagens
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
