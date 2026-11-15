"use client";

import { Label, ProgressBar, Spinner } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { fa } from "../../core/format";
import { Notice } from "../../ui/States";
import { STAY_WARNING } from "./restart";
import type { JobStep } from "./types";

export type StepState = "done" | "current" | "pending";

/** Which steps are behind, at and ahead of the step the server reports. */
export function stepStates(steps: JobStep[], currentKey: string | null | undefined): StepState[] {
  const index = steps.findIndex((step) => step.key === currentKey);
  return steps.map((_, i) => (index < 0 ? "pending" : i < index ? "done" : i === index ? "current" : "pending"));
}

export function StepList({ steps, currentKey }: { steps: JobStep[]; currentKey: string | null | undefined }) {
  const states = stepStates(steps, currentKey);
  return (
    <ol className="grid gap-2 sm:grid-cols-2" aria-label="مراحل">
      {steps.map((step, i) => (
        <li key={step.key} className={`flex items-center gap-2 text-sm ${states[i] === "pending" ? "text-muted" : "text-foreground"}`} aria-current={states[i] === "current" ? "step" : undefined}>
          {states[i] === "done" ? (
            <Icon name="solar:check-circle-bold" size={18} className="text-success" />
          ) : states[i] === "current" ? (
            <Spinner size="sm" />
          ) : (
            <Icon name="solar:record-linear" size={18} />
          )}
          {step.label}
        </li>
      ))}
    </ol>
  );
}

type JobProgressProps = {
  label: string;
  percent: number;
  stepLabel: string;
  message?: string;
  tone?: "accent" | "danger" | "success";
  steps?: JobStep[];
  currentKey?: string | null;
  /** Shown under the bar, e.g. the safety backup id. */
  footer?: React.ReactNode;
  stay?: boolean;
};

/** The progress block shared by the update, the restore and the certificate job. */
export function JobProgress({ label, percent, stepLabel, message, tone = "accent", steps, currentKey, footer, stay = true }: JobProgressProps) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      {stay ? <Notice tone="warning">{STAY_WARNING}</Notice> : null}
      <ProgressBar aria-label={label} value={percent} color={tone}>
        <div className="flex items-center justify-between gap-2">
          <Label>{stepLabel}</Label>
          <span className="num text-sm font-semibold">{fa(percent)}٪</span>
        </div>
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {steps?.length ? <StepList steps={steps} currentKey={currentKey} /> : null}
      {footer}
    </div>
  );
}
