"use client";

import type { Selection } from "@heroui/react";
import { useCallback, useMemo, useState } from "react";

/** Selected row ids of a table; ids no longer on the page are ignored, never submitted. */
export function useRowSelection(rows: readonly { id: number | null }[]) {
  const [keys, setKeys] = useState<Selection>(new Set());
  const ids = useMemo(() => {
    const present = new Set(rows.flatMap((row) => (row.id === null ? [] : [row.id])));
    if (keys === "all") return present;
    return new Set([...keys].map(Number).filter((id) => present.has(id)));
  }, [keys, rows]);
  const clear = useCallback(() => setKeys(new Set()), []);
  return { keys, setKeys, ids, clear };
}
