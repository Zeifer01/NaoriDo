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
  type?: string | null;
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

export async function notifyOrderEdited(
  branchId: string,
  order: OrderLike,
): Promise<void> {
  if (!order.delivery_phone) return;

  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);
  if (!branch) return;

  const templates = getWhatsAppMessageTemplates(branch.settings);
  const customer = order.customer_name?.trim() || "Cliente";
  const total = formatMoney(order.total, branch.currency || "BRL");
  const link = trackingUrl(branch.slug, order.id);

  const message = renderWhatsAppTemplate(templates.order_edited, {
    cliente: customer,
    pedido: order.order_number,
    total,
    link,
  });

  await sendDeliveryMessage(branch, order, message);
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
  logger.info("Webhook received", { instanceName, event, dataKeys: Object.keys(data) });

  const ev = event.toUpperCase().replace(".", "_");
  if (ev !== "MESSAGES_UPSERT") {
    logger.info("Webhook: skipped (not MESSAGES_UPSERT)", { ev });
    return;
  }

  const key = data.key as Record<string, unknown> | undefined;
  logger.info("Webhook: message key", { fromMe: key?.fromMe, remoteJid: key?.remoteJid });

  if (!key || key.fromMe === true) {
    logger.info("Webhook: skipped (fromMe or no key)");
    return;
  }

  const remoteJid = (key.remoteJid as string) || "";
  const remoteJidAlt = (key.remoteJidAlt as string) || "";

  // Evolution API v2 uses LID addressing: real phone is in remoteJidAlt when remoteJid ends with @lid
  const effectiveJid = remoteJid.endsWith("@lid") && remoteJidAlt.endsWith("@s.whatsapp.net")
    ? remoteJidAlt
    : remoteJid;

  // Only process real individual contacts — skip groups (@g.us), status (@broadcast)
  if (!effectiveJid.endsWith("@s.whatsapp.net")) {
    logger.info("Webhook: skipped (not @s.whatsapp.net)", { remoteJid, remoteJidAlt });
    return;
  }

  const phone = effectiveJid.replace("@s.whatsapp.net", "");
  if (!phone) return;

  const allBranches = await db.select().from(schema.branches);
  const branch = allBranches.find((b) => getBranchInstanceName(b) === instanceName);
  if (!branch) {
    logger.warn({ instanceName }, "Webhook: unknown instance");
    return;
  }

  // Handle pending item-unavailability responses (1 = keep, 2 = edit with admin)
  const msgData = (data.message as Record<string, unknown>) || {};
  const incomingText = (
    (msgData.conversation as string) ||
    ((msgData.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    ""
  ).trim();

  const unavailKey = `wa:unavail:${instanceName}:${phone}`;
  const pendingUnavail = await redis.get(unavailKey);

  if (pendingUnavail && (incomingText === "1" || incomingText === "2")) {
    await redis.del(unavailKey);
    const ctx = JSON.parse(pendingUnavail) as {
      orderNumber: string;
      itemName: string;
      adminLink: string | null;
    };

    const reply =
      incomingText === "1"
        ? `✅ Tudo certo! Seu pedido *#${ctx.orderNumber}* será mantido sem o item *${ctx.itemName}*.\n\nObrigado pela compreensão! 🙏`
        : ctx.adminLink
          ? `Ok! Para editar seu pedido *#${ctx.orderNumber}*, fale com nosso atendente:\n\n${ctx.adminLink}`
          : `Para editar seu pedido *#${ctx.orderNumber}*, entre em contato com nosso atendente.`;

    try {
      await sendWhatsAppText(instanceName, phone, reply);
      logger.info({ instanceName, phone, choice: incomingText }, "Unavailability reply sent");
    } catch (err) {
      logger.error({ err, instanceName, phone }, "Failed to send unavailability reply");
    }
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
    logger.error({ err: err instanceof Error ? err.message : String(err), instanceName, phone }, "Auto-reply failed");
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

export async function notifyItemUnavailable(
  branch: BranchLike & { phone?: string | null },
  order: OrderLike,
  itemName: string,
): Promise<void> {
  if (!isWhatsAppConfigured() || !branchNotificationsEnabled(branch)) return;

  const phone = order.delivery_phone;
  if (!phone) return;

  const instanceName = getBranchInstanceName(branch);
  const { connected } = await fetchConnectionState(instanceName);
  if (!connected) {
    logger.warn({ branchId: branch.id, instanceName }, "WhatsApp disconnected, skipping unavailability notification");
    return;
  }

  const customer = order.customer_name?.trim() || "Cliente";

  const rawAdminPhone = (branch.phone || "").replace(/\D/g, "");
  const adminWaPhone = rawAdminPhone && !rawAdminPhone.startsWith("55") ? `55${rawAdminPhone}` : rawAdminPhone;
  const prefilledMsg = encodeURIComponent(
    `Olá! Preciso editar meu pedido #${order.order_number} — o item "${itemName}" ficou indisponível.`,
  );
  const adminLink = adminWaPhone ? `https://wa.me/${adminWaPhone}?text=${prefilledMsg}` : null;

  const message =
    `Olá, ${customer}! 😔\n\n` +
    `Infelizmente o item *${itemName}* do seu pedido *#${order.order_number}* ficou indisponível para a entrega.\n\n` +
    `Responda com uma das opções:\n` +
    `*1* – Manter meu pedido sem esse item\n` +
    `*2* – Falar com o atendente para editar`;

  try {
    await sendWhatsAppText(instanceName, phone, message);

    const formattedPhone = formatPhoneForWhatsApp(phone);
    const redisKey = `wa:unavail:${instanceName}:${formattedPhone}`;
    await redis.setex(
      redisKey,
      86400,
      JSON.stringify({ orderNumber: order.order_number, itemName, adminLink }),
    );
  } catch (err) {
    logger.error(
      { err, branchId: branch.id, orderId: order.id },
      "Failed to send item unavailable notification",
    );
  }
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
