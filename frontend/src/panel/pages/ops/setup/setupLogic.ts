/** Checks of the first-run wizard's steps (the server repeats every one of them) and the login address it ends on. */

export const STEP_COUNT = 5;
export const LAST_STEP = 4;
export const PASSWORD_MIN = 12;
export const PORT_MAX = 65535;

export const CAPTIONS: Record<number, string> = {
  0: "راه‌اندازی اولیه پنل",
  1: "حساب مدیر وب‌پنل",
  2: "اتصال ربات تلگرام",
  3: "پاسارگارد و تنظیمات وب",
  4: "خلاصه دسترسی و ورود",
};

export function clampStep(raw: string | null | undefined): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isNaN(value) ? 0 : Math.min(Math.max(value, 0), LAST_STEP);
}

export type AdminFields = { username: string; password: string; password_confirm: string };

/** The first problem with the admin step, or "". */
export function adminError({ username, password, password_confirm }: AdminFields): string {
  if (!username.trim()) return "نام کاربری را وارد کنید.";
  if (password !== password_confirm) return "رمز عبور و تکرار آن یکسان نیستند.";
  if (password.length < PASSWORD_MIN) return "رمز عبور باید حداقل ۱۲ کاراکتر باشد.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "رمز باید حرف بزرگ، حرف کوچک و کاراکتر خاص داشته باشد.";
  return "";
}

export type BotFields = { bot_token: string; bot_username: string; admin_ids: string[] };

export function botError({ bot_token, bot_username, admin_ids }: BotFields, hasSavedToken: boolean): string {
  if (!bot_token.trim() && !hasSavedToken) return "توکن ربات الزامی است.";
  if (!bot_username.trim()) return "نام کاربری ربات را وارد کنید.";
  if (!admin_ids.length) return "حداقل یک آیدی ادمین وارد کنید.";
  if (admin_ids.some((id) => !/^\d+$/.test(id))) return "آیدی هر ادمین باید عدد باشد.";
  return "";
}

export type OtherFields = { pg_base_url: string; pg_username: string; pg_password: string; web_port: string };

export function otherError({ pg_base_url, pg_username, pg_password, web_port }: OtherFields, hasSavedPassword: boolean): string {
  if (!pg_base_url.trim()) return "آدرس پاسارگارد الزامی است.";
  if (!pg_username.trim()) return "نام کاربری پاسارگارد را وارد کنید.";
  if (!pg_password.trim() && !hasSavedPassword) return "رمز پاسارگارد را وارد کنید.";
  if (!web_port.trim()) return "پورت وب‌پنل را وارد کنید.";
  const port = Number.parseInt(web_port, 10);
  if (!port || port < 1 || port > PORT_MAX) return "پورت وب نامعتبر است.";
  return "";
}

/**
 * Where the wizard sends the browser after the panel restarts: the shown panel address's `/login`.
 * Plain http is forced only while TLS is not live yet (no certificate means no HTTPS listener).
 */
export function loginUrlAfterSetup(shownPanelUrl: string, fallback: string, httpsReady: boolean): string {
  try {
    const base = new URL(shownPanelUrl.trim() || fallback);
    if (!httpsReady) base.protocol = "http:";
    if (!/\/login\/?$/i.test(base.pathname)) base.pathname = `${base.pathname.replace(/\/?$/, "/")}login`.replace(/\/{2,}/g, "/");
    base.search = "restarting=1";
    base.hash = "";
    return base.href;
  } catch {
    return fallback;
  }
}
