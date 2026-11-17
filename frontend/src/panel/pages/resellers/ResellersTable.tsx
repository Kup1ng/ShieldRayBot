"use client";

import { Checkbox, Chip, Table, type Selection } from "@heroui/react";

import { fa } from "../../core/format";
import { Ltr, RowMenu, StatusChip, type MenuAction } from "../../ui/Data";
import { roleLabel, SETUP_LABELS, STATUS_LABELS, isPayg } from "./labels";
import { RiskTagChip } from "../users/RiskTagChip";
import type { ResellerRow } from "./types";

export type RowHandlers = {
  onEdit: (row: ResellerRow) => void;
  onTag: (row: ResellerRow) => void;
  onDeleteShop: (row: ResellerRow) => void;
  onDeleteUser: (row: ResellerRow) => void;
};

/** What the row's menu offers: the owner manages the shop, a representative only tags it. */
export function rowActions(row: ResellerRow, ownerView: boolean, h: RowHandlers): MenuAction[] {
  const tag: MenuAction = { id: "tag", label: "تگ ریسک", icon: "solar:tag-linear", onAction: () => h.onTag(row) };
  if (!ownerView) return [tag];
  return [
    { id: "edit", label: "ویرایش", icon: "solar:pen-linear", onAction: () => h.onEdit(row) },
    tag,
    { id: "delete_shop", label: "حذف نمایندگی", icon: "solar:trash-bin-minimalistic-linear", danger: true, onAction: () => h.onDeleteShop(row) },
    { id: "delete_user", label: "حذف کاربر", icon: "solar:user-cross-linear", danger: true, onAction: () => h.onDeleteUser(row) },
  ];
}

function NameCell({ row, ownerView }: { row: ResellerRow; ownerView: boolean }) {
  const name = row.name || "—";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {ownerView ? (
          <a href={`/resellers/${row.user_id}/edit`} dir="auto" className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline">
            {name}
          </a>
        ) : (
          <span dir="auto" className="font-medium text-foreground">
            {name}
          </span>
        )}
        <span className="text-xs text-muted md:hidden">
          (<Ltr>{row.telegram_id}</Ltr>)
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <RiskTagChip tag={row.tag} />
        {row.oversold ? <StatusChip color="danger">تجاوز از سقف حجم</StatusChip> : null}
        {row.bot_username ? (
          <span className="text-xs text-muted md:hidden">
            <Ltr>@{row.bot_username}</Ltr>
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Check({ label }: { label: string }) {
  return (
    <Checkbox aria-label={label} slot="selection" variant="secondary">
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}

export function ResellersTable({
  rows,
  ownerView,
  selected,
  onSelect,
  handlers,
}: {
  rows: ResellerRow[];
  ownerView: boolean;
  selected: Selection;
  onSelect: (keys: Selection) => void;
  handlers: RowHandlers;
}) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="نمایندگان" className="min-w-[760px]" selectionMode={ownerView ? "multiple" : "none"} selectedKeys={selected} onSelectionChange={onSelect}>
          <Table.Header>
            {ownerView ? (
              <Table.Column className="w-10 pe-0">
                <Check label="انتخاب همهٔ نمایندگان" />
              </Table.Column>
            ) : null}
            <Table.Column isRowHeader>کاربر</Table.Column>
            <Table.Column className="hidden md:table-cell">تلگرام</Table.Column>
            <Table.Column className="hidden md:table-cell">نقش</Table.Column>
            <Table.Column>نوع پلن</Table.Column>
            <Table.Column>وضعیت</Table.Column>
            <Table.Column>کاربران</Table.Column>
            <Table.Column>حجم</Table.Column>
            <Table.Column className="hidden xl:table-cell">وب</Table.Column>
            <Table.Column className="hidden xl:table-cell">ربات</Table.Column>
            <Table.Column className="hidden xl:table-cell">راه‌اندازی</Table.Column>
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => {
              const status = STATUS_LABELS[row.status];
              const setup = SETUP_LABELS[row.setup];
              return (
                <Table.Row key={row.user_id} id={row.user_id}>
                  {ownerView ? (
                    <Table.Cell className="pe-0">
                      <Check label={`انتخاب ${row.name || fa(row.user_id)}`} />
                    </Table.Cell>
                  ) : null}
                  <Table.Cell>
                    <NameCell row={row} ownerView={ownerView} />
                  </Table.Cell>
                  <Table.Cell className="hidden md:table-cell">
                    <Ltr>{row.telegram_id}</Ltr>
                  </Table.Cell>
                  <Table.Cell className="hidden md:table-cell">
                    <Chip size="sm" variant="soft" color={row.role === "admin" ? "accent" : row.role === "reseller" ? "success" : "default"}>
                      <Chip.Label>{roleLabel(row.role)}</Chip.Label>
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusChip color={isPayg(row.billing_mode) ? "accent" : "default"}>{isPayg(row.billing_mode) ? "PAYG" : "ثابت"}</StatusChip>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusChip color={status.color}>{status.label}</StatusChip>
                  </Table.Cell>
                  <Table.Cell>
                    <Ltr>{row.usage.users_text}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col">
                      <Ltr>{row.usage.traffic_text}</Ltr>
                      {row.usage.lifetime_text ? (
                        <span className="text-xs text-muted">
                          Σ <Ltr>{row.usage.lifetime_text}</Ltr>
                        </span>
                      ) : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="hidden xl:table-cell">{row.web_username ? <Ltr>{row.web_username}</Ltr> : "—"}</Table.Cell>
                  <Table.Cell className="hidden xl:table-cell">{row.bot_username ? <Ltr>@{row.bot_username}</Ltr> : "—"}</Table.Cell>
                  <Table.Cell className="hidden xl:table-cell">{setup ? <StatusChip color={setup.color}>{setup.label}</StatusChip> : "—"}</Table.Cell>
                  <Table.Cell>
                    <RowMenu label={`عملیات ${row.name || fa(row.user_id)}`} actions={rowActions(row, ownerView, handlers)} />
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
