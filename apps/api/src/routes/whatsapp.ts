import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db, schema } from "@restai/db";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { tenantMiddleware } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireFeature } from "../middleware/feature.js";
import { requireActivePlan } from "../middleware/active-plan.js";
import {
  connectInstance,
  fetchConnectionState,
  getBranchInstanceName,
  isWhatsAppConfigured,
  logoutInstance,
  setupWebhook,
  WhatsAppError,
} from "../lib/whatsapp.js";
import {
  getWhatsAppStatusForBranch,
  handleIncomingWebhook,
  sendCampaignMessage,
} from "../services/whatsapp.service.js";
import { logger } from "../lib/logger.js";
import {
  DEFAULT_WHATSAPP_MESSAGE_TEMPLATES,
  WHATSAPP_MESSAGE_KEYS,
  type WhatsAppMessageKey,
} from "../lib/whatsapp-messages.js";

const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || "https://api.naorido.com.br").replace(/\/$/, "");

const whatsapp = new Hono<AppEnv>();

// ── Public endpoints (before auth middleware) ──────────────────────────────

// POST /webhook — Evolution API calls this when messages arrive
whatsapp.post("/webhook", async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    logger.info("Webhook body", { body: JSON.stringify(body).slice(0, 500) });
    const instanceName = (body.instance as string) || "";
    const event = (body.event as string) || "";
    const data = (body.data as Record<string, unknown>) || {};
    await handleIncomingWebhook(instanceName, event, data);
  } catch (err) {
    logger.error("Webhook error", { err: (err as Error).message });
  }
  return c.json({ success: true });
});

// ── Protected endpoints ────────────────────────────────────────────────────
whatsapp.use("*", authMiddleware, tenantMiddleware);
whatsapp.use("*", requireActivePlan);
whatsapp.use("*", requireFeature("whatsapp"));

async function getBranchForTenant(tenant: { branchId?: string }) {
  if (!tenant.branchId) return null;
  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, tenant.branchId))
    .limit(1);
  return branch || null;
}

whatsapp.get("/status", requirePermission("settings:read"), async (c) => {
  const tenant = c.get("tenant") as any;
  const branch = await getBranchForTenant(tenant);

  if (!branch) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Filial não selecionada" } },
      400,
    );
  }

  try {
    const status = await getWhatsAppStatusForBranch(branch);
    return c.json({ success: true, data: status });
  } catch (err) {
    const message = err instanceof WhatsAppError ? err.message : "Erro ao consultar WhatsApp";
    return c.json({ success: false, error: { code: "WHATSAPP_ERROR", message } }, 502);
  }
});

whatsapp.post("/connect", requirePermission("settings:*"), async (c) => {
  const tenant = c.get("tenant") as any;
  const branch = await getBranchForTenant(tenant);

  if (!branch) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Filial não selecionada" } },
      400,
    );
  }

  if (!isWhatsAppConfigured()) {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_CONFIGURED",
          message:
            "WhatsApp não configurado na API. Defina WHATSAPP_ENABLED=true e as variáveis WHATSAPP_API_URL / WHATSAPP_API_KEY no .env.",
        },
      },
      503,
    );
  }

  try {
    const instanceName = getBranchInstanceName(branch);
    const result = await connectInstance(instanceName);
    return c.json({
      success: true,
      data: {
        instanceName,
        ...result,
      },
    });
  } catch (err) {
    const message = err instanceof WhatsAppError ? err.message : "Erro ao conectar WhatsApp";
    return c.json({ success: false, error: { code: "WHATSAPP_ERROR", message } }, 502);
  }
});

whatsapp.delete("/disconnect", requirePermission("settings:*"), async (c) => {
  const tenant = c.get("tenant") as any;
  const branch = await getBranchForTenant(tenant);

  if (!branch) {
    return c.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Filial não selecionada" } },
      400,
    );
  }

  if (!isWhatsAppConfigured()) {
    return c.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "WhatsApp não configurado na API" } },
      503,
    );
  }

  try {
    const instanceName = getBranchInstanceName(branch);
    await logoutInstance(instanceName);
    const { state, connected } = await fetchConnectionState(instanceName);
    return c.json({
      success: true,
      data: { instanceName, state, connected },
    });
  } catch (err) {
    const message = err instanceof WhatsAppError ? err.message : "Erro ao desconectar WhatsApp";
    return c.json({ success: false, error: { code: "WHATSAPP_ERROR", message } }, 502);
  }
});

