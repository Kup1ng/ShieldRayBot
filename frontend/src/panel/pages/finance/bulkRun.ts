import { run, type Ask } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { fa } from "../../core/format";
import type { BulkOp } from "./types";

export type BulkSpec = {
  label: string;
  danger?: boolean;
  ask: (count: number) => Ask;
};

/** Post one bulk operation for the eligible ids after the old page's «{n} …؟» confirmation. */
export function runBulk(url: string, returnTo: string, op: BulkOp, ids: number[], spec: BulkSpec, refresh: () => void): Promise<ActionResult | null> {
  return run(url, { action: op, ids, return_to: returnTo }, { ask: spec.ask(ids.length), refresh });
}

export const countText = (template: string, n: number): string => template.replace("{n}", fa(n));
