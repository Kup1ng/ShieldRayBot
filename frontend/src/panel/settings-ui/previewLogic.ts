/** What the Telegram chat preview shows for a settings tab, from the form's live values. */

export type PreviewKey = { label: string; tone: string; styleId: string };
export type ChatPreview = {
  title: string;
  text: string;
  keys: PreviewKey[];
  showQr: boolean;
  qrCaption: string;
  hint: string;
};

/** Reads a setting: the form's current value when the tab has that field, else the saved one, else `fallback`. */
export type Reader = (name: string, fallback?: string) => string;

const SAMPLE_VARIABLES: Record<string, string> = {
  user_name: "کاربر",
  name: "کاربر",
  user_id: "123456789",
  username: "@user",
  order_id: "1024",
  plan_name: "پلن نمونه",
  amount: "۵۰٬۰۰۰ تومان",
  payment_id: "88",
  gateway_name: "درگاه",
  code: "CLK42",
  link: "https://t.me/example_bot?start=CLK42",
  card: "6037-****-****-1234",
  holder: "نام دارنده",
  asset: "USDT",
  network: "TRC20",
  address: "TXyz…",
  url: "https://example.com/sub/demo",
  sub_link: "https://example.com/sub/demo",
  channels: "• @channel",
  admin_name: "علی",
  period_label: "روزانه",
  day: "۲۹",
  month_name: "مرداد",
  year: "۱۴۰۵",
  date_from: "۱۴۰۵/۵/۲۹",
  date_to: "۱۴۰۵/۵/۳۰",
  users_new: "۳",
  orders_new: "۵",
  orders_delivered: "۴",
  revenue_today: "۱٬۲۰۰٬۰۰۰ تومان",
  services_new: "۴",
  pending: "۲",
  tickets_open: "۱",
  failures: "۰",
  funnel_pay_start: "۸",
  funnel_receipt: "۶",
  funnel_delivered: "۵",
  users_total: "۱۲۰",
  orders_total: "۸۰",
  services_total: "۷۵",
  revenue_total: "۱۲٬۰۰۰٬۰۰۰ تومان",
  resellers_active: "۴",
};

const DEFAULT_SHOP_TITLE = "شیلدری";
const DEFAULT_WELCOME = "سلام {name} 👋";
const DEFAULT_MENU_ORDER = "shop,services,wallet,support,loyalty,reseller_apply";
/** Entries the reply keyboard no longer carries. */
const REMOVED_MENU = new Set(["guide", "faq", "restart", "help", "miniapp", "referral"]);
const KEYBOARD_SKIPS = new Set(["reseller_apply", "miniapp"]);
const MENU_LABELS: Record<string, [string, string]> = {
  shop: ["btn_shop", "🟢🛒 خرید سرویس"],
  services: ["btn_services", "🔵📦 سرویس‌های من"],
  wallet: ["btn_wallet", "🟡👛 کیف پول"],
  support: ["btn_support", "🟣🎧 پشتیبانی"],
  loyalty: ["btn_loyalty", "⭐ باشگاه مشتریان"],
  reseller_apply: ["btn_reseller_apply", "🤝 درخواست نمایندگی"],
};
const STYLE_DEFAULTS: Record<string, string> = { shop: "primary", services: "primary", wallet: "primary", support: "primary", loyalty: "success", reseller_apply: "" };
const MESSAGE_FOCUS_KEYS = new Set(["guide_text", "faq_text", "empty_services_text", "shop_empty_text", "delivery_title", "purchase_success_text", "wallet_success_text"]);
const DEFAULT_REPORT = "📊 گزارش روزانه\n\n👤 ادمین: {admin_name}\n📅 دوره: {period_label}\n📆 روز: {day}\n🗓️ ماه: {month_name}\n📅 سال: {year}\n📅 از: {date_from}\n📅 تا: {date_to}\n\n📊 فعالیت:\n• کاربران جدید: {users_new}\n• سفارش‌ها: {orders_new}\n• تحویل‌شده: {orders_delivered}\n• درآمد امروز: {revenue_today}";

/** A text with its `{placeholders}` replaced by sample values (the shop name by the live one). */
export function fillVars(text: string, shopTitle: string): string {
  const samples = { ...SAMPLE_VARIABLES, shop_title: shopTitle };
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name: string) => (Object.prototype.hasOwnProperty.call(samples, name) ? samples[name as keyof typeof samples] : token));
}

