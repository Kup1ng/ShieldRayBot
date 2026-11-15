import { describe, expect, it } from "vitest";

import { availableOps, eligibleIds, pruneSelection } from "./bulk";

const rows = [
  { id: 1, bulk_ops: ["approve", "reject", "cancel"] as const },
  { id: 2, bulk_ops: ["approve"] as const },
  { id: 3, bulk_ops: [] as const },
].map((r) => ({ id: r.id, bulk_ops: [...r.bulk_ops] }));

describe("bulk selection", () => {
  it("counts only selected rows that accept the operation", () => {
    expect(eligibleIds(rows, new Set([1, 2, 3]), "approve")).toEqual([1, 2]);
    expect(eligibleIds(rows, new Set([1, 2, 3]), "reject")).toEqual([1]);
    expect(eligibleIds(rows, new Set([3]), "approve")).toEqual([]);
  });

  it("lists the operations someone selected can take, in order", () => {
    expect(availableOps(rows, new Set([2]), ["approve", "reject", "cancel"])).toEqual(["approve"]);
    expect(availableOps(rows, new Set([1]), ["approve", "reject", "cancel"])).toEqual(["approve", "reject", "cancel"]);
    expect(availableOps(rows, new Set(), ["approve"])).toEqual([]);
  });

  it("drops ids that are no longer listed", () => {
    expect([...pruneSelection(rows, new Set([1, 9]))]).toEqual([1]);
  });
});
