import QRCode from "qrcode";
import { logger } from "./logger.js";

const WHATSAPP_INSTANCE_PREFIX = process.env.WHATSAPP_INSTANCE || "restai";

function readWhatsAppEnv() {
  return {
    enabled: process.env.WHATSAPP_ENABLED === "true",
    apiUrl: (process.env.WHATSAPP_API_URL || "").replace(/\/$/, ""),
    apiKey: process.env.WHATSAPP_API_KEY || "",
  };
}

export type WhatsAppConnectionState = "open" | "close" | "connecting" | "unknown";

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

export function isWhatsAppConfigured(): boolean {
  const { enabled, apiUrl, apiKey } = readWhatsAppEnv();
  return enabled && Boolean(apiUrl && apiKey);
}

export function getBranchInstanceName(branch: {
  id: string;
  slug: string;
  settings?: unknown;
}): string {
  const settings = (branch.settings || {}) as Record<string, unknown>;
  if (typeof settings.whatsapp_instance === "string" && settings.whatsapp_instance.trim()) {
    return settings.whatsapp_instance.trim();
  }

  const slug = branch.slug.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return `${WHATSAPP_INSTANCE_PREFIX}-${slug || branch.id.slice(0, 8)}`;
}

export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

async function evolutionFetch<T = Record<string, unknown>>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  if (!isWhatsAppConfigured()) {
    throw new WhatsAppError("WhatsApp não configurado na API", 503);
  }

  const { apiUrl, apiKey } = readWhatsAppEnv();

  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...(options?.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const message =
      json?.response?.message?.[0] ||
      json?.message ||
      json?.error ||
      `Erro na Evolution API (${res.status})`;
    throw new WhatsAppError(String(message), res.status);
  }

  return json as T;
}

export async function fetchConnectionState(
  instanceName: string,
): Promise<{ state: WhatsAppConnectionState; connected: boolean }> {
  try {
    const data = await evolutionFetch<{ instance?: { state?: string } }>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
    const state = (data.instance?.state || "unknown") as WhatsAppConnectionState;
    return { state, connected: state === "open" };
  } catch (err) {
    if (err instanceof WhatsAppError && err.statusCode === 404) {
      return { state: "close", connected: false };
    }
    throw err;
  }
}

async function resetInstance(instanceName: string): Promise<void> {
  try {
    await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    });
  } catch {
    // ignore
  }

  try {
    await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    });
  } catch {
    // ignore
  }
}

type ConnectResponse = {
  base64?: string;
  qrcode?: { base64?: string; code?: string; pairingCode?: string | null; count?: number };
  pairingCode?: string | null;
  code?: string;
  count?: number;
};

async function buildQrcodeDataUrl(raw: ConnectResponse): Promise<string | null> {
  const base64 =
    raw.base64 ||
    raw.qrcode?.base64 ||
    null;

  if (base64) {
    return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  }

  const pairingString = raw.code || raw.qrcode?.code;
  if (pairingString) {
    return QRCode.toDataURL(pairingString, { margin: 1, width: 280 });
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchConnectPayload(instanceName: string): Promise<ConnectResponse | null> {
  try {
    return await evolutionFetch<ConnectResponse>(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );
  } catch (err) {
    if (err instanceof WhatsAppError && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function waitForQrcode(
  instanceName: string,
  attempts = 20,
  delayMs = 2000,
): Promise<{ qrcode: string | null; pairingCode: string | null; lastPayload: ConnectResponse }> {
  let lastPayload: ConnectResponse = {};

  for (let attempt = 0; attempt < attempts; attempt++) {
    const payload = await fetchConnectPayload(instanceName);
    if (!payload) {
      if (attempt < attempts - 1) {
        await sleep(delayMs);
      }
      continue;
    }

    lastPayload = payload;
    const qrcode = await buildQrcodeDataUrl(lastPayload);
    const pairingCode =
      lastPayload.pairingCode || lastPayload.qrcode?.pairingCode || null;

    if (qrcode || pairingCode) {
      return { qrcode, pairingCode, lastPayload };
    }

    const { state } = await fetchConnectionState(instanceName);
    if (state === "open") {
      return { qrcode: null, pairingCode: null, lastPayload };
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return {
    qrcode: null,
    pairingCode: lastPayload.pairingCode || lastPayload.qrcode?.pairingCode || null,
    lastPayload,
  };
}

export async function ensureInstance(instanceName: string): Promise<ConnectResponse | null> {
  try {
    return await evolutionFetch<ConnectResponse>("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
    });
  } catch (err) {
    if (err instanceof WhatsAppError && /already exists|exist|in use/i.test(err.message)) {
      return fetchConnectPayload(instanceName);
    }
    throw err;
  }
}

export async function connectInstance(instanceName: string): Promise<{
  qrcode: string | null;
  pairingCode: string | null;
  state: WhatsAppConnectionState;
}> {
  const { state: initialState } = await fetchConnectionState(instanceName);

  if (initialState === "open") {
    return { qrcode: null, pairingCode: null, state: "open" };
  }

  let { qrcode, pairingCode, lastPayload } = await waitForQrcode(instanceName, 5, 2000);

  if (!qrcode && !pairingCode) {
    logger.warn(
      { instanceName, payload: lastPayload },
      "QR code not returned by Evolution API, recreating instance",
    );
    await resetInstance(instanceName);
    const created = await ensureInstance(instanceName);
    await sleep(2000);

    if (created) {
      const createdQr = await buildQrcodeDataUrl(created);
      if (createdQr) {
        const { state } = await fetchConnectionState(instanceName);
        return {
          qrcode: createdQr,
          pairingCode: created.pairingCode || created.qrcode?.pairingCode || null,
          state,
        };
      }
    }

    ({ qrcode, pairingCode, lastPayload } = await waitForQrcode(instanceName, 15, 2000));
  }

  const { state } = await fetchConnectionState(instanceName);

  if (!qrcode && !pairingCode && state !== "open") {
    throw new WhatsAppError(
      "Não foi possível gerar o QR Code. Verifique se o container evolution-api está saudável (docker compose logs evolution-api) e se a rede permite acesso ao WhatsApp.",
      502,
    );
  }

  return {
    qrcode,
    pairingCode,
    state,
  };
}

export async function logoutInstance(instanceName: string): Promise<void> {
  try {
    await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (err instanceof WhatsAppError && err.statusCode === 404) {
      return;
    }
    throw err;
  }
}

export async function setupWebhook(instanceName: string, webhookUrl: string): Promise<void> {
  await evolutionFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      url: webhookUrl,
      enabled: true,
      webhookByEvents: false,
      webhookBase64: false,
      events: ["MESSAGES_UPSERT"],
    }),
  });
  logger.info({ instanceName, webhookUrl }, "Evolution API webhook configured");
}

export async function sendWhatsAppText(
  instanceName: string,
  phone: string,
  text: string,
): Promise<void> {
  const number = formatPhoneForWhatsApp(phone);
  if (!number) {
    throw new WhatsAppError("Telefone inválido", 400);
  }

  await evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });

  logger.info({ instanceName, number }, "WhatsApp message sent");
}
