"use client";

import { Button } from "@heroui/react";
import type { FormEvent, ReactNode } from "react";

import { Icon } from "@/icons/Icon";
import { StatusChip } from "../../ui/Data";
import { SubmitButton } from "../../ui/Fields";


/** One editable record of the settings editor: a title row (name, facts, on/off chip) and its form. */
export function EditorCard({
  title,
  meta,
  enabled,
  headAction,
  children,
}: {
  title: string;
  meta?: ReactNode;
  enabled?: boolean;
  headAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="inset-tile flex flex-col gap-4 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <strong className="text-sm text-foreground" dir="auto">
            {title}
          </strong>
          {meta ? <span className="text-xs text-muted">{meta}</span> : null}
          {enabled === undefined ? null : <StatusChip color={enabled ? "success" : "default"}>{enabled ? "فعال" : "غیرفعال"}</StatusChip>}
        </div>
        {headAction}
      </div>
      {children}
    </article>
  );
}

/** A form that posts through `onSubmit` and ends with the ink submit button. */
export function EditorForm({
  onSubmit,
  pending,
  submitLabel,
  children,
  extra,
}: {
  onSubmit: () => void;
  pending?: boolean;
  submitLabel: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending) onSubmit();
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        {extra}
      </div>
    </form>
  );
}

/** The danger button of a record (delete / archive). */
export function DangerButton({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Button variant="ghost" className="!h-12 !rounded-lg bg-danger/10 px-5 text-sm text-danger" onPress={onPress}>
      <Icon name="solar:trash-bin-trash-linear" size={18} />
      {children}
    </Button>
  );
}

export function IntroNote({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-base font-semibold text-foreground">{title}</h4>
      {children ? <p className="text-sm leading-6 text-muted">{children}</p> : null}
    </div>
  );
}
