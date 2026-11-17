/** «افزودن سرویس قبلی»: what the preview answer shows and when it allows attaching. */

export type PreviewAnswer = {
  ok?: boolean;
  error?: string;
  panel_user_id?: number;
  panel_username?: string;
  status?: string;
  used?: string;
  limit?: string;
  expire?: string;
  already_yours?: boolean;
};

export type LookupKind = "link" | "username";

export const LOOKUP_KINDS: { id: LookupKind; label: string }[] = [
  { id: "link", label: "لینک اشتراک" },
  { id: "username", label: "نام کاربری پنل" },
];

export const LOOKUP_MAX = 2048;
export const FALLBACK_PREVIEW_ERROR = "بررسی انجام نشد. دوباره تلاش کنید.";
export const ALREADY_YOURS = "این سرویس از قبل در سرویس‌های این مشتری است.";

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Latin digits as Persian ones; the panel username is shown as the panel spells it. */
export function faDigits(text: string): string {
  return text.replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

function field(data: PreviewAnswer, key: keyof PreviewAnswer): string {
  const value = data[key];
  const text = typeof value === "string" ? value.trim() : "";
  return text || "—";
}

/** Label and value of each preview row; a missing value shows as «—». */
export function previewRows(data: PreviewAnswer): { label: string; value: string; ltr: boolean }[] {
  return [
    { label: "کاربر پنل", value: field(data, "panel_username"), ltr: true },
    { label: "وضعیت", value: field(data, "status"), ltr: false },
    { label: "مصرف", value: faDigits(field(data, "used")), ltr: false },
    { label: "حجم", value: faDigits(field(data, "limit")), ltr: false },
    { label: "انقضا", value: faDigits(field(data, "expire")), ltr: false },
  ];
}

/** The panel user id the attach may use, or "" when the answer does not allow attaching. */
export function attachableId(data: PreviewAnswer | null | undefined): string {
  if (!data || data.ok !== true || data.already_yours === true) return "";
  const id = data.panel_user_id;
  return Number.isInteger(id) && (id as number) > 0 ? String(id) : "";
}

/** A safe message for a failed check. */
export function previewError(data: PreviewAnswer | null | undefined): string {
  const text = typeof data?.error === "string" ? data.error.trim() : "";
  return text && !/^[\x00-\x7F]*$/.test(text) ? text : FALLBACK_PREVIEW_ERROR;
}
