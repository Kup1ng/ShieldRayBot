"use client";

import { Button } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { fa } from "../../core/format";

export type SelectionItem = { key: string; label: string; count: number; danger?: boolean };

/**
 * The floating bar over a table selection: one button per action that applies to at least
 * one selected row, each showing how many rows it will touch.
 */
export function SelectionBar({ selectedCount, items, onRun, onClear }: { selectedCount: number; items: SelectionItem[]; onRun: (key: string) => void; onClear: () => void }) {
  const shown = items.filter((item) => item.count > 0);
  if (selectedCount === 0 || shown.length === 0) return null;
  return (
    <div role="toolbar" aria-label="عملیات گروهی" className="glass fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-xl p-3">
      <span className="num me-auto text-sm text-muted">{fa(selectedCount)} مورد</span>
      {shown.map((item) => (
        <Button key={item.key} variant={item.danger ? "danger" : "outline"} size="sm" className="!rounded-lg" onPress={() => onRun(item.key)} aria-label={`${item.label} (${fa(item.count)})`}>
          {item.label}
          <span className="num ms-1 opacity-70">{fa(item.count)}</span>
        </Button>
      ))}
      <Button isIconOnly variant="ghost" size="sm" aria-label="لغو انتخاب" onPress={onClear}>
        <Icon name="solar:close-circle-linear" size={20} />
      </Button>
    </div>
  );
}
