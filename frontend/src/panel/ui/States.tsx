"use client";

/** Loading, error and empty states of panel pages: a failed call never blanks the shell. */

import { Alert, Button, Skeleton } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import type { ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import type { Resource } from "../core/data";

/** Placeholder rows while a list or a section loads. */
export function LoadingBlock({ rows = 5, height = "h-12" }: { rows?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`${height} w-full rounded-lg`} />
      ))}
    </div>
  );
}

/** A failed load with the way to try again. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>بارگذاری انجام نشد</Alert.Title>
        <Alert.Description>{message || "ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید."}</Alert.Description>
        {onRetry ? (
          <Button size="sm" variant="outline" className="mt-2" onPress={onRetry}>
            <Icon name="solar:refresh-linear" size={16} />
            تلاش دوباره
          </Button>
        ) : null}
      </Alert.Content>
    </Alert>
  );
}

/** Nothing to list yet; `children` holds the action that fills it (e.g. «افزودن پلن»). */
export function EmptyBlock({ icon = "solar:inbox-line-linear", title, description, children }: { icon?: string; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <EmptyState size="sm">
      <EmptyState.Header>
        <EmptyState.Media variant="icon">
          <Icon name={icon} size={24} />
        </EmptyState.Media>
        <EmptyState.Title>{title}</EmptyState.Title>
        {description ? <EmptyState.Description>{description}</EmptyState.Description> : null}
      </EmptyState.Header>
      {children ? <EmptyState.Content>{children}</EmptyState.Content> : null}
    </EmptyState>
  );
}

/** Inline notice inside a section (PasarGuard unreachable, a limit reached, a setting missing); `action` is a button or link on its side. */
export function Notice({ tone = "warning", title, children, action }: { tone?: "warning" | "danger" | "accent" | "success"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <Alert status={tone}>
      <Alert.Indicator />
      <Alert.Content>
        {title ? <Alert.Title>{title}</Alert.Title> : null}
        {children ? <Alert.Description>{children}</Alert.Description> : null}
      </Alert.Content>
      {action ? <div className="shrink-0">{action}</div> : null}
    </Alert>
  );
}

/**
 * Skeleton while the first answer loads, an error with retry, else the content. A reload keeps the
 * old content on screen; if that reload fails, the error shows above the content it kept.
 */
export function Loadable<T>({ state, children, rows, height }: { state: Resource<T>; children: (data: T) => ReactNode; rows?: number; height?: string }) {
  if (state.data) {
    return (
      <>
        {state.status === "error" ? <ErrorBlock message={state.message} onRetry={state.reload} /> : null}
        {children(state.data)}
      </>
    );
  }
  if (state.status === "error") return <ErrorBlock message={state.message} onRetry={state.reload} />;
  return <LoadingBlock rows={rows} height={height} />;
}
