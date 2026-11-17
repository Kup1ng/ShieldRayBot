/** The shop bot's extra admin ids: a comma-separated list of Telegram ids, kept as digits only. */

const ID_PATTERN = /^\d{1,15}$/;

export function parseIdList(csv: string): string[] {
  const seen = new Set<string>();
  for (const part of csv.split(/[\s,،؛;]+/)) {
    const digits = part.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    if (ID_PATTERN.test(digits)) seen.add(digits);
  }
  return [...seen];
}

export const formatIdList = (ids: string[]): string => ids.join(",");

/** Adds one typed id; an invalid or repeated one leaves the list as it was. */
export function addId(ids: string[], raw: string): string[] {
  const [first] = parseIdList(raw);
  return first && !ids.includes(first) ? [...ids, first] : ids;
}
