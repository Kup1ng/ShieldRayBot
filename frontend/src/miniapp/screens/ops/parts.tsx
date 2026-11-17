"use client";

import { Button } from "@heroui/react";
import type { ReactNode } from "react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { Icon } from "@/icons/Icon";

/** A group on the glass panel: the neutral inset block with a short title (Figma step groups). */
export function Block({ title, icon, tone, action, children }: { title: string; icon?: string; tone?: TileTone; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="inset-tile flex flex-col gap-3 rounded-lg p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon ? <IconTile icon={icon} tone={tone} /> : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type RowButtonProps = {
  icon: string;
  tone?: TileTone;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  "aria-label"?: string;
  isDisabled?: boolean;
};

/** A tappable list row: tile, two text lines, an optional chip and the chevron. */
export function RowButton({ icon, tone = "purple", title, subtitle, trailing, onPress, isDisabled, ...rest }: RowButtonProps) {
  return (
    <Button
      variant="secondary"
      onPress={onPress}
      isDisabled={isDisabled}
      aria-label={rest["aria-label"]}
      className="inset-tile !h-auto !w-full !justify-start !gap-3 !rounded-lg !p-2 !pe-3 text-start"
    >
      <IconTile icon={icon} tone={tone} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="max-w-full truncate text-sm font-semibold text-foreground">{title}</span>
        {subtitle ? <span className="max-w-full truncate text-xs text-muted">{subtitle}</span> : null}
      </span>
      {trailing}
      <Icon name="solar:alt-arrow-left-linear" size={18} className="text-muted" />
    </Button>
  );
}

type HeroCardProps = {
  label: string;
  /** A short pill beside the label (tier name, bot state). */
  chip?: string;
  value: ReactNode;
  children?: ReactNode;
  ariaLabel?: string;
};

/** The brand-coloured summary card at the top of club and ops screens. */
export function HeroCard({ label, chip, value, children, ariaLabel }: HeroCardProps) {
  return (
    <section
      aria-label={ariaLabel ?? label}
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-[var(--tile-purple)] to-[oklch(45%_0.2_300)] p-5 text-white shadow-[var(--glass-shadow)]"
    >
      <span aria-hidden className="pointer-events-none absolute -end-10 -top-12 size-40 rounded-full bg-white/10" />
      <span aria-hidden className="pointer-events-none absolute -start-6 -bottom-14 size-32 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between gap-2 text-sm text-white/85">
        <span>{label}</span>
        {chip ? <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium">{chip}</span> : null}
      </div>
      <p className="num relative text-3xl font-bold leading-tight">
        <bdi>{value}</bdi>
      </p>
      {children ? <div className="relative flex flex-col gap-1 text-xs text-white/85">{children}</div> : null}
    </section>
  );
}

export type StatSpec = { key: string; label: string; icon: string; tone: TileTone };

/** A two-column grid of count tiles (Figma "Tag-base" with a number). */
export function StatGrid({ stats, specs, format }: { stats: Record<string, number | undefined>; specs: StatSpec[]; format: (value: number) => string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {specs.map((spec) => (
        <div key={spec.key} className="inset-tile flex min-h-14 items-center gap-2 rounded-lg p-2">
          <IconTile icon={spec.icon} tone={spec.tone} />
          <span className="flex min-w-0 flex-col">
            <strong className="num text-base leading-5 font-semibold text-foreground">{format(Number(stats[spec.key]) || 0)}</strong>
            <span className="truncate text-xs text-muted">{spec.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
