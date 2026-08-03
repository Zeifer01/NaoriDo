import { CURRENCIES } from "@restai/config";
import {
  getStatusMessageKey,
  getStatusReadyTexto,
  getWhatsAppDefaultEtaMinutes,
  getWhatsAppKitchenGroupJid,
  getWhatsAppMessageTemplates,
  getWhatsAppPhoneCountryCode,
  isWhatsAppAutoStatusNotifyEnabled,
  renderWhatsAppTemplate,
  type WhatsAppMessageKey,
  type WhatsAppMessageTemplates,
} from "../lib/whatsapp-messages.js";
import { formatOrderTicketText } from "../lib/order-ticket.js";
import {
  fetchConnectionState,
  formatPhoneForWhatsApp,
  getBranchInstanceName,
  isWhatsAppConfigured,
  sendWhatsAppText,
  WhatsAppError,
  type WhatsAppConnectionState,
} from "../lib/whatsapp.js";
import { redis } from "../lib/redis.js";
import { db, schema } from "@restai/db";
import { eq, and, isNotNull, inArray, asc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getOrganizationStorefrontOrigin } from "../lib/tenant-host.js";
import { hasSimplifiedOrderStatus } from "@restai/config";

export { getWhatsAppMessageTemplates, type WhatsAppMessageTemplates };

const FALLBACK_APP_URL =
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
  delivery_reference?: string | null;
  payment_method?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  created_at?: Date | string | null;
  table_name?: string | null;
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

async function resolveTenantOrigin(organizationId?: string | null): Promise<string> {
  if (organizationId) {
    const origin = await getOrganizationStorefrontOrigin(organizationId);
    if (origin) return origin.replace(/\/$/, "");
  }
  return FALLBACK_APP_URL.replace(/\/$/, "");
}

async function trackingUrl(
  branch: BranchLike,
  orderId: string,
): Promise<string> {
  const origin = await resolveTenantOrigin(branch.organization_id);
  if (branch.organization_id) {
    const branches = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.organization_id, branch.organization_id),
          eq(schema.branches.is_active, true),
        ),
      );
    if (branches.length > 1) {
      return `${origin}/${branch.slug}/pedido/${orderId}`;
    }
  }
  return `${origin}/pedido/${orderId}`;
}

async function menuUrlForBranch(branch: BranchLike): Promise<string> {
  const origin = await resolveTenantOrigin(branch.organization_id);
  if (branch.organization_id) {
    const branches = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.organization_id, branch.organization_id),
          eq(schema.branches.is_active, true),
        ),
      );
    if (branches.length > 1) {
      return `${origin}/${branch.slug}/pedir`;
    }
  }
  return `${origin}/pedir`;
}

export async function getWhatsAppStatusForBranch(branch: BranchLike): Promise<{
  configured: boolean;
  connected: boolean;
  state: WhatsAppConnectionState;
  instanceName: string;
  notificationsEnabled: boolean;
  autoReplyEnabled: boolean;
  autoStatusNotify: boolean;
  kitchenGroupJid: string | null;
  defaultEtaMinutes: number;
  phoneCountryCode: string;
  messageTemplates: WhatsAppMessageTemplates;
}> {
  const instanceName = getBranchInstanceName(branch);
  const notificationsEnabled = branchNotificationsEnabled(branch);
  const settings = (branch.settings || {}) as Record<string, unknown>;
  const autoReplyEnabled = settings.whatsapp_auto_reply_enabled === true;
  const autoStatusNotify = isWhatsAppAutoStatusNotifyEnabled(branch.settings);
  const kitchenGroupJid = getWhatsAppKitchenGroupJid(branch.settings);
  const defaultEtaMinutes = getWhatsAppDefaultEtaMinutes(branch.settings);
  const phoneCountryCode = getWhatsAppPhoneCountryCode(branch.settings);
  const messageTemplates = getWhatsAppMessageTemplates(branch.settings);

  if (!isWhatsAppConfigured()) {
    return {
      configured: false,
      connected: false,
      state: "unknown",
      instanceName,
      notificationsEnabled,
      autoReplyEnabled,
      autoStatusNotify,
      kitchenGroupJid,
      defaultEtaMinutes,
      phoneCountryCode,
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
    autoStatusNotify,
    kitchenGroupJid,
    defaultEtaMinutes,
    phoneCountryCode,
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

  const countryCode = getWhatsAppPhoneCountryCode(branch.settings);
  try {
    await sendWhatsAppText(instanceName, phone, message, { countryCode });
  } catch (err) {
    logger.error(
      { err, branchId: branch.id, orderId: order.id, phone: formatPhoneForWhatsApp(phone, countryCode) },
      "Failed to send WhatsApp message",
    );
  }
}

async function assertWhatsAppReady(branch: BranchLike): Promise<string> {
  if (!isWhatsAppConfigured()) {
    throw new WhatsAppError("WhatsApp não configurado na API", 503);
  }
  if (!branchNotificationsEnabled(branch)) {
    throw new WhatsAppError("Notificações WhatsApp desativadas nesta filial", 400);
  }
  const instanceName = getBranchInstanceName(branch);
  const { connected } = await fetchConnectionState(instanceName);
  if (!connected) {
    throw new WhatsAppError("WhatsApp desconectado. Conecte em Configurações.", 400);
  }
  return instanceName;
}

function estimativaVars(etaMinutes?: number | null): {
  estimativa: string;
  estimativa_bloco: string;
} {
  if (etaMinutes == null || !Number.isFinite(etaMinutes) || etaMinutes <= 0) {
    return { estimativa: "", estimativa_bloco: "" };
  }
  const mins = Math.round(etaMinutes);
  return {
    estimativa: String(mins),
    estimativa_bloco: `Nossa estimativa para entrega é de *${mins} minutos*.`,
  };
}

async function loadOrderItemsForTicket(orderId: string) {
  const items = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.order_id, orderId))
    .orderBy(asc(schema.orderItems.name));

  const itemIds = items.map((i) => i.id);
  const mods =
    itemIds.length > 0
      ? await db
          .select()
          .from(schema.orderItemModifiers)
          .where(inArray(schema.orderItemModifiers.order_item_id, itemIds))
      : [];

  const modsByItem = new Map<string, typeof mods>();
  for (const mod of mods) {
    const list = modsByItem.get(mod.order_item_id) ?? [];
    list.push(mod);
    modsByItem.set(mod.order_item_id, list);
  }

  return items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    notes: item.notes,
    modifiers: (modsByItem.get(item.id) || []).map((m) => ({
      name: m.name,
      is_outside_cup: m.is_outside_cup,
    })),
  }));
}

