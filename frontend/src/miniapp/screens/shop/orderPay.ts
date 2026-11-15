/**
 * Paying an order without the wallet (card to card, crypto, a gateway…): the shapes of
 * /api/mini/pay/methods, /api/mini/order/pay and /api/mini/order/payments/{id}, plus the small
 * pure helpers the buy and renew flows share.
 */

export type PayDestination = { id: string; label: string };

export type PayMethodEntry = { id: string; label: string; destinations?: PayDestination[] };

export type PayMethodsPayload = { wallet_pay_enabled: boolean; methods: PayMethodEntry[] };

/** One started payment of an order; only the chosen method's fields are present. */
export type OrderPayment = {
  id: number;
  amount: number;
  method: string;
  card_number?: string;
  holder?: string;
  bank?: string;
  address?: string;
  network?: string;
  link?: string;
  note?: string;
  needs_receipt: boolean;
};

export type OrderPayStart = { order_id: number; payment: OrderPayment };

export type PaymentStatusName = "waiting_receipt" | "review" | "approved" | "delivered" | "rejected" | "expired";

export type PaymentStatus = {
  status: PaymentStatusName;
  message?: string;
  order_id: number;
  service_id: number | null;
  amount: number;
  method?: string;
  paid_at: string | null;
};

export type ReceiptReply = { status?: string; message?: string };

/** One way to pay an order: a method, and the destination the customer picked for it. */
export type OrderChoice = { id: string; method: string; dest: string | null; label: string; hint?: string };

export const WALLET_ID = "wallet";

/** Every method of the shop, one row per destination when a method offers several. */
export function orderChoices(methods: PayMethodEntry[] | null | undefined): OrderChoice[] {
  const out: OrderChoice[] = [];
  for (const method of methods ?? []) {
    if (!method || typeof method.id !== "string" || !method.id) continue;
    const label = String(method.label || method.id);
    const dests = (method.destinations ?? []).filter((d) => d && d.id !== undefined && d.id !== null && d.id !== "");
    if (dests.length <= 1) {
      out.push({ id: `${method.id}:${dests[0] ? String(dests[0].id) : ""}`, method: method.id, dest: dests[0] ? String(dests[0].id) : null, label });
      continue;
    }
    for (const dest of dests) {
      out.push({ id: `${method.id}:${String(dest.id)}`, method: method.id, dest: String(dest.id), label, hint: String(dest.label || dest.id) });
    }
  }
  return out;
}

const METHOD_ICONS: Record<string, string> = {
  card: "solar:card-bold",
  crypto: "solar:hand-money-bold",
  gateway: "solar:link-round-bold",
  psp: "solar:link-round-bold",
};

export function methodIcon(method: string): string {
  return METHOD_ICONS[method] ?? "solar:card-2-bold";
}

const HEX = "0123456789abcdef";

/** A fresh 32-hex request key: one per order attempt, re-sent unchanged on a retry. */
export function newRequestKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

/** A started payment is only used when it names itself; anything else is treated as a failed start. */
export function readStart(res: OrderPayStart | null | undefined): OrderPayStart | null {
  const payment = res?.payment;
  if (!payment || !Number.isInteger(Number(payment.id)) || Number(payment.id) <= 0) return null;
  const orderId = Number(res?.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) return null;
  return { order_id: orderId, payment: { ...payment, id: Number(payment.id), amount: Number(payment.amount) || 0 } };
}

export const CARD_PAY_UNKNOWN = "نتیجهٔ ثبت پرداخت مشخص نشد. دوباره «پرداخت» را بزنید؛ سفارش فقط یک بار ثبت می‌شود.";
export const ORDER_RECEIPT_UNKNOWN = "نتیجهٔ ارسال رسید مشخص نشد؛ وضعیت پرداخت را بررسی می‌کنیم. هر پرداخت فقط یک رسید می‌پذیرد.";
