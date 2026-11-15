"use client";

import type { ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { ActionButton } from "../ActionButton";

type StepFooterProps = {
  /** The ink action («بعدی», «پرداخت», «ثبت») — always at the end (left in RTL), arrow pointing on. */
  primaryLabel: string;
  onPrimary: () => void;
  primaryIcon?: string;
  primaryPending?: boolean;
  primaryDisabled?: boolean;
  /** Step 1: the purple price pill beside the action. */
  price?: ReactNode;
  /** Later steps: a neutral «قبلی» at the start (right in RTL). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
};

/**
 * Figma flow footer. Step 1: purple price pill + ink «بعدی». Later steps: neutral «قبلی» +
 * ink «پرداخت/ثبت». With neither price nor secondary the action spans the full width.
 */
export function StepFooter({
  primaryLabel,
  onPrimary,
  primaryIcon = "solar:arrow-left-linear",
  primaryPending,
  primaryDisabled,
  price,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
}: StepFooterProps) {
  const alone = !price && !(secondaryLabel && onSecondary);
  return (
    <div className="flex items-center gap-3">
      {price ? (
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lg bg-accent px-2 ps-3 text-sm font-medium text-accent-foreground shadow-[var(--mouve-accent-fill-shadow)]">
          <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-accent">
            <Icon name="solar:dollar-bold" size={22} />
          </span>
          <span className="min-w-0 truncate">{price}</span>
        </div>
      ) : null}
      {!price && secondaryLabel && onSecondary ? (
        <ActionButton tone="neutral" icon="solar:arrow-right-linear" onPress={onSecondary} isDisabled={secondaryDisabled} className="min-w-0 flex-1">
          {secondaryLabel}
        </ActionButton>
      ) : null}
      <ActionButton
        tone="ink"
        trailingIcon={primaryIcon}
        onPress={onPrimary}
        isPending={primaryPending}
        isDisabled={primaryDisabled}
        fullWidth={alone}
        className={alone ? "" : price ? "shrink-0 px-6" : "min-w-0 flex-1"}
      >
        {primaryLabel}
      </ActionButton>
    </div>
  );
}
