"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";

export type WhatsAppMessageKey =
  | "order_created"
  | "status_confirmed"
  | "status_preparing"
  | "status_ready"
  | "status_completed"
  | "status_cancelled";

export type WhatsAppMessageTemplates = Record<WhatsAppMessageKey, string>;

export type WhatsAppStatus = {
  configured: boolean;
  connected: boolean;
  state: "open" | "close" | "connecting" | "unknown";
  instanceName: string;
  notificationsEnabled: boolean;
  messageTemplates: WhatsAppMessageTemplates;
};

export function useWhatsAppStatus(options?: { pollWhileConnecting?: boolean }) {
  return useQuery({
    queryKey: ["whatsapp", "status"],
    queryFn: () => apiFetch<WhatsAppStatus>("/api/whatsapp/status"),
    refetchInterval: (query) => {
      if (!options?.pollWhileConnecting) return false;
      const state = query.state.data?.state;
      return state === "connecting" || (state === "close" && query.state.data?.configured)
        ? 3000
        : false;
    },
  });
}

export function useConnectWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ instanceName: string; qrcode: string | null; pairingCode: string | null; state: string }>(
        "/api/whatsapp/connect",
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
  });
}

export function useDisconnectWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/whatsapp/disconnect", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
  });
}

export function useUpdateWhatsAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      notificationsEnabled?: boolean;
      messageTemplates?: Partial<WhatsAppMessageTemplates>;
    }) =>
      apiFetch<{ notificationsEnabled: boolean; messageTemplates: WhatsAppMessageTemplates }>(
        "/api/whatsapp/settings",
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
  });
}
