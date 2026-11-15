/** Form-value and list helpers of the marketing screens. */

import { fa } from "../../core/format";
import type { Option } from "./types";

/** A number as the text of an input; an unset optional limit is an empty box. */
export function inputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The preview days of the campaign form; anything outside 1..365 falls back to the default week. */
export function clampDays(raw: string, fallback = 7): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 1 && value <= 365 ? value : fallback;
}

/** Move one entry of a list up (-1) or down (+1); out-of-range moves leave the list as it is. */
export function moveItem<T>(items: readonly T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** A tier multiplier in basis points as the plain factor the old page showed (10000 = 1×). */
export function multiplierText(bps: number): string {
  return `${fa(bps / 10000)}×`;
}

/** The server's `{value, label}` choices as the select field's `{id, label}`. */
export function asOptions(options: readonly Option[]): { id: string; label: string }[] {
  return options.map((option) => ({ id: option.value, label: option.label }));
}
