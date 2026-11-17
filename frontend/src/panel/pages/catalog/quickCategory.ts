/** Adding a category from inside a plan form: the answer carries the id the form then selects. */

import { FALLBACK_ERROR, currentCsrf, safeMessage } from "../../core/api";
import { postForm } from "../../settings-ui/rawPost";
import type { Tone } from "./types";

export const QUICK_CATEGORY_URL = "/plans/categories/quick";
export const CATEGORY_NAME_MAX = 128;
const TONES: readonly Tone[] = ["default", "primary", "success", "danger"];

/** The class of the dot that wears the colour of a category's bot button. */
export const TONE_DOT: Record<Tone, string> = { default: "bg-default", primary: "bg-accent", success: "bg-success", danger: "bg-danger" };

export type QuickCategory = { id: number; name: string; tone: Tone };
export type QuickResult = { ok: true; category: QuickCategory } | { ok: false; error: string };

/** The name to send, or "" when there is nothing usable (empty, or longer than the column). */
export function cleanCategoryName(raw: string): string {
  const name = raw.trim();
  return name.length > CATEGORY_NAME_MAX ? "" : name;
}

/** The answer of the quick handler as a result; anything unexpected is a safe message, never raw text. */
export function readQuickResult(data: unknown): QuickResult {
  const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (body.ok === true && Number.isInteger(body.id) && (body.id as number) > 0 && typeof body.name === "string") {
    const tone = TONES.includes(body.tone as Tone) ? (body.tone as Tone) : "default";
    return { ok: true, category: { id: body.id as number, name: body.name, tone } };
  }
  return { ok: false, error: safeMessage(body.error ?? body.message, FALLBACK_ERROR) };
}

/**
 * Create a user category of this shop (the same name twice returns the first one). The handler answers with
 * JSON that names the new category, which the generic action helper does not pass on.
 */
export async function createQuickCategory(name: string, buttonStyle: string): Promise<QuickResult> {
  const answer = await postForm<unknown>(QUICK_CATEGORY_URL, { name, button_style: buttonStyle }, currentCsrf());
  // A lost connection (status 0) may still have created it; the safe message asks for a reload like other forms.
  return answer.status === 0 ? { ok: false, error: FALLBACK_ERROR } : readQuickResult(answer.body);
}
