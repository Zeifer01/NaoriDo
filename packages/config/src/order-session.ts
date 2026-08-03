/**
 * Order number session / cycle config in `branches.settings`.
 *
 * Used when archiving numbers and restarting the sequence (#1 again):
 * - Naori Do (feira): prefix `feira` → feira1-42, feira2-1, …
 * - Açaí House (loja): prefix `turno` → turno1-42, turno2-1, …
 *
 * Configure with `order_session_prefix` + optional `order_session_label`.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Sanitize to short alphanumeric prefix safe for order_number varchar(20). */
export function sanitizeOrderSessionPrefix(raw: string): string {
  const cleaned = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  return cleaned || "turno";
}

export type OrderSessionConfig = {
  /** Prefix stored on archived numbers, e.g. "turno" → turno1-15 */
  prefix: string;
  /** Human label for UI (turno / feira / dia). */
  label: string;
  sessionNumber: number;
  currentSessionName: string;
  nextSessionName: string;
  exampleArchived: string;
};

const LABEL_BY_PREFIX: Record<string, string> = {
  feira: "feira",
  turno: "turno",
  dia: "dia",
  ciclo: "ciclo",
  sessao: "sessão",
};

/**
 * Resolve session naming from branch settings.
 * Default prefix is `turno` (loja / delivery). Set `order_session_prefix: "feira"` for feira ops.
 */
export function getOrderSessionConfig(settings?: unknown): OrderSessionConfig {
  const s = asRecord(settings);
  const rawPrefix =
    typeof s.order_session_prefix === "string" ? s.order_session_prefix.trim() : "";
  const prefix = sanitizeOrderSessionPrefix(rawPrefix || "turno");
  const customLabel =
    typeof s.order_session_label === "string" ? s.order_session_label.trim() : "";
  const label = customLabel || LABEL_BY_PREFIX[prefix] || prefix;
  const sessionNumber =
    typeof s.order_session_number === "number" && s.order_session_number > 0
      ? Math.floor(s.order_session_number)
      : 1;

  return {
    prefix,
    label,
    sessionNumber,
    currentSessionName: `${prefix}${sessionNumber}`,
    nextSessionName: `${prefix}${sessionNumber + 1}`,
    exampleArchived: `${prefix}${sessionNumber}-1`,
  };
}
