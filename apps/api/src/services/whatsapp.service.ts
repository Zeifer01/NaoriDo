import { CURRENCIES } from "@restai/config";
import {
  getStatusMessageKey,
  getWhatsAppMessageTemplates,
  renderWhatsAppTemplate,
  type WhatsAppMessageTemplates,
} from "../lib/whatsapp-messages.js";
import {
  fetchConnectionState,
  formatPhoneForWhatsApp,
  getBranchInstanceName,
  isWhatsAppConfigured,
  sendWhatsAppText,
  type WhatsAppConnectionState,
} from "../lib/whatsapp.js";
import { redis } from "../lib/redis.js";
import { db, schema } from "@restai/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export { getWhatsAppMessageTemplates, type WhatsAppMessageTemplates };

const APP_URL =
  process.env.APP_URL ||
  (process.env.CORS_ORIGINS || "http://localhost:3000").split(",")[0]?.trim() ||
  "http://localhost:3000";

type BranchLike = {
  id: string;
  slug: string;
  name: string;
  organization_id?: string;
  settings?: unknown;
  currency?: string;
};

type OrderLike = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  customer_name?: string | null;
};

function formatMoney(cents: number, currency = "BRL"): string {
  const code = (currency in CURRENCIES ? currency : "BRL") as keyof typeof CURRENCIES;
  const config = CURRENCIES[code];
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: code,
  }).format(cents / 100);
}

function branchNotificationsEnabled(branch: BranchLike): boolean {
  const settings = (branch.settings || {}) as Record<string, unknown>;
  return settings.whatsapp_notifications_enabled !== false;
}

function trackingUrl(branchSlug: string, orderId: string): string {
  return `${APP_URL.replace(/\/$/, "")}/delivery/${branchSlug}/pedido/${orderId}`;
}

export async function getWhatsAppStatusForBranch(branch: BranchLike): Promise<{
  configured: boolean;
  connected: boolean;
  state: WhatsAppConnectionState;
  instanceName: string;
  notificationsEnabled: boolean;
  autoReplyEnabled: boolean;
  messageTemplates: WhatsAppMessageTemplates;
}> {
  const instanceName = getBranchInstanceName(branch);
  const notificationsEnabled = branchNotificationsEnabled(branch);
  const settings = (branch.settings || {}) as Record<string, unknown>;
  const autoReplyEnabled = settings.whatsapp_auto_reply_enabled === true;
  const messageTemplates = getWhatsAppMessageTemplates(branch.settings);

  if (!isWhatsAppConfigured()) {
    return {
      configured: false,
      connected: false,
      state: "unknown",
      instanceName,
      notificationsEnabled,
      autoReplyEnabled,
      messageTemplates,
    };
  }

  const { state, connected } = await fetchConnectionState(instanceName);
  return {
    configured: true,
    connected,
    state,
    instanceName,
    notificationsEnabled,
    autoReplyEnabled,
    messageTemplates,
  };
}

async function sendDeliveryMessage(
  branch: BranchLike,
  order: OrderLike,
  message: string,
): Promise<void> {
  if (!isWhatsAppConfigured() || !branchNotificationsEnabled(branch)) {
    return;
  }

  const phone = order.delivery_phone;
  if (!phone) return;

  const instanceName = getBranchInstanceName(branch);
  const { connected } = await fetchConnectionState(instanceName);
  if (!connected) {
    logger.warn({ branchId: branch.id, instanceName }, "WhatsApp disconnected, skipping message");
    return;
  }

  try {
    await sendWhatsAppText(instanceName, phone, message);
  } catch (err) {
    logger.error(
      { err, branchId: branch.id, orderId: order.id, phone: formatPhoneForWhatsApp(phone) },
      "Failed to send WhatsApp message",
    );
  }
}

