"use client";

import { Skeleton } from "@heroui/react";
import type { ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import type { Resource } from "../types";
import { ActionButton } from "./ActionButton";

/** Placeholder rows shaped like the InfoRow list while a screen loads. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel = "تلاش دوباره" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center" role="alert">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <Icon name="solar:danger-triangle-bold" size={28} />
      </span>
      <p className="max-w-xs text-sm leading-6 text-foreground/80">{message}</p>
      {onRetry ? (
        <ActionButton tone="neutral" icon="solar:refresh-linear" onPress={onRetry}>
          {retryLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon = "solar:box-linear", title, action }: { icon?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name={icon} size={28} />
      </span>
      <p className="text-sm text-muted">{title}</p>
      {action}
    </div>
  );
}

/** Render a resource: skeleton while loading, error with retry, else `children(data)`. */
export function Settled<T>({
  resource,
  rows = 3,
  onRetry,
  children,
}: {
  resource: Resource<T>;
  rows?: number;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}) {
  if (resource.status === "loading") return <LoadingRows rows={rows} />;
  if (resource.status === "error") return <ErrorState message={resource.error} onRetry={onRetry} />;
  return <>{children(resource.data)}</>;
}
