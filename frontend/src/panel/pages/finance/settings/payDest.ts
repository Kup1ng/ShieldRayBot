/** Editable rows of the payment destination lists (cards, link gateways, crypto wallets, online gateways). */

export type DestKind = "cards" | "gateways" | "crypto" | "psp";

/** «inherit» keeps the bot's default button colour for the row; an empty text is the white button. */
export type ButtonStyle = "inherit" | "" | "primary" | "success" | "danger";

export type DestRow = {
  id: string;
  /** Rows the server already knows keep their hidden credential when the key is left blank. */
  saved: boolean;
  enabled: boolean;
  style: ButtonStyle;
  // cards
  number: string;
  holder: string;
  // link gateways and online gateways
  name: string;
  link: string;
  // crypto wallets
  asset: string;
  network: string;
  address: string;
  // online gateways
  provider: string;
  key: string;
  hasSecret: boolean;
  payUrl: string;
  requestMethod: string;
  sandbox: boolean;
};

export const STYLE_OPTIONS: { value: ButtonStyle; label: (inherit: string) => string }[] = [
  { value: "inherit", label: (inherit) => inherit },
  { value: "", label: () => "سفید" },
  { value: "primary", label: () => "آبی" },
  { value: "success", label: () => "سبز" },
  { value: "danger", label: () => "قرمز" },
];

export const PSP_PROVIDERS = [
  { value: "zarinpal", label: "زرین‌پال" },
  { value: "sunpay", label: "سان‌پی (SunPay)" },
  { value: "mock", label: "Mock (فقط تست محلی)" },
];

export const PSP_METHODS = [
  { value: "GET", label: "GET (مستند)" },
  { value: "POST", label: "POST" },
];

export const FIELD_KIND_TO_DEST: Record<string, DestKind> = {
  payment_cards: "cards",
  payment_gateways: "gateways",
  payment_crypto_wallets: "crypto",
  psp_gateways: "psp",
};

let counter = 0;
export function newId(): string {
  counter += 1;
  return `pd${Date.now().toString(36)}${counter.toString(36)}`;
}

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  return value === null || value === undefined ? fallback : String(value);
}

function styleOf(item: Record<string, unknown>): ButtonStyle {
  if (item.button_style === undefined || item.button_style === null) return "inherit";
  const value = text(item.button_style);
  return value === "primary" || value === "success" || value === "danger" ? value : "";
}

export function blankRow(kind: DestKind): DestRow {
  return {
    id: newId(),
    saved: false,
    enabled: true,
    style: "inherit",
    number: "",
    holder: "",
    name: "",
    link: "",
    asset: kind === "crypto" ? "USDT" : "",
    network: kind === "crypto" ? "TRC20" : "",
    address: "",
    provider: "zarinpal",
    key: "",
    hasSecret: false,
    payUrl: "",
    requestMethod: "GET",
    sandbox: false,
  };
}

function parseList(raw: string): Record<string, unknown>[] {
  try {
    const data: unknown = JSON.parse(raw || "[]");
    return Array.isArray(data) ? data.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
  } catch {
    return [];
  }
}

/** Rows of the editor for the stored JSON; an empty list starts with one blank row. */
export function parseRows(kind: DestKind, raw: string): DestRow[] {
  const items = parseList(raw);
  if (!items.length) return [blankRow(kind)];
  return items.map((item) => ({
    ...blankRow(kind),
    id: text(item.id) || newId(),
    saved: Boolean(item.id),
    enabled: item.enabled !== false,
    style: styleOf(item),
    number: text(item.number),
    holder: text(item.holder),
    name: text(item.name),
    link: text(item.link),
    asset: text(item.asset, "USDT") || "USDT",
    network: text(item.network, "TRC20") || "TRC20",
    address: text(item.address),
    provider: text(item.provider, "zarinpal") || "zarinpal",
    hasSecret: Boolean(item.has_secret),
    payUrl: text(item.pay_url),
    requestMethod: text(item.request_method, "GET") || "GET",
    sandbox: Boolean(item.sandbox),
  }));
}

function stylePatch(row: DestRow): Record<string, string> {
  return row.style === "inherit" ? {} : { button_style: row.style };
}

/**
 * The JSON the settings handler stores. Incomplete rows are dropped (no card number, no wallet
 * address, a link gateway with neither name nor link, a new online gateway with neither name nor key).
 */
export function serializeRows(kind: DestKind, rows: DestRow[]): string {
  const entries: Record<string, unknown>[] = [];
  rows.forEach((row, sort) => {
    if (kind === "cards") {
      const number = row.number.replace(/\D/g, "");
      if (!number) return;
      entries.push({ id: row.id, number, holder: row.holder.trim(), enabled: row.enabled, sort, ...stylePatch(row) });
    } else if (kind === "gateways") {
      const name = row.name.trim();
      const link = row.link.trim();
      if (!name && !link) return;
      entries.push({ id: row.id, name: name || "درگاه پرداخت", link, enabled: row.enabled, sort, ...stylePatch(row) });
    } else if (kind === "crypto") {
      const address = row.address.trim();
      if (!address) return;
      entries.push({ id: row.id, asset: row.asset.trim() || "USDT", network: row.network.trim() || "TRC20", address, enabled: row.enabled, sort, ...stylePatch(row) });
    } else {
      const name = row.name.trim();
      const key = row.key.trim();
      if (!name && !key && !row.saved) return;
      entries.push({
        id: row.id,
        name,
        provider: row.provider,
        merchant_id: key,
        pay_url: row.payUrl.trim(),
        request_method: row.requestMethod,
        sandbox: row.sandbox,
        enabled: row.enabled,
        sort,
      });
    }
  });
  return JSON.stringify(entries);
}
