"use client";

import { Button } from "@heroui/react";
import type { ReactNode } from "react";

import { Icon } from "@/icons/Icon";

/**
 * Figma "button base": 48px tall, 16px corners. Tones map to the flows' buttons —
 * accent (primary), yellow (services), neutral (support / secondary), ink (Next / Submit).
 */
export type ActionTone = "accent" | "yellow" | "neutral" | "ink" | "danger" | "success";

const TONE_CLASS: Record<ActionTone, string> = {
  accent: "",
  yellow: "!bg-[var(--tile-yellow)] !text-[var(--eclipse)] !border-transparent",
  neutral: "inset-tile raised !text-foreground/80",
  ink: "button--ink",
  danger: "",
  success: "!bg-[var(--tile-green)] !text-white !border-transparent",
};

const TONE_VARIANT: Record<ActionTone, "primary" | "secondary" | "danger-soft"> = {
  accent: "primary",
  yellow: "secondary",
  neutral: "secondary",
  ink: "secondary",
  danger: "danger-soft",
  success: "secondary",
};

type ActionButtonProps = {
  tone?: ActionTone;
  icon?: string;
  /** Icon after the label (e.g. the arrow on «بعدی»). */
  trailingIcon?: string;
  children: ReactNode;
  onPress?: () => void;
  isPending?: boolean;
  isDisabled?: boolean;
  fullWidth?: boolean;
  size?: "md" | "lg";
  type?: "button" | "submit";
  className?: string;
  "aria-label"?: string;
};

export function ActionButton({
  tone = "accent",
  icon,
  trailingIcon,
  children,
  onPress,
  isPending,
  isDisabled,
  fullWidth,
  size = "lg",
  type = "button",
  className = "",
  ...rest
}: ActionButtonProps) {
  const height = size === "lg" ? "!h-12" : "!h-10";
  return (
    <Button
      type={type}
      variant={TONE_VARIANT[tone]}
      onPress={onPress}
      isPending={isPending}
      isDisabled={isDisabled}
      fullWidth={fullWidth}
      className={`${height} !rounded-lg px-5 text-sm font-medium ${TONE_CLASS[tone]} ${className}`}
      aria-label={rest["aria-label"]}
    >
      {icon ? <Icon name={icon} size={22} className="!size-[22px]" /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={22} className="!size-[22px]" /> : null}
    </Button>
  );
}
