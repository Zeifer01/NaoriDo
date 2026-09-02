/**
 * Best-effort extraction of item/complemento mentions from the raw WhatsApp
 * ticket text stored in `historical_orders.items_text`. This data was never
 * imported as structured line items (no menu_item_id, no per-item price —
 * see historical-orders.ts schema comment), so "top items" here is a
 * frequency count of cleaned text tokens across orders, not a real
 * quantity/revenue breakdown. Good enough for a "o que mais aparece nos
 * pedidos" insight, not for precise sales-by-item numbers.
 */

const EMOJI_PREFIX_RE = /^[👤📞📍🏙️💵💳🧾🧋━\s]+/u;
const HEADER_RE = /^\*?(ORDEM|COMANDA)\b/i;
const SEPARATOR_RE = /^━+$/;
const CONTACT_LABEL_RE = /^~?(cliente|nome|tel(efone)?|endere[cç]o|total|valor|cidade|pagamento)\s*:/i;
const PHONE_RE = /\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const ADDRESS_HINT_RE =
  /\b(worcester|shrewsbury|grafton|auburn|millbury|holden|leicester|boylston|paxton|rutland|cherry valley|street|st\.?|ave|avenue|road|rd\.?|dr\.?|drive|terrace|ter\.?|way|circle|cir\.?|court|ct\.?|lane|ln\.?|place|pl\.?|blvd|boulevard|hwy|highway|square|sq\.?)\b/i;
const TOTAL_MARKER_RE = /^\+?\$?\s*\d+([.,]\d{1,2})?\s*\$?\s*[=\-\/\\]\s*\d+\s*[\/\\]/;
const MONEY_ONLY_RE = /^\$?\s*\d+([.,]\d{1,2})?\s*\$?\s*$/; // a line that is JUST a bare amount, nothing else
const NOISE_LINE_RE =
  /^(zelle|cash\s*app|cashapp|cash|dinheiro|venmo|cart[ãa]o|card|pix|pick[\s-]?up|retirada|delivery|entrega|obs:?|<mensagem editada>|mensagem apagada.*)$/i;
const TROCO_RE = /troco/i;
const QTY_PREFIX_RE = /^\d+\s*[x\/]\s*\d*\s*(oz)?\s*[:\-]?\s*/i;
const NUMBERED_LIST_RE = /^\d+[.)]\s*/;
const LABEL_PREFIX_RE = /^(complementos?|adicionais?|pedido|itens?)\s*(\([^)]*\))?\s*:\s*/i;
const MIN_TOKEN_LEN = 3;
const STOPWORDS = new Set([
  "com",
  "sem",
  "extra",
  "extra extra",
  "pouco",
  "pouca",
  "separado",
  "separada",
  "obs",
]);

function splitOnConnectors(s: string): string[] {
  return s
    .split(/,| e (?=[a-zà-ú])/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

function stripPrefixes(line: string): string {
  return line
    .replace(EMOJI_PREFIX_RE, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^~/, "")
    .trim();
}

function cleanLine(line: string): string {
  let l = line;
  const labelMatch = l.match(LABEL_PREFIX_RE);
  if (labelMatch) l = l.slice(labelMatch[0].length).trim();
  else if (l.includes(":")) l = l.slice(l.lastIndexOf(":") + 1).trim();

  l = l.replace(QTY_PREFIX_RE, "").replace(NUMBERED_LIST_RE, "").trim();
  l = l.replace(/\(\+?\$[\d.,]+\)/g, "").replace(/\$[\d.,]+/g, "").trim();
  l = l.replace(/[.;]+$/, "").trim();
  return l;
}

/** Extracts candidate item/complemento tokens (lowercase, for aggregation) from one order's raw text. */
export function extractItemMentions(rawText: string, customerName: string | null): string[] {
  const lines = rawText
    .split("\n")
    .map((l) => stripPrefixes(l.trim()))
    .filter(Boolean);

  const tokens: string[] = [];
  const normalizedName = customerName?.trim().toLowerCase();

  for (const line of lines) {
    if (HEADER_RE.test(line) || SEPARATOR_RE.test(line) || CONTACT_LABEL_RE.test(line)) continue;
    if (normalizedName && line.toLowerCase() === normalizedName) continue;
    if (PHONE_RE.test(line) && line.replace(PHONE_RE, "").trim().length < 3) continue;
    if (ADDRESS_HINT_RE.test(line) && !/complemento|adicional|pedido/i.test(line)) continue;
    if (TOTAL_MARKER_RE.test(line) || MONEY_ONLY_RE.test(line) || TROCO_RE.test(line)) continue;
    if (NOISE_LINE_RE.test(line)) continue;
    if (/mensagem editada/i.test(line)) continue;

    const cleaned = cleanLine(line);
    if (!cleaned) continue;

    for (const part of splitOnConnectors(cleaned)) {
      const norm = part.toLowerCase().trim();
      if (norm.length < MIN_TOKEN_LEN) continue;
      if (STOPWORDS.has(norm)) continue;
      if (/^\d+$/.test(norm)) continue;
      if (NOISE_LINE_RE.test(norm)) continue;
      tokens.push(norm);
    }
  }

  return tokens;
}

export interface ItemMentionCount {
  name: string;
  mentions: number;
}

function toTitleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const COMBINING_MARKS_RE = new RegExp("[\\u0300-\\u036f]", "g");

/** Accent-insensitive grouping key so "leite em po" / "leite em pó" count as the same item. */
function accentFold(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS_RE, "");
}

/** Aggregates item mentions across many orders' raw texts into a ranked top-N list. */
export function rankItemMentions(
  orders: { items_text: string | null; customer_name: string }[],
  limit = 20,
): ItemMentionCount[] {
  const counts = new Map<string, number>();
  const display = new Map<string, string>();

  for (const o of orders) {
    if (!o.items_text) continue;
    const seenInOrder = new Set<string>();
    for (const token of extractItemMentions(o.items_text, o.customer_name)) {
      const key = accentFold(token);
      if (seenInOrder.has(key)) continue; // count at most once per order
      seenInOrder.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!display.has(key)) display.set(key, toTitleCase(token));
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, mentions]) => ({ name: display.get(key) ?? key, mentions }));
}
