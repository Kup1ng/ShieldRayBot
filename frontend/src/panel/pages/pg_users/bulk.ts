import { run, type Ask } from "../../core/actions";
import { fa } from "../../core/format";

/** A row and the bulk operations the server listed for it (the old `data-bulk-ops`). */
export type BulkRow = { id: number | null; ops: readonly string[] };

export type BulkSpec = { label: string; danger?: boolean; ask: (count: number) => Ask };

/** Selected ids the operation applies to; a row only takes the operations the server listed for it. */
export function eligibleIds(rows: readonly BulkRow[], selected: ReadonlySet<number>, op: string): number[] {
  const ids: number[] = [];
  for (const row of rows) if (row.id !== null && selected.has(row.id) && row.ops.includes(op)) ids.push(row.id);
  return ids;
}

/** Operations at least one selected row accepts, in the given order. */
export function availableOps(rows: readonly BulkRow[], selected: ReadonlySet<number>, order: readonly string[]): string[] {
  return order.filter((op) => eligibleIds(rows, selected, op).length > 0);
}

export const countText = (template: string, n: number): string => template.replace("{n}", fa(n));

/** Post one bulk operation for the eligible ids after the old page's «{n} …؟» confirmation. */
export function runBulk(url: string, returnTo: string, op: string, ids: number[], spec: BulkSpec, refresh: () => void) {
  return run(url, { action: op, ids, return_to: returnTo }, { ask: spec.ask(ids.length), refresh });
}
