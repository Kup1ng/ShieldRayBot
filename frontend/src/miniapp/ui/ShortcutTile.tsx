"use client";

import { Button } from "@heroui/react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";

import { badgeText } from "./countBadge";

type ShortcutTileProps = {
  icon: string;
  tone: TileTone;
  label: string;
  /** A count shown on the tile («۳», or «۹۹+»); hidden for zero. */
  badge?: number | null;
  onPress: () => void;
};

/** A square shortcut: icon tile above a short label, with an optional count. */
export function ShortcutTile({ icon, tone, label, badge, onPress }: ShortcutTileProps) {
  const text = badgeText(badge);
  return (
    <Button
      variant="secondary"
      onPress={onPress}
      aria-label={text ? `${label}، ${text} مورد` : label}
      className="inset-tile !h-auto !w-full flex-col !gap-2 !rounded-lg !px-2 !py-3"
    >
      <span className="relative">
        <IconTile icon={icon} tone={tone} size="lg" />
        {text ? (
          <span aria-hidden className="absolute -top-1.5 -end-2 min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
            {text}
          </span>
        ) : null}
      </span>
      <span className="text-xs font-medium text-foreground/85">{label}</span>
    </Button>
  );
}
