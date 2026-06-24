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
  messageTemplates: WhatsAppMessageTemplates;
}> {
  const instanceName = getBranchInstanceName(branch);
  const notificationsEnabled = branchNotificationsEnabled(branch);
  const messageTemplates = getWhatsAppMessageTemplates(branch.settings);

  if (!isWhatsAppConfigured()) {
    return {
      configured: false,
      connected: false,
      state: "unknown",
      instanceName,
      notificationsEnabled,
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
