"use client";

import { Button } from "@heroui/react";

import { IconTile, type TileTone } from "@/components/ui/IconTile";
import { Icon } from "@/icons/Icon";

type ManageRowProps = {
  icon: string;
  tone: TileTone;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

/** A pressable inset row: icon tile, label and a chevron (the «مدیریت سرویس» entries). */
export function ManageRow({ icon, tone, label, onPress, danger }: ManageRowProps) {
  return (
    <Button
      variant="secondary"
      onPress={onPress}
      className="inset-tile !h-auto min-h-12 !w-full !justify-start !gap-2 !rounded-lg !p-2 !pe-3 text-start"
    >
      <IconTile icon={icon} tone={tone} />
      <span className={`min-w-0 flex-1 text-sm font-medium ${danger ? "text-danger" : "text-foreground"}`}>{label}</span>
      <Icon name="solar:alt-arrow-left-linear" size={18} className="text-muted" />
    </Button>
  );
}
