"use client";

/** Table and list building blocks of panel pages: chips, row menus, search, paging, bulk bar. */

import { Button, Chip, Dropdown, Label, Pagination, SearchField, Separator, Tooltip } from "@heroui/react";
import { ActionBar } from "@heroui-pro/react";
import { useState, type ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { fa, type ChipColor } from "../core/format";

/** Paging block the list endpoints return. */
export type Pager = {
  page: number;
  page_size: number;
  total: number | null;
  pages: number | null;
  has_prev: boolean;
  has_next: boolean;
  prev_page: number | null;
  next_page: number | null;
};

export function StatusChip({ color, children }: { color: ChipColor; children: ReactNode }) {
  return (
    <Chip size="sm" color={color} variant="soft">
      <Chip.Label>{children}</Chip.Label>
    </Chip>
  );
}

/** A number or code that must keep its left-to-right order inside Persian text. */
export function Ltr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`num ${className}`}>
      {children}
    </bdi>
  );
}

export function SearchBar({ value, placeholder, onSearch }: { value: string; placeholder: string; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // The address can change under us (back button): follow it.
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <form
      className="flex items-end gap-2"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draft.trim());
      }}
    >
      <SearchField name="q" value={draft} onChange={setDraft} className="min-w-0 flex-1 sm:max-w-sm" aria-label="جستجو">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={placeholder} autoComplete="off" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <Button type="submit" variant="outline" className="!h-10">
        جستجو
      </Button>
    </form>
  );
}

export function PagerBar({ pager, noun, onPage }: { pager: Pager; noun: string; onPage: (page: number) => void }) {
  if (!pager.has_prev && !pager.has_next) return null;
  return (
    <nav aria-label={`صفحه‌بندی ${noun}`} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        {pager.pages && pager.total !== null ? (
          <>
            صفحه {fa(pager.page)} از {fa(pager.pages)} · {fa(pager.total)} {noun}
          </>
        ) : (
          <>صفحه {fa(pager.page)}</>
        )}
      </p>
      <Pagination>
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous isDisabled={!pager.has_prev} onPress={() => pager.prev_page && onPage(pager.prev_page)}>
              <Pagination.PreviousIcon />
              <span>قبلی</span>
            </Pagination.Previous>
          </Pagination.Item>
          <Pagination.Item>
            <Pagination.Next isDisabled={!pager.has_next} onPress={() => pager.next_page && onPage(pager.next_page)}>
              <span>بعدی</span>
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
    </nav>
  );
}

export type MenuAction = { id: string; label: string; icon?: string; danger?: boolean; onAction: () => void };

/** The ghost «⋯» button with a menu of the row's actions. */
export function RowMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  if (!actions.length) return <span className="text-muted">—</span>;
  return (
    <Dropdown>
      <Tooltip delay={600}>
        <Button isIconOnly size="sm" variant="ghost" aria-label={label}>
          <Icon name="solar:menu-dots-bold" size={20} />
        </Button>
        <Tooltip.Content>
          <p>{label}</p>
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover placement="bottom start" className="min-w-[200px]">
        <Dropdown.Menu aria-label={label} onAction={(key) => actions.find((a) => a.id === String(key))?.onAction()}>
          {actions.map((action) => (
            <Dropdown.Item key={action.id} id={action.id} textValue={action.label} variant={action.danger ? "danger" : undefined}>
              {action.icon ? <Icon name={action.icon} size={18} className="text-muted" /> : null}
              <Label>{action.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export type BulkButton = { op: string; label: string; count: number; danger?: boolean; onPress: () => void };

/** Floating bar with the number of selected rows and the operations they accept. */
export function BulkBar({ selected, buttons, onClear, label }: { selected: number; buttons: BulkButton[]; onClear: () => void; label: string }) {
  return (
    <ActionBar isOpen={selected > 0} aria-label={label}>
      <ActionBar.Prefix>
        <Chip size="sm" className="num shrink-0">
          {fa(selected)}
        </Chip>
      </ActionBar.Prefix>
      <Separator />
      <ActionBar.Content>
        {buttons.map((button) => (
          <Button key={button.op} size="sm" variant="ghost" className={button.danger ? "bg-danger/10 text-danger" : undefined} onPress={button.onPress}>
            <span>{button.label}</span>
            <span className="num text-xs opacity-70">({fa(button.count)})</span>
          </Button>
        ))}
      </ActionBar.Content>
      <Separator />
      <ActionBar.Suffix>
        <Tooltip>
          <Button isIconOnly size="sm" variant="ghost" aria-label="لغو انتخاب" onPress={onClear}>
            <Icon name="solar:close-circle-linear" size={20} />
          </Button>
          <Tooltip.Content>لغو انتخاب</Tooltip.Content>
        </Tooltip>
      </ActionBar.Suffix>
    </ActionBar>
  );
}
