"use client";

/** The bot menu's two lists: the shortcuts in the keyboard (reorder by drag or arrows, remove) and the ones kept aside (add). */

import { Button, Chip } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { GlassSection } from "../ui/Page";
import { moveTo } from "./logic";
import type { MenuEntry } from "./types";

export type MenuLists = { active: MenuEntry[]; pool: MenuEntry[] };

type ItemProps = {
  item: MenuEntry;
  index: number;
  count: number;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
};

function ActiveItem({ item, index, count, dragging, onDragStart, onDrop, onMove, onRemove }: ItemProps) {
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`inset-tile flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${dragging ? "opacity-50" : ""}`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon name="solar:hamburger-menu-linear" size={18} className="text-muted" />
        {item.label}
        {item.required ? (
          <Chip size="sm" variant="soft">
            <Chip.Label>همیشه در منو</Chip.Label>
          </Chip>
        ) : null}
      </span>
      <span className="flex items-center gap-1">
        <Button isIconOnly size="sm" variant="ghost" aria-label={`بالا بردن ${item.label}`} isDisabled={index === 0} onPress={() => onMove(index - 1)}>
          <Icon name="solar:alt-arrow-up-linear" size={18} />
        </Button>
        <Button isIconOnly size="sm" variant="ghost" aria-label={`پایین بردن ${item.label}`} isDisabled={index === count - 1} onPress={() => onMove(index + 1)}>
          <Icon name="solar:alt-arrow-down-linear" size={18} />
        </Button>
        {item.required ? null : (
          <Button isIconOnly size="sm" variant="ghost" aria-label={`حذف ${item.label} از منو`} onPress={onRemove}>
            <Icon name="solar:close-circle-linear" size={18} />
          </Button>
        )}
      </span>
    </li>
  );
}

export function MenuOrderEditor({ value, onChange }: { value: MenuLists; onChange: (next: MenuLists) => void }) {
  const [dragFrom, setDragFrom] = useState(-1);
  const { active, pool } = value;
  const remove = (item: MenuEntry) => onChange({ active: active.filter((entry) => entry.key !== item.key), pool: [...pool, item] });
  const add = (item: MenuEntry) => onChange({ active: [...active, item], pool: pool.filter((entry) => entry.key !== item.key) });
  const move = (from: number, to: number) => onChange({ active: moveTo(active, from, to), pool });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <GlassSection title="منوی فعال" description="با کشیدن یا دکمه‌های بالا/پایین ترتیب را عوض کنید.">
        {active.length ? (
          <ul className="flex flex-col gap-2" aria-label="منوی فعال">
            {active.map((item, index) => (
              <ActiveItem
                key={item.key}
                item={item}
                index={index}
                count={active.length}
                dragging={dragFrom === index}
                onDragStart={() => setDragFrom(index)}
                onDrop={() => {
                  move(dragFrom, index);
                  setDragFrom(-1);
                }}
                onMove={(to) => move(index, to)}
                onRemove={() => remove(item)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">منو خالی است.</p>
        )}
      </GlassSection>
      <GlassSection title="مخزن" description="دکمه‌هایی که در منو نیستند.">
        {pool.length ? (
          <ul className="flex flex-col gap-2" aria-label="مخزن">
            {pool.map((item) => (
              <li key={item.key} className="inset-tile flex items-center justify-between gap-2 rounded-lg px-3 py-2">
                <span className="text-sm font-medium">{item.label}</span>
                <Button isIconOnly size="sm" variant="ghost" aria-label={`افزودن ${item.label} به منو`} onPress={() => add(item)}>
                  <Icon name="solar:add-circle-linear" size={18} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">همه دکمه‌ها در منو هستند</p>
        )}
      </GlassSection>
    </div>
  );
}