/** The report text with the switched-off statistics blanked, as the bot would send it. */
export function fillDailyReport(text: string, offMetrics: string[], shopTitle: string): string {
  let out = text;
  for (const key of offMetrics) out = out.split(`{${key}}`).join("");
  return fillVars(out, shopTitle);
}

export function styleTone(read: Reader, id: string, fallback = ""): string {
  const tone = read(`btn_style_${id}`, fallback).trim().toLowerCase();
  return tone === "primary" || tone === "success" || tone === "danger" ? tone : "default";
}

export function menuKeys(read: Reader, order: string): PreviewKey[] {
  const keys: PreviewKey[] = [];
  for (const raw of order.split(",")) {
    const entry = raw.trim() === "referral" ? "loyalty" : raw.trim();
    if (!entry || REMOVED_MENU.has(entry) || KEYBOARD_SKIPS.has(entry)) continue;
    const meta = MENU_LABELS[entry];
    if (!meta) continue;
    const label = read(meta[0], meta[1]) || meta[1];
    keys.push({ label, tone: styleTone(read, entry, STYLE_DEFAULTS[entry] ?? ""), styleId: entry });
  }
  return keys;
}

export function messageText(read: Reader, focus: string, shopTitle: string): string {
  const key = MESSAGE_FOCUS_KEYS.has(focus) ? focus : "purchase_success_text";
  if (key === "delivery_title") return `${fillVars(read("delivery_title", "✅ سرویس آماده است"), shopTitle)}\n\n${fillVars(read("purchase_success_text", "پرداخت تأیید شد"), shopTitle)}`;
  return fillVars(read(key, "متن پیام…"), shopTitle);
}

export type PreviewInput = {
  tab: string;
  read: Reader;
  /**
   * False when the page does not carry the bot's menu order (the shop payload): the welcome preview
   * then shows no reply keyboard instead of guessing the default one.
   */
  menuKnown?: boolean;
  /** The field the staff member last touched (messages tab shows that text). */
  focus: string;
  menuOrder: string;
  /** Statistics switched off in the daily report. */
  offMetrics: string[];
};

export function buildChatPreview({ tab, read, menuKnown = true, focus, menuOrder, offMetrics }: PreviewInput): ChatPreview {
  const shopTitle = read("shop_title", DEFAULT_SHOP_TITLE) || DEFAULT_SHOP_TITLE;
  const result: ChatPreview = { title: shopTitle, text: "", keys: [], showQr: false, qrCaption: "", hint: "" };
  const order = menuOrder || read("menu_order", DEFAULT_MENU_ORDER) || DEFAULT_MENU_ORDER;
  if (tab === "welcome") {
    result.text = fillVars(read("welcome_text", DEFAULT_WELCOME), shopTitle);
    result.keys = menuKnown ? menuKeys(read, order) : [];
  } else if (tab === "messages") {
    result.text = messageText(read, focus, shopTitle);
  } else if (tab === "buttons" || tab === "menu") {
    result.text = fillVars(read("welcome_text", DEFAULT_WELCOME), shopTitle);
    result.keys = menuKeys(read, order);
  } else if (tab === "qr") {
    result.text = fillVars(read("purchase_success_text", "سرویس فعال شد."), shopTitle);
    result.showQr = read("qr_enabled", "1") === "1";
    let caption = fillVars(read("qr_caption", "QR اشتراک"), shopTitle);
    if (read("show_sub_link_in_text", "1") === "1") caption += "\n\n🔗 https://example.com/sub/demo\n📦 ۱۰ گیگ · 📅 ۳۰ روز";
    result.qrCaption = caption;
  } else if (tab === "daily_report") {
    result.text = fillDailyReport(read("admin_daily_report_template", DEFAULT_REPORT), offMetrics, shopTitle);
    result.hint = "پیش‌نمایش گزارش روزانه — با خاموش کردن آمار، مقدار آن در پیش‌نمایش خالی می‌شود.";
  }
  return result;
}

/** The chat with a reply keyboard of the given button labels, as the bot menu editor lays them out. */
export function menuLabelsPreview(shopTitle: string, entries: Array<{ key: string; label: string }>): ChatPreview {
  const keys = entries.map((entry) => ({ label: entry.label, tone: "default", styleId: entry.key }));
  return { title: shopTitle || DEFAULT_SHOP_TITLE, text: "", keys, showQr: false, qrCaption: "", hint: "" };
}
