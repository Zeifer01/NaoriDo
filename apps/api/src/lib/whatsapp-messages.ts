export const WHATSAPP_MESSAGE_KEYS = [
  "order_created",
  "order_edited",
  "delivery_fee_updated",
  "status_confirmed",
  "status_preparing",
  "status_ready",
  "status_completed",
  "status_cancelled",
  "auto_reply",
  "closed_hours",
] as const;

export type WhatsAppMessageKey = (typeof WHATSAPP_MESSAGE_KEYS)[number];
export type WhatsAppMessageTemplates = Record<WhatsAppMessageKey, string>;

export const WHATSAPP_MESSAGE_LABELS: Record<WhatsAppMessageKey, string> = {
  order_created: "Pedido recebido",
  order_edited: "Pedido editado",
  delivery_fee_updated: "Frete corrigido",
  status_confirmed: "Pedido confirmado",
  status_preparing: "Em preparo",
  status_ready: "Saiu / Pronto para retirada",
  status_completed: "Pedido entregue",
  status_cancelled: "Pedido cancelado",
  auto_reply: "Resposta automática",
  closed_hours: "Fora do horário de atendimento",
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
  delivery_fee_updated: [
    "Olá, {cliente}!",
    "",
    "A taxa de entrega do pedido *#{pedido}* foi corrigida pela nossa equipe.",
    "Frete: *{frete}*",
    "Novo total: *{total}*",
    "",
    "Acompanhe seu pedido atualizado:",
    "{link}",
  ].join("\n"),
  order_created: [
    "Olá, {cliente}! 👋",
    "",
    "Recebemos seu pedido de delivery *#{pedido}*.",
    "Total: {total}",
    "{frete_bloco}",
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
    "Seu pedido está *em preparo*.",
    "{estimativa_bloco}",
    "",
    "Acompanhe: {link}",
  ].join("\n"),
  status_ready: [
    "Olá, {cliente}!",
    "",
    "Pedido *#{pedido}*",
    "{status_ready_texto}",
    "",
    "Acompanhe: {link}",
  ].join("\n"),
  status_completed: [
    "Olá, {cliente}!",
    "",
    "Pedido *#{pedido}*",
    "Seu pedido foi *concluído*. Obrigado pela preferência!",
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
  closed_hours: [
    "Olá! 👋 Obrigado por entrar em contato com *{estabelecimento}*.",
    "",
    "O atendimento de hoje já foi encerrado.",
    "Horário de hoje: {horario_hoje}",
    "",
    "Assim que reabrirmos, te respondemos por aqui. Até breve! 🙏",
  ].join("\n"),
};

export const WHATSAPP_TEMPLATE_VARIABLES = [
  "{cliente}",
  "{pedido}",
  "{total}",
  "{frete}",
  "{frete_bloco}",
  "{endereco_bloco}",
  "{estimativa}",
  "{estimativa_bloco}",
  "{status_ready_texto}",
  "{link}",
  "{estabelecimento}",
  "{link_cardapio}",
  "{nome}",
  "{horario_hoje}",
] as const;

export function getWhatsAppPhoneCountryCode(settings?: unknown): string {
  const raw = (settings || {}) as Record<string, unknown>;
  const code = raw.whatsapp_phone_country_code;
  if (typeof code === "string" && code.replace(/\D/g, "").length > 0) {
    return code.replace(/\D/g, "");
  }
  return "55";
}

export function getWhatsAppKitchenGroupJid(settings?: unknown): string | null {
  const raw = (settings || {}) as Record<string, unknown>;
  const jid = raw.whatsapp_kitchen_group_jid;
  if (typeof jid === "string" && jid.trim()) {
    return jid.trim();
  }
  return null;
}

export function getWhatsAppDefaultEtaMinutes(settings?: unknown): number {
  const raw = (settings || {}) as Record<string, unknown>;
  const value = raw.whatsapp_default_eta_minutes;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(180, Math.round(value));
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.min(180, Math.round(n));
  }
  return 30;
}

/** When false, status changes do not auto-message the customer (manual notify only). */
export function isWhatsAppAutoStatusNotifyEnabled(settings?: unknown): boolean {
  const raw = (settings || {}) as Record<string, unknown>;
  return raw.whatsapp_auto_status_notify !== false;
}

const STATUS_KEY_BY_ORDER_STATUS: Partial<Record<string, WhatsAppMessageKey>> = {
  confirmed: "status_confirmed",
  preparing: "status_preparing",
  ready: "status_ready",
  completed: "status_completed",
  cancelled: "status_cancelled",
};

/** Sentence used in status_ready templates, by order type. */
export function getStatusReadyTexto(orderType: string | null | undefined): string {
  if (orderType === "delivery") {
    return "Seu pedido *saiu para a entrega*! 🛵";
  }
  return "Seu pedido está *pronto para retirada*!";
}

export function getStatusMessageKey(
  status: string,
  options?: { skipConfirmed?: boolean },
): WhatsAppMessageKey | null {
  if (options?.skipConfirmed && status === "confirmed") return null;
  return STATUS_KEY_BY_ORDER_STATUS[status] || null;
}

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