export type ManualNotifyTarget = "kitchen" | "customer";

/**
 * Manual notify from Comandas / Kitchen:
 * - kitchen: full ticket text to WhatsApp group
 * - customer: status template (or delivery_fee_updated) to delivery_phone
 */
export async function sendManualOrderNotify(
  branch: BranchLike,
  order: OrderLike & {
    delivery_fee?: number | null;
    delivery_fee_status?: string | null;
  },
  target: ManualNotifyTarget,
  options?: { etaMinutes?: number; templateKey?: WhatsAppMessageKey },
): Promise<{ target: ManualNotifyTarget; messagePreview: string }> {
  const instanceName = await assertWhatsAppReady(branch);
  const countryCode = getWhatsAppPhoneCountryCode(branch.settings);

  if (target === "kitchen") {
    const groupJid = getWhatsAppKitchenGroupJid(branch.settings);
    if (!groupJid) {
      throw new WhatsAppError(
        "Grupo da cozinha não configurado. Defina o JID em Configurações → WhatsApp.",
        400,
      );
    }

    const items = await loadOrderItemsForTicket(order.id);
    const message = formatOrderTicketText({
      orderNumber: order.order_number,
      customerName: order.customer_name,
      deliveryPhone: order.delivery_phone,
      deliveryAddress: order.delivery_address,
      deliveryReference: order.delivery_reference,
      paymentMethod: order.payment_method,
      tableName: order.table_name,
      notes: order.notes,
      total: order.total,
      currency: branch.currency || "BRL",
      items,
    });

    await sendWhatsAppText(instanceName, groupJid, message, { countryCode });
    return { target, messagePreview: message };
  }

  // customer
  const phone = order.delivery_phone?.trim();
  if (!phone) {
    throw new WhatsAppError("Pedido sem telefone WhatsApp do cliente", 400);
  }

  const status = order.status;
  let templateKey: WhatsAppMessageKey | null =
    options?.templateKey ?? getStatusMessageKey(status);
  if (!options?.templateKey && (status === "pending" || status === "confirmed")) {
    templateKey = "status_confirmed";
  }

  const allowedCustomerTemplates: WhatsAppMessageKey[] = [
    "status_preparing",
    "status_ready",
    "status_confirmed",
    "delivery_fee_updated",
    "order_edited",
  ];
  if (!templateKey || !allowedCustomerTemplates.includes(templateKey)) {
    throw new WhatsAppError(
      "Notificar cliente disponível nos status: criado/confirmado, em preparo, pronto — ou frete corrigido.",
      400,
    );
  }

  const eta =
    options?.etaMinutes ??
    (templateKey === "status_preparing"
      ? getWhatsAppDefaultEtaMinutes(branch.settings)
      : null);
  const { estimativa, estimativa_bloco } = estimativaVars(
    templateKey === "status_preparing" ? eta : null,
  );

  const templates = getWhatsAppMessageTemplates(branch.settings);
  const customer = order.customer_name?.trim() || "Cliente";
  const link = await trackingUrl(branch, order.id);
  const currency = branch.currency || "BRL";
  const message = renderWhatsAppTemplate(templates[templateKey], {
    cliente: customer,
    pedido: order.order_number,
    total: formatMoney(order.total, currency),
    frete: formatMoney(order.delivery_fee ?? 0, currency),
    frete_bloco: "",
    endereco_bloco: order.delivery_address
      ? `Endereço: ${order.delivery_address}`
      : "",
    estimativa,
    estimativa_bloco,
    status_ready_texto: getStatusReadyTexto(order.type),
    link,
  });

  await sendWhatsAppText(instanceName, phone, message, { countryCode });
  return { target, messagePreview: message };
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
  const link = await trackingUrl(branch, order.id);

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
  order: OrderLike & { delivery_fee_status?: string | null; delivery_fee?: number | null },
): Promise<void> {
  const templates = getWhatsAppMessageTemplates(branch.settings);
  const customer = order.customer_name?.trim() || "Cliente";
  const currency = branch.currency || "BRL";
  const total = formatMoney(order.total, currency);
  const link = await trackingUrl(branch, order.id);
  const endereco_bloco = order.delivery_address
    ? `Endereço: ${order.delivery_address}`
    : "";
  const pending = order.delivery_fee_status === "pending";
  const frete_bloco = pending
    ? "Frete a confirmar — validamos o endereço e confirmamos o valor no WhatsApp."
    : order.delivery_fee != null
      ? `Frete: ${formatMoney(order.delivery_fee, currency)}`
      : "";

  const message = renderWhatsAppTemplate(templates.order_created, {
    cliente: customer,
    pedido: order.order_number,
    total,
    frete: formatMoney(order.delivery_fee ?? 0, currency),
    frete_bloco,
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

  const settings = (branch.settings || {}) as Record<string, unknown>;
  if (!settings.whatsapp_auto_reply_enabled) return;

  const dedupeKey = `wa:auto_reply:${instanceName}:${phone}`;
  const alreadyReplied = await redis.get(dedupeKey);
  if (alreadyReplied) return;
  await redis.setex(dedupeKey, 300, "1");

  const templates = getWhatsAppMessageTemplates(branch.settings);
  const menuUrl = await menuUrlForBranch(branch);

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
  const menuUrl = await menuUrlForBranch(branch);

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
  remainingItems: Array<{ name: string; quantity: number; total: number }>,
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
  const currency = branch.currency || "BRL";

  const rawAdminPhone = (branch.phone || "").replace(/\D/g, "");
  const adminWaPhone = rawAdminPhone && !rawAdminPhone.startsWith("55") ? `55${rawAdminPhone}` : rawAdminPhone;
  const prefilledMsg = encodeURIComponent(
    `Olá! Preciso editar meu pedido #${order.order_number} — o item "${itemName}" ficou indisponível.`,
  );
  const adminLink = adminWaPhone ? `https://wa.me/${adminWaPhone}?text=${prefilledMsg}` : null;

  // Build order summary for remaining items
  let orderSummary = "";
  if (remainingItems.length > 0) {
    const lines = remainingItems
      .map((i) => `• ${i.quantity}x ${i.name} — ${formatMoney(i.total, currency)}`)
      .join("\n");
    orderSummary =
      `📋 *Sua comanda atualizada:*\n${lines}\n\n` +
      `*Total: ${formatMoney(order.total, currency)}*`;
  }

  const editLink = await trackingUrl(branch, order.id);

  const message =
    `Olá, ${customer}! 😔\n\n` +
    `O item *${itemName}* do seu pedido *#${order.order_number}* ficou indisponível e foi removido automaticamente.\n\n` +
    (orderSummary ? orderSummary + "\n\n" : "") +
    (remainingItems.length > 0
      ? `Se quiser fazer alterações no seu pedido, acesse o link abaixo:\n${editLink}`
      : `Todos os itens do seu pedido foram afetados. Entre em contato com nosso atendente.`) +
    `\n\nObrigado pela compreensão! 🙏`;

  try {
    await sendWhatsAppText(instanceName, phone, message);
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
  if (!isWhatsAppAutoStatusNotifyEnabled(branch.settings)) {
    return;
  }

  let skipConfirmed = false;
  if (branch.organization_id) {
    const [org] = await db
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, branch.organization_id))
      .limit(1);
    skipConfirmed = hasSimplifiedOrderStatus(org?.settings);
  }

  const templateKey = getStatusMessageKey(newStatus, { skipConfirmed });
  if (!templateKey) return;

  const templates = getWhatsAppMessageTemplates(branch.settings);
  const customer = order.customer_name?.trim() || "Cliente";
  const link = await trackingUrl(branch, order.id);
  const eta =
    templateKey === "status_preparing"
      ? getWhatsAppDefaultEtaMinutes(branch.settings)
      : null;
  const { estimativa, estimativa_bloco } = estimativaVars(eta);

  const message = renderWhatsAppTemplate(templates[templateKey], {
    cliente: customer,
    pedido: order.order_number,
    total: formatMoney(order.total, branch.currency || "BRL"),
    endereco_bloco: order.delivery_address ? `Endereço: ${order.delivery_address}` : "",
    estimativa,
    estimativa_bloco,
    status_ready_texto: getStatusReadyTexto(order.type),
    link,
  });

  await sendDeliveryMessage(branch, order, message);
}
