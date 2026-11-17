import { num } from "../core/format";

const BADGE_MAX = 99;

/** An unread count as «۳» or «۹۹+»; "" for zero, a negative or a missing count. */
export function badgeText(value: unknown): string {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > BADGE_MAX ? `${num(BADGE_MAX)}+` : num(count);
}
