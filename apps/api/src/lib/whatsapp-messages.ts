export const WHATSAPP_MESSAGE_KEYS = [
  "order_created",
  "order_edited",
  "status_confirmed",
  "status_preparing",
  "status_ready",
  "status_completed",
  "status_cancelled",
  "auto_reply",
] as const;

export type WhatsAppMessageKey = (typeof WHATSAPP_MESSAGE_KEYS)[number];
export type WhatsAppMessageTemplates = Record<WhatsAppMessageKey, string>;

export const WHATSAPP_MESSAGE_LABELS: Record<WhatsAppMessageKey, string> = {
  order_created: "Pedido recebido",
  order_edited: "Pedido editado",
  status_confirmed: "Pedido confirmado",
  status_preparing: "Em preparo",
  status_ready: "Pronto para entrega",
  status_completed: "Pedido entregue",
  status_cancelled: "Pedido cancelado",
  auto_reply: "Resposta automática",
};

export const DEFAULT_WHATSAPP_MESSAGE_TEMPLATES: WhatsAppMessageTemplates = {
  order_edited: [
    "Olá, {cliente}!",
    "",
    "Seu pedido *#{pedido}* foi atualizado pela nossa equipe.",
    "Novo total: *{total}*",
    "",
    "Acompanhe o status aqui:",
    "{link}",
  ].join("\n"),
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

export const WHATSAPP_TEMPLATE_VARIABLES = [
  "{cliente}",
  "{pedido}",
  "{total}",
  "{endereco_bloco}",
  "{link}",
  "{estabelecimento}",
  "{link_cardapio}",
  "{nome}",
] as const;

const STATUS_KEY_BY_ORDER_STATUS: Partial<Record<string, WhatsAppMessageKey>> = {
  confirmed: "status_confirmed",
  preparing: "status_preparing",
  ready: "status_ready",
  completed: "status_completed",
  cancelled: "status_cancelled",
};

function readCustomTemplates(settings?: unknown): Partial<WhatsAppMessageTemplates> {
  const raw = (settings || {}) as Record<string, unknown>;
  const stored = raw.whatsapp_message_templates;
  if (!stored || typeof stored !== "object") return {};

  const custom: Partial<WhatsAppMessageTemplates> = {};
  for (const key of WHATSAPP_MESSAGE_KEYS) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      custom[key] = value.replace(/\r\n/g, "\n");
    }
  }
  return custom;
}

export function getWhatsAppMessageTemplates(settings?: unknown): WhatsAppMessageTemplates {
  const custom = readCustomTemplates(settings);
  return {
    ...DEFAULT_WHATSAPP_MESSAGE_TEMPLATES,
    ...custom,
  };
}

const PLACEHOLDER_PATTERN = /\{[a-z_]+\}/gi;

function lineIsPlaceholderOnly(line: string): boolean {
  return line.replace(PLACEHOLDER_PATTERN, "").trim().length === 0;
}

export function renderWhatsAppTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  const normalized = template.replace(/\r\n/g, "\n");
  const originalLines = normalized.split("\n");

  const renderedLines = originalLines.map((line) => {
    let rendered = line;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replaceAll(`{${key}}`, value);
    }
    return rendered;
  });

  return renderedLines
    .filter((rendered, index) => {
      const original = originalLines[index];

      // Preserva linhas em branco usadas como espaçamento no template
      if (original.trim().length === 0) {
        return true;
      }

      // Remove linhas que continham só variáveis vazias (ex.: {endereco_bloco})
      if (lineIsPlaceholderOnly(original) && rendered.trim().length === 0) {
        return false;
      }

      return rendered.trim().length > 0;
    })
    .join("\n")
    .trim();
}

export function getStatusMessageKey(status: string): WhatsAppMessageKey | null {
  return STATUS_KEY_BY_ORDER_STATUS[status] || null;
}
