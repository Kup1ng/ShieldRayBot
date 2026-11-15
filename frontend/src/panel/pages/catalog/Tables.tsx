"use client";

import { Button, Checkbox, Dropdown, Label, Table, type Selection } from "@heroui/react";
import type { ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { confirm } from "../../core/confirm";
import { StatusChip } from "../../ui/Data";
import { EmptyBlock } from "../../ui/States";

export function ActiveChip({ active, on = "فعال", off = "خاموش" }: { active: boolean; on?: string; off?: string }) {
  return <StatusChip color={active ? "success" : "warning"}>{active ? on : off}</StatusChip>;
}

export type RowAction = {
  id: string;
  label: string;
  icon: string;
  tone?: "danger";
  disabled?: boolean;
  /** Ask first; the action only runs when the answer is yes. */
  confirmText?: { message: string; description?: string; confirmLabel: string };
  run: () => void | Promise<void>;
};

/** «عملیات» menu of one row: every action the old row buttons offered, with the same confirmations. */
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  const onAction = async (key: React.Key) => {
    const action = actions.find((a) => a.id === String(key));
    if (!action || action.disabled) return;
    if (action.confirmText) {
      const ok = await confirm(action.confirmText.message, { description: action.confirmText.description, confirmLabel: action.confirmText.confirmLabel, tone: action.tone === "danger" ? "danger" : "accent" });
      if (!ok) return;
    }
    await action.run();
  };
  return (
    <Dropdown>
      <Button variant="ghost" size="sm" aria-label={label} className="gap-1">
        <Icon name="solar:menu-dots-bold" size={18} />
        <span className="hidden sm:inline">عملیات</span>
      </Button>
      <Dropdown.Popover placement="bottom end" className="min-w-[180px]">
        <Dropdown.Menu aria-label={label} onAction={(key) => void onAction(key)} disabledKeys={actions.filter((a) => a.disabled).map((a) => a.id)}>
          {actions.map((action) => (
            <Dropdown.Item key={action.id} id={action.id} textValue={action.label}>
              <Icon name={action.icon} size={18} className={action.tone === "danger" ? "text-danger" : "text-muted"} />
              <Label className={action.tone === "danger" ? "text-danger" : undefined}>{action.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export type Column = { id: string; label: ReactNode; className?: string; rowHeader?: boolean };

type SelectableTableProps<T> = {
  ariaLabel: string;
  columns: Column[];
  rows: T[];
  rowId: (row: T) => number;
  cells: (row: T) => ReactNode[];
  empty: ReactNode;
  /** When set, rows get checkboxes and the selection is controlled by the caller. */
  selected?: Selection;
  onSelectedChange?: (keys: Selection) => void;
  /** Rows that cannot be selected (system plans). */
  unselectable?: (row: T) => boolean;
  minWidth?: number;
};

/** A HeroUI table with optional row selection, an empty state and horizontal scroll on a phone. */
export function SelectableTable<T>({ ariaLabel, columns, rows, rowId, cells, empty, selected, onSelectedChange, unselectable, minWidth = 640 }: SelectableTableProps<T>) {
  const selectable = Boolean(onSelectedChange);
  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label={ariaLabel}
          style={{ minWidth }}
          selectionMode={selectable ? "multiple" : "none"}
          selectedKeys={selected}
          onSelectionChange={onSelectedChange}
          disabledKeys={unselectable ? rows.filter(unselectable).map(rowId) : undefined}
        >
          <Table.Header>
            {selectable ? (
              <Table.Column className="w-10 pe-0">
                <Checkbox aria-label="انتخاب همه" slot="selection">
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </Table.Column>
            ) : null}
            {columns.map((column) => (
              <Table.Column key={column.id} id={column.id} isRowHeader={column.rowHeader} className={column.className}>
                {column.label}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body renderEmptyState={() => <EmptyBlock title={empty} />}>
            {rows.map((row) => (
              <Table.Row key={rowId(row)} id={rowId(row)}>
                {selectable ? (
                  <Table.Cell className="pe-0">
                    <Checkbox aria-label="انتخاب ردیف" slot="selection" variant="secondary">
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Cell>
                ) : null}
                {cells(row).map((cell, index) => (
                  <Table.Cell key={columns[index]?.id ?? index} className={columns[index]?.className}>
                    {cell}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

/** The ids a table selection stands for ("all" means every row). */
export function selectedIds(selection: Selection, all: number[]): number[] {
  if (selection === "all") return all;
  return Array.from(selection).map(Number).filter((n) => Number.isFinite(n) && all.includes(n));
}

export type BulkOp = { key: string; label: string; danger?: boolean; confirmMessage: (n: number) => string; confirmTitle: string; confirmLabel: string };

/** Floating action bar shown while rows are selected, with the old page's confirmations. */
export function BulkBar({ count, ops, busy, onRun, onClear }: { count: number; ops: BulkOp[]; busy: boolean; onRun: (op: BulkOp) => void; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="عملیات گروهی" className="glass sticky bottom-4 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl px-4 py-2 shadow-lg">
      <span className="text-sm text-foreground">
        <bdi className="num font-semibold">{count.toLocaleString("fa-IR")}</bdi> مورد انتخاب شده
      </span>
      {ops.map((op) => (
        <Button key={op.key} size="sm" variant={op.danger ? "danger-soft" : "secondary"} isDisabled={busy} onPress={() => onRun(op)}>
          {op.label}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onPress={onClear}>
        لغو انتخاب
      </Button>
    </div>
  );
}

export async function confirmBulk(op: BulkOp, count: number): Promise<boolean> {
  return confirm(op.confirmMessage(count), { description: op.confirmTitle, confirmLabel: op.confirmLabel, tone: op.danger ? "danger" : "accent" });
}