const messageTemplatesSchema = z.object(
  Object.fromEntries(
    WHATSAPP_MESSAGE_KEYS.map((key) => [key, z.string().min(1).max(4000)]),
  ) as Record<WhatsAppMessageKey, z.ZodString>,
);

const updateSettingsSchema = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    autoReplyEnabled: z.boolean().optional(),
    messageTemplates: messageTemplatesSchema.partial().optional(),
  })
  .refine(
    (data) =>
      data.notificationsEnabled !== undefined ||
      data.autoReplyEnabled !== undefined ||
      data.messageTemplates !== undefined,
    { message: "Informe ao menos uma configuração para atualizar" },
  );

whatsapp.patch(
  "/settings",
  requirePermission("settings:*"),
  zValidator("json", updateSettingsSchema),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const branch = await getBranchForTenant(tenant);
    const body = c.req.valid("json");

    if (!branch) {
      return c.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Filial não selecionada" } },
        400,
      );
    }

    const currentSettings = (branch.settings || {}) as Record<string, unknown>;
    const currentTemplates =
      (currentSettings.whatsapp_message_templates as Record<string, string> | undefined) || {};

    const mergedTemplates = body.messageTemplates
      ? {
          ...currentTemplates,
          ...body.messageTemplates,
        }
      : currentTemplates;

    const merged = {
      ...currentSettings,
      ...(body.notificationsEnabled !== undefined
        ? { whatsapp_notifications_enabled: body.notificationsEnabled }
        : {}),
      ...(body.autoReplyEnabled !== undefined
        ? { whatsapp_auto_reply_enabled: body.autoReplyEnabled }
        : {}),
      ...(body.messageTemplates ? { whatsapp_message_templates: mergedTemplates } : {}),
    };

    const [updated] = await db
      .update(schema.branches)
      .set({ settings: merged, updated_at: new Date() })
      .where(eq(schema.branches.id, branch.id))
      .returning();

    const updatedSettings = (updated.settings || {}) as Record<string, unknown>;

    return c.json({
      success: true,
      data: {
        notificationsEnabled: updatedSettings.whatsapp_notifications_enabled !== false,
        autoReplyEnabled: updatedSettings.whatsapp_auto_reply_enabled === true,
        messageTemplates: {
          ...DEFAULT_WHATSAPP_MESSAGE_TEMPLATES,
          ...((updatedSettings.whatsapp_message_templates as Record<string, string>) || {}),
        },
      },
    });
  },
);

// POST /webhook/setup — configure Evolution API to call our webhook
whatsapp.post("/webhook/setup", requirePermission("settings:*"), async (c) => {
  const tenant = c.get("tenant") as any;
  const branch = await getBranchForTenant(tenant);

  if (!branch) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Filial não selecionada" } }, 400);
  }

  if (!isWhatsAppConfigured()) {
    return c.json({ success: false, error: { code: "NOT_CONFIGURED", message: "WhatsApp não configurado na API" } }, 503);
  }

  try {
    const instanceName = getBranchInstanceName(branch);
    const webhookUrl = `${API_PUBLIC_URL}/api/whatsapp/webhook`;
    await setupWebhook(instanceName, webhookUrl);
    return c.json({ success: true, data: { webhookUrl } });
  } catch (err) {
    const message = err instanceof WhatsAppError ? err.message : "Erro ao configurar webhook";
    return c.json({ success: false, error: { code: "WHATSAPP_ERROR", message } }, 502);
  }
});

// POST /campaigns/send — broadcast message to org customers with phone
whatsapp.post(
  "/campaigns/send",
  requirePermission("settings:*"),
  zValidator("json", z.object({ message: z.string().min(1).max(4000) })),
  async (c) => {
    const tenant = c.get("tenant") as any;
    const { message } = c.req.valid("json");
    const branch = await getBranchForTenant(tenant);

    if (!branch) {
      return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Filial não selecionada" } }, 400);
    }

    if (!isWhatsAppConfigured()) {
      return c.json({ success: false, error: { code: "NOT_CONFIGURED", message: "WhatsApp não configurado" } }, 503);
    }

    try {
      const result = await sendCampaignMessage(
        { ...branch, organization_id: tenant.organizationId },
        message,
      );
      return c.json({ success: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar campanha";
      return c.json({ success: false, error: { code: "CAMPAIGN_ERROR", message: msg } }, 502);
    }
  },
);

export { whatsapp };
