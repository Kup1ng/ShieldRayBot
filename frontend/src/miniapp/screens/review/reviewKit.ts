export type ReviewItem = {
  id: number;
  amount: number;
  kind: string;
  order_id: number | null;
  plan_name: string;
  payer: string;
  created_at: string | null;
};

export type ReviewData = { items: ReviewItem[]; total: number };

export type ReviewKind = "approve" | "reject";

export const REVIEW_ACTIONS: Record<ReviewKind, { confirm: string; done: string }> = {
  approve: { confirm: "این پرداخت تأیید شود؟ مبلغ به حساب مشتری منظور یا سفارش تحویل داده می‌شود.", done: "پرداخت تأیید شد" },
  reject: { confirm: "این پرداخت رد شود؟ به مشتری اطلاع داده می‌شود و سفارش لغو می‌شود.", done: "پرداخت رد شد" },
};

export const REVIEW_UNKNOWN = "نتیجه مشخص نشد؛ فهرست رسیدها دوباره خوانده شد.";

export function reviewKindText(item: Pick<ReviewItem, "kind" | "plan_name">): string {
  if (item.kind === "topup") return "شارژ کیف پول";
  return item.plan_name ? `خرید «${item.plan_name}»` : "خرید سرویس";
}
