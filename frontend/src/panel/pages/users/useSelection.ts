"use client";

import { useCallback, useState } from "react";

const NONE: ReadonlySet<number> = new Set();

/**
 * The ids ticked in a table. The selection belongs to `resetKey` (the address's query): a new
 * filter, search or page starts from nothing, without an effect to clear it.
 */
export function useSelection(resetKey: string): { selected: ReadonlySet<number>; select: (next: Set<number>) => void; clear: () => void } {
  const [state, setState] = useState<{ key: string; ids: ReadonlySet<number> }>({ key: resetKey, ids: NONE });
  const select = useCallback((next: Set<number>) => setState({ key: resetKey, ids: next }), [resetKey]);
  const clear = useCallback(() => setState({ key: resetKey, ids: NONE }), [resetKey]);
  return { selected: state.key === resetKey ? state.ids : NONE, select, clear };
}
