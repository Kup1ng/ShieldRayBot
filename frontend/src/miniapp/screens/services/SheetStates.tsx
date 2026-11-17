"use client";

import type { ReactNode } from "react";

import type { Loaded } from "./useLoad";
import { ErrorState, LoadingRows } from "../../ui/ScreenState";

/** A sheet body that loads: skeleton, error with retry, else the content. */
export function SheetLoad<T>({ state, onRetry, rows = 2, children }: { state: Loaded<T>; onRetry: () => void; rows?: number; children: (data: T) => ReactNode }) {
  if (state.status === "loading") return <LoadingRows rows={rows} />;
  if (state.status === "error") return <ErrorState message={state.error} onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}
