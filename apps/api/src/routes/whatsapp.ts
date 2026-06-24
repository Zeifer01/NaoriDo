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
  WhatsAppError,
} from "../lib/whatsapp.js";
import { getWhatsAppStatusForBranch } from "../services/whatsapp.service.js";
import {
  DEFAULT_WHATSAPP_MESSAGE_TEMPLATES,
  WHATSAPP_MESSAGE_KEYS,
  type WhatsAppMessageKey,
} from "../lib/whatsapp-messages.js";

const whatsapp = new Hono<AppEnv>();
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
    messageTemplates: messageTemplatesSchema.partial().optional(),
  })
  .refine(
    (data) => data.notificationsEnabled !== undefined || data.messageTemplates !== undefined,
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
        messageTemplates: {
          ...DEFAULT_WHATSAPP_MESSAGE_TEMPLATES,
          ...((updatedSettings.whatsapp_message_templates as Record<string, string>) || {}),
        },
      },
    });
  },
);

export { whatsapp };
