/** Number, date and status formatting shared by every panel page (Persian digits, bidi-safe). */

export type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

const FA = "fa-IR";

const SCALES: [number, string][] = [
  [1e9, "میلیارد"],
  [1e6, "میلیون"],
  [1e3, "هزار"],
];

/** Whole numbers with Persian digits and grouping; a missing value shows a dash. */
export function fa(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(FA) : String(value);
}

export function faPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${fa(value)}٪`;
}

/** An amount in the shop currency (toman), grouped: «۱۵۰٬۰۰۰ تومان». */
export function toman(value: number | string | null | undefined): string {
  const text = fa(value);
  return text === "—" ? text : `${text} تومان`;
}

/** Short axis or tile label: «۴٫۸ میلیون», «۲۵۰ هزار», «۹۰۰». */
export function compactToman(value: number): string {
  const n = Math.abs(Number(value) || 0);
  for (const [size, word] of SCALES) {
    if (n >= size) return `${(Math.round((n / size) * 100) / 100).toLocaleString(FA)} ${word}`;
  }
  return fa(Math.round(n));
}

/** A server timestamp as a short Jalali date and time; an unreadable value shows a dash. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(FA, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(FA, { dateStyle: "medium" }).format(date);
}

/** Keep digits only, so a pasted «150,000» or «۱۵۰٬۰۰۰» posts the integer the handler expects. */
export function digitsOnly(raw: string): string {
  const latin = raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return latin.replace(/[^\d]/g, "");
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function isNumeric(raw: string): boolean {
  return NUMERIC.test(raw.trim());
}
