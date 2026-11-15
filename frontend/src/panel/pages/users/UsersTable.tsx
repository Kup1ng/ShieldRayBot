"use client";

import { Button, Checkbox, Chip, Dropdown, Label, ListBox, Select, Table, type SortDescriptor } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/icons/Icon";

import { expireToneClass, money, roleLabel, selectedIds, sortRows, type SortColumn } from "./format";
import { RiskTagChip } from "./RiskTagChip";
import type { ServiceSummary, UserRow, UsersList } from "./types";

export type RowAction = "message" | "renew" | "edit" | "block" | "delete";

const SELECT_BOX = (
  <Checkbox.Content>
    <Checkbox.Control>
      <Checkbox.Indicator />
    </Checkbox.Control>
  </Checkbox.Content>
);

function AlertDot() {
  return <span role="img" aria-label="اعلان سرویس" title="اعلان سرویس" className="inline-block size-2 shrink-0 rounded-full bg-danger" />;
}

/** The service column: nothing, the one service, or a picker that drives the volume and expiry cells. */
function ServiceCell({ row, active, onPick }: { row: UserRow; active: ServiceSummary | undefined; onPick: (serviceId: number) => void }) {
  if (row.service_count === 0) return <span className="text-muted">بدون سرویس</span>;
  if (row.service_count === 1 || !active) {
    const only = row.services[0];
    return (
      <span className="inline-flex items-center gap-1.5" title={only?.label}>
        <span className="truncate">{only?.label}</span>
        {only?.has_alert ? <AlertDot /> : null}
      </span>
    );
  }
  return (
    <Select aria-label="سرویس‌های کاربر" value={String(active.id)} onChange={(key) => key !== null && onPick(Number(key))} variant="secondary" className="min-w-44">
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {row.services.map((service) => (
            <ListBox.Item key={service.id} id={String(service.id)} textValue={service.label}>
              {service.label}
              {service.has_alert ? " ●" : ""}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function RowMenu({ row, can, onAction }: { row: UserRow; can: UsersList["can"]; onAction: (action: RowAction) => void }) {
  const items: { id: RowAction; label: string; icon: string; danger?: boolean }[] = [];
  if (row.can_message) items.push({ id: "message", label: "پیام", icon: "solar:chat-round-dots-linear" });
  if (row.can_renew) items.push({ id: "renew", label: "تمدید سریع", icon: "solar:refresh-circle-linear" });
  if (can.edit_services) items.push({ id: "edit", label: "ویرایش", icon: "solar:pen-linear" });
  if (can.manage) items.push({ id: "block", label: row.is_blocked ? "رفع مسدودی" : "مسدود", icon: row.is_blocked ? "solar:lock-unlocked-linear" : "solar:lock-linear" });
  if (can.manage && row.role !== "admin") items.push({ id: "delete", label: "حذف", icon: "solar:trash-bin-trash-linear", danger: true });
  if (items.length === 0) return null;
  return (
    <Dropdown>
      <Button isIconOnly variant="ghost" size="sm" aria-label={`عملیات ${row.name}`}>
        <Icon name="solar:menu-dots-bold" size={20} />
      </Button>
      <Dropdown.Popover placement="bottom end" className="min-w-[180px]">
        <Dropdown.Menu aria-label="عملیات کاربر" onAction={(key) => onAction(String(key) as RowAction)}>
          {items.map((item) => (
            <Dropdown.Item key={item.id} id={item.id} textValue={item.label} variant={item.danger ? "danger" : "default"}>
              <Icon name={item.icon} size={18} className={item.danger ? "text-danger" : "text-muted"} />
              <Label className={item.danger ? "text-danger" : undefined}>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function SortHeader({ children, sortDirection }: { children: string; sortDirection?: "ascending" | "descending" }) {
  return <Table.SortableColumnHeader sortDirection={sortDirection}>{children}</Table.SortableColumnHeader>;
}

type UsersTableProps = {
  rows: UserRow[];
  can: UsersList["can"];
  focusUid: number | null;
  selected: ReadonlySet<number>;
  onSelect: (next: Set<number>) => void;
  onOpenCard: (id: number) => void;
  onRowAction: (row: UserRow, action: RowAction) => void;
};

export function UsersTable({ rows, can, focusUid, selected, onSelect, onOpenCard, onRowAction }: UsersTableProps) {
  const [sort, setSort] = useState<SortDescriptor | undefined>(undefined);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const sorted = useMemo(() => sortRows(rows, sort ? { column: sort.column as SortColumn, direction: sort.direction } : null), [rows, sort]);

  // A deep link (?uid=) scrolls its row into view once.
  useEffect(() => {
    if (focusUid) document.querySelector(".users-focus-row")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusUid, rows]);

  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label="کاربران بات"
          className="min-w-[760px]"
          selectionMode="multiple"
          selectedKeys={new Set(selected)}
          onSelectionChange={(keys) => onSelect(selectedIds(keys === "all" ? "all" : (keys as Set<string | number>), rows))}
          sortDescriptor={sort}
          onSortChange={setSort}
        >
          <Table.Header>
            <Table.Column className="w-10 pe-0">
              <Checkbox aria-label="انتخاب همه" slot="selection">
                {SELECT_BOX}
              </Checkbox>
            </Table.Column>
            <Table.Column allowsSorting id="id" className="hidden md:table-cell">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>#</SortHeader>}
            </Table.Column>
            <Table.Column className="hidden lg:table-cell">تلگرام</Table.Column>
            <Table.Column allowsSorting isRowHeader id="name">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>نام</SortHeader>}
            </Table.Column>
            <Table.Column>سرویس</Table.Column>
            <Table.Column className="hidden sm:table-cell">حجم</Table.Column>
            <Table.Column allowsSorting id="expire">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>انقضا</SortHeader>}
            </Table.Column>
            <Table.Column allowsSorting id="wallet" className="hidden sm:table-cell">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>کیف پول</SortHeader>}
            </Table.Column>
            <Table.Column>وضعیت</Table.Column>
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body renderEmptyState={() => <p className="py-6 text-center text-sm text-muted">کاربری نیست</p>}>
            {sorted.map((row) => {
              const multi = row.service_count > 1;
              const active = multi ? (row.services.find((s) => s.id === picked[row.id]) ?? row.services[0]) : undefined;
              const volume = active ? active.volume_text : row.volume_text;
              const expire = active ? active.expire_text : row.expire_text;
              const tone = active ? active.expire_tone : row.expire_tone;
              return (
                <Table.Row key={row.id} id={row.id} className={row.id === focusUid ? "users-focus-row bg-accent/10" : undefined}>
                  <Table.Cell className="pe-0">
                    <Checkbox aria-label={`انتخاب ${row.name}`} slot="selection" variant="secondary">
                      {SELECT_BOX}
                    </Checkbox>
                  </Table.Cell>
                  <Table.Cell className="hidden md:table-cell">
                    <bdi dir="ltr" className="num text-muted">
                      {row.id}
                    </bdi>
                  </Table.Cell>
                  <Table.Cell className="hidden lg:table-cell">
                    <bdi dir="ltr" className="num text-muted">
                      {row.telegram_id}
                    </bdi>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        {can.edit_services ? (
                          <Button variant="ghost" className="!h-auto !min-w-0 !justify-start !p-0 font-medium text-foreground hover:underline" onPress={() => onOpenCard(row.id)} aria-label={`اطلاعات ${row.name}`}>
                            <span className="truncate" dir="auto">
                              {row.name}
                            </span>
                          </Button>
                        ) : (
                          <span className="min-w-0 truncate font-medium text-foreground" dir="auto">
                            {row.name}
                          </span>
                        )}
                        {row.has_alert ? <AlertDot /> : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {row.is_demo ? (
                          <Chip size="sm" variant="soft">
                            دمو
                          </Chip>
                        ) : null}
                        <Chip size="sm" variant="soft" color={row.role === "admin" ? "danger" : row.role === "reseller" ? "accent" : "default"}>
                          {roleLabel(row.role)}
                        </Chip>
                        <RiskTagChip tag={row.tag} />
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <ServiceCell row={row} active={active} onPick={(serviceId) => setPicked((prev) => ({ ...prev, [row.id]: serviceId }))} />
                  </Table.Cell>
                  <Table.Cell className="hidden sm:table-cell">{volume}</Table.Cell>
                  <Table.Cell>
                    <span className={expireToneClass(tone)}>{expire}</span>
                  </Table.Cell>
                  <Table.Cell className="hidden sm:table-cell">
                    <bdi dir="ltr" className="num">
                      {money(row.wallet_balance)}
                    </bdi>
                  </Table.Cell>
                  <Table.Cell>
                    <Chip size="sm" variant="soft" color={row.is_blocked ? "danger" : "success"}>
                      {row.is_blocked ? "مسدود" : "فعال"}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    <RowMenu row={row} can={can} onAction={(action) => onRowAction(row, action)} />
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
