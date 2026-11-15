"use client";

import type { ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { ActionButton } from "../../ui/ActionButton";

type FlowFooterProps = {
  /** The purple price pill (Figma step 1) shown beside the primary button. */
  price?: ReactNode;
  primaryLabel: string;
  primaryIcon?: string;
  onPrimary: () => void;
  primaryPending?: boolean;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
};

/** Figma flow footer: ink «بعدی/پرداخت» with an arrow, plus the price pill or a neutral «قبلی». */
export function FlowFooter({ price, primaryLabel, primaryIcon = "solar:arrow-left-linear", onPrimary, primaryPending, primaryDisabled, secondaryLabel, onSecondary, secondaryDisabled }: FlowFooterProps) {
  return (
    <div className="flex items-center gap-3">
      <ActionButton tone="ink" trailingIcon={primaryIcon} onPress={onPrimary} isPending={primaryPending} isDisabled={primaryDisabled} className="shrink-0">
        {primaryLabel}
      </ActionButton>
      {price ? (
        <div className="flex h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground">
          <span className="min-w-0 truncate">{price}</span>
          <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/90 text-accent">
            <Icon name="solar:dollar-bold" size={22} />
          </span>
        </div>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <ActionButton tone="neutral" icon="solar:arrow-right-linear" onPress={onSecondary} isDisabled={secondaryDisabled} className="min-w-0 flex-1">
          {secondaryLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}
