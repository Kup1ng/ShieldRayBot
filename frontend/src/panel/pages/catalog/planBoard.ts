/** The rows of the users' plans list: plans grouped under their categories, then the plan types without one. */

import type { BoardGroup, PlanRow, PlansOverview } from "./types";

export type SpecialKind = "trial" | "custom" | "wholesale";

export type BoardRow =
  | { id: number; kind: "plan"; plan: PlanRow }
  | { id: number; kind: "special"; special: SpecialKind }
  | { id: number; kind: "group"; group: BoardGroup }
  | { id: number; kind: "other"; title: string; note: string; count: number }
  | { id: number; kind: "types" }
  | { id: number; kind: "add" }
  | { id: number; kind: "intro" };

const SPECIALS: SpecialKind[] = ["trial", "custom", "wholesale"];
const SPECIAL_IDS: Record<SpecialKind, number> = { trial: -1, custom: -2, wholesale: -3 };
const OTHER_ID = -900;
const TYPES_ID = -901;
const ADD_ID = -902;
const INTRO_ID = -903;
const GROUP_ID_BASE = 1000;

/** The row id of a category group (negative, so it never meets a plan id). */
export const groupRowId = (categoryId: number): number => -(GROUP_ID_BASE + categoryId);

/** The element id a returning page scrolls to for a category's group. */
export const groupAnchor = (categoryId: number): string => `plan-cat-${categoryId}`;

/**
 * Plans in the order of the bot's category buttons. A shop without a user category gets a flat list with an
 * invitation to make one; the trial, custom and wholesale plans never take a category and close the list.
 */
export function buildBoardRows(data: Pick<PlansOverview, "plans" | "plan_board">): BoardRow[] {
  const byId = new Map(data.plans.map((plan) => [plan.id, plan]));
  const plansOf = (ids: number[]): BoardRow[] =>
    ids.flatMap((id) => {
      const plan = byId.get(id);
      return plan ? [{ id: plan.id, kind: "plan" as const, plan }] : [];
    });
  const board = data.plan_board;
  const rows: BoardRow[] = [];
  if (board.has_categories) {
    for (const group of board.groups) {
      rows.push({ id: groupRowId(group.category_id), kind: "group", group }, ...plansOf(group.plan_ids));
    }
    rows.push({ id: ADD_ID, kind: "add" });
    if (board.other.plan_ids.length) {
      rows.push({ id: OTHER_ID, kind: "other", title: board.other.title, note: board.other.note, count: board.other.plan_ids.length }, ...plansOf(board.other.plan_ids));
    }
    rows.push({ id: TYPES_ID, kind: "types" });
  } else {
    if (data.plans.length) rows.push({ id: INTRO_ID, kind: "intro" });
    rows.push(...data.plans.map((plan) => ({ id: plan.id, kind: "plan" as const, plan })));
  }
  rows.push(...SPECIALS.map((special) => ({ id: SPECIAL_IDS[special], kind: "special" as const, special })));
  return rows;
}
