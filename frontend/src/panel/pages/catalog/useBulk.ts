"use client";

import type { Selection } from "@heroui/react";
import { useState } from "react";

import { run } from "../../core/actions";
import { confirmBulk, selectedIds, type BulkOp } from "./Tables";

/** Selection + «run one bulk action» for one table, posting the existing bulk handler. */
export function useBulk(path: string, returnTo: string, allIds: number[], onDone: () => void) {
  const [selected, setSelected] = useState<Selection>(new Set());
  const [busy, setBusy] = useState(false);
  const ids = selectedIds(selected, allIds);

  const runBulk = async (op: BulkOp) => {
    if (!ids.length || !(await confirmBulk(op, ids.length))) return;
    setBusy(true);
    try {
      await run(path, { action: op.key, ids: ids.map(String), return_to: returnTo });
    } finally {
      setBusy(false);
      setSelected(new Set());
      onDone();
    }
  };
  return { selected, setSelected, count: ids.length, busy, run: runBulk, clear: () => setSelected(new Set()) };
}
