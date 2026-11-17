import type { BulkOp } from "./types";

export type BulkRow = { id: number; bulk_ops: BulkOp[] };

/** Selected ids the operation applies to (a row only takes the operations the server listed for it). */
export function eligibleIds(rows: BulkRow[], selected: ReadonlySet<number>, op: BulkOp): number[] {
  return rows.filter((row) => selected.has(row.id) && row.bulk_ops.includes(op)).map((row) => row.id);
}

/** Operations at least one selected row accepts, in the given order. */
export function availableOps(rows: BulkRow[], selected: ReadonlySet<number>, order: readonly BulkOp[]): BulkOp[] {
  return order.filter((op) => eligibleIds(rows, selected, op).length > 0);
}

/** Selection left after a reload: only ids still listed. */
export function pruneSelection(rows: BulkRow[], selected: ReadonlySet<number>): Set<number> {
  const present = new Set(rows.map((row) => row.id));
  return new Set([...selected].filter((id) => present.has(id)));
}