export async function notifyDeliveryOrderCreated(
  branch: BranchLike,
  order: OrderLike,
): Promise<void> {
  const templates = getWhatsAppMessageTemplates(branch.settings);
  const customer = order.customer_name?.trim() || "Cliente";
  const total = formatMoney(order.total, branch.currency || "BRL");
  const link = trackingUrl(branch.slug, order.id);
  const endereco_bloco = order.delivery_address
    ? `Endereço: ${order.delivery_address}`
    : "";

  const message = renderWhatsAppTemplate(templates.order_created, {
    cliente: customer,
    pedido: order.order_number,
    total,
    endereco_bloco,
    link,
  });

  await sendDeliveryMessage(branch, order, message);
}

export async function handleIncomingWebhook(
  instanceName: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const ev = event.toUpperCase().replace(".", "_");
  if (ev !== "MESSAGES_UPSERT") return;

  const key = data.key as Record<string, unknown> | undefined;
  if (!key || key.fromMe === true) return;

  const remoteJid = (key.remoteJid as string) || "";
  if (!remoteJid || remoteJid.includes("@g.us")) return;

  const phone = remoteJid.replace(/@s\.whatsapp\.net$/, "").replace(/@c\.us$/, "");
  if (!phone) return;

  const allBranches = await db.select().from(schema.branches);
  const branch = allBranches.find((b) => getBranchInstanceName(b) === instanceName);
  if (!branch) {
    logger.warn({ instanceName }, "Webhook: unknown instance");
    return;
  }

  const settings = (branch.settings || {}) as Record<string, unknown>;
  if (!settings.whatsapp_auto_reply_enabled) return;

  const dedupeKey = `wa:auto_reply:${instanceName}:${phone}`;
  const alreadyReplied = await redis.get(dedupeKey);
  if (alreadyReplied) return;
  await redis.setex(dedupeKey, 300, "1");

  const templates = getWhatsAppMessageTemplates(branch.settings);
  const menuUrl = `${APP_URL.replace(/\/$/, "")}/delivery/${branch.slug}/menu`;

  const message = renderWhatsAppTemplate(templates.auto_reply, {
    estabelecimento: branch.name,
    link_cardapio: menuUrl,
  });

  try {
    await sendWhatsAppText(instanceName, phone, message);
    logger.info({ instanceName, phone }, "Auto-reply sent");
  } catch (err) {
    logger.error({ err: (err as Error).message, instanceName, phone }, "Auto-reply failed");
  }
}

export async function sendCampaignMessage(
  branch: BranchLike & { organization_id: string },
  messageTemplate: string,
): Promise<{ sent: number; failed: number; total: number }> {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp não configurado");
  }

  const customers = await db
    .select({ name: schema.customers.name, phone: schema.customers.phone })
    .from(schema.customers)
    .where(and(
      eq(schema.customers.organization_id, branch.organization_id),
      isNotNull(schema.customers.phone),
    ));

  const instanceName = getBranchInstanceName(branch);
  const menuUrl = `${APP_URL.replace(/\/$/, "")}/delivery/${branch.slug}/menu`;

  let sent = 0;
  let failed = 0;

  for (const customer of customers) {
    if (!customer.phone) continue;
    const rendered = renderWhatsAppTemplate(messageTemplate, {
      nome: customer.name || "Cliente",
      estabelecimento: branch.name,
      link_cardapio: menuUrl,
    });
    try {
      await sendWhatsAppText(instanceName, customer.phone, rendered);
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed, total: customers.length };
}

export async function notifyDeliveryOrderStatusUpdated(
  branch: BranchLike,
  order: OrderLike,
  newStatus: string,
): Promise<void> {
  const templateKey = getStatusMessageKey(newStatus);
  if (!templateKey) return;

  const templates = getWhatsAppMessageTemplates(branch.settings);
  const customer = order.customer_name?.trim() || "Cliente";
  const link = trackingUrl(branch.slug, order.id);

  const message = renderWhatsAppTemplate(templates[templateKey], {
    cliente: customer,
    pedido: order.order_number,
    total: formatMoney(order.total, branch.currency || "BRL"),
    endereco_bloco: order.delivery_address ? `Endereço: ${order.delivery_address}` : "",
    link,
  });

  await sendDeliveryMessage(branch, order, message);
}
