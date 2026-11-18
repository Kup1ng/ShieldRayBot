"use client";

import { Checkbox, Table, type Selection } from "@heroui/react";
import { useMemo, useState } from "react";

import { run, type Ask } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { BulkBar, Ltr, RowMenu, StatusChip, type BulkButton, type MenuAction } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { SectionTabs } from "../../ui/SectionTabs";
import { EmptyBlock, Loadable } from "../../ui/States";
import { UserNameLink } from "../../ui/UserNameLink";
import { applicationStatus, RESELLER_TABS } from "./labels";
import type { ApplicationRow, Applications } from "./types";

const LIST_PATH = "/api/panel/resellers/applications";
const BULK_URL = "/resellers/applications/bulk-action";
const RETURN_TO = "/resellers/applications";

type Op = "approve" | "reject";

const ROW_ASK: Record<Op, (row: ApplicationRow) => Ask> = {
  approve: () => ({ title: "تأیید درخواست", text: "این درخواست نمایندگی تأیید شود؟", confirmLabel: "تأیید" }),
  reject: (row) =>
    row.status === "pending_payment"
      ? { title: "رد درخواست", text: "درخواست منتظر پرداخت رد/لغو شود؟ کاربر می‌تواند دوباره درخواست بدهد.", confirmLabel: "رد", tone: "danger" }
      : { title: "رد درخواست", text: "این درخواست رد شود؟", confirmLabel: "رد", tone: "danger" },
};

const BULK_ASK: Record<Op, (n: number) => Ask> = {
  approve: (n) => ({ title: "تأیید گروهی", text: `${fa(n)} درخواست تأیید شوند؟`, confirmLabel: "تأیید" }),
  reject: (n) => ({ title: "رد گروهی", text: `${fa(n)} درخواست رد شوند؟`, confirmLabel: "رد", tone: "danger" }),
};

const OP_LABEL: Record<Op, string> = { approve: "تأیید", reject: "رد" };

/** The rows of a selection that accept an operation: a payment still pending can only be rejected. */
export function eligibleFor(rows: ApplicationRow[], ids: Set<number>, op: Op): number[] {
  return rows.filter((row) => ids.has(row.id) && row.ops.includes(op)).map((row) => row.id);
}

function rowActions(row: ApplicationRow, refresh: () => void): MenuAction[] {
  return row.ops.map((op) => ({
    id: op,
    label: row.status === "pending_payment" && op === "reject" ? "رد / لغو" : OP_LABEL[op],
    icon: op === "approve" ? "solar:check-circle-linear" : "solar:close-circle-linear",
    danger: op === "reject",
    onAction: () => void run(`/resellers/applications/${row.id}/${op}`, {}, { ask: ROW_ASK[op](row), refresh }),
  }));
}

function selectedSet(keys: Selection, rows: ApplicationRow[]): Set<number> {
  const present = new Set(rows.map((row) => row.id));
  if (keys === "all") return present;
  return new Set([...keys].map(Number).filter((id) => present.has(id)));
}

function ApplicationsTable({ rows, refresh }: { rows: ApplicationRow[]; refresh: () => void }) {
  const [keys, setKeys] = useState<Selection>(new Set());
  const ids = useMemo(() => selectedSet(keys, rows), [keys, rows]);
  const buttons: BulkButton[] = (["approve", "reject"] as const)
    .map((op) => ({ op, eligible: eligibleFor(rows, ids, op) }))
    .filter(({ eligible }) => eligible.length > 0)
    .map(({ op, eligible }) => ({
      op,
      label: OP_LABEL[op],
      danger: op === "reject",
      count: eligible.length,
      onPress: () =>
        void run(BULK_URL, { action: op, ids: eligible, return_to: RETURN_TO }, { ask: BULK_ASK[op](eligible.length), refresh: () => {
          setKeys(new Set());
          refresh();
        } }),
    }));

  return (
    <>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="درخواست‌های نمایندگی" className="min-w-[560px]" selectionMode="multiple" selectedKeys={keys} onSelectionChange={setKeys}>
            <Table.Header>
              <Table.Column className="w-10 pe-0">
                <Checkbox aria-label="انتخاب همهٔ درخواست‌ها" slot="selection">
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </Table.Column>
              <Table.Column isRowHeader>#</Table.Column>
              <Table.Column>کاربر</Table.Column>
              <Table.Column className="hidden md:table-cell">پلن</Table.Column>
              <Table.Column>مبلغ</Table.Column>
              <Table.Column>وضعیت</Table.Column>
              <Table.Column className="w-12">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => {
                const status = applicationStatus(row.status);
                return (
                  <Table.Row key={row.id} id={row.id}>
                    <Table.Cell className="pe-0">
                      <Checkbox aria-label={`انتخاب درخواست ${fa(row.id)}`} slot="selection" variant="secondary">
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox.Content>
                      </Checkbox>
                    </Table.Cell>
                    <Table.Cell>
                      <Ltr>{fa(row.id)}</Ltr>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <UserNameLink userId={row.user_id} name={row.user_name || "—"} page="applications" />
                        {row.telegram_id ? (
                          <span className="text-xs text-muted">
                            <Ltr>{row.telegram_id}</Ltr>
                          </span>
                        ) : null}
                        <span className="text-xs text-muted md:hidden">{row.plan_name || "—"}</span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="hidden md:table-cell">{row.plan_name || "—"}</Table.Cell>
                    <Table.Cell>
                      <Ltr>{fa(row.price)}</Ltr>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusChip color={status.color}>{status.label}</StatusChip>
                    </Table.Cell>
                    <Table.Cell>
                      <RowMenu label={`عملیات درخواست ${fa(row.id)}`} actions={rowActions(row, refresh)} />
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <BulkBar selected={ids.size} buttons={buttons} onClear={() => setKeys(new Set())} label="عملیات گروهی درخواست‌ها" />
    </>
  );
}

function Body() {
  useUrlFlash();
  const state = useJson<Applications>(LIST_PATH);
  return (
    <>
      <PageHeader icon="solar:document-add-bold" tone="teal" title="درخواست‌های نمایندگی" description="درخواست‌هایی که منتظر تأیید یا پرداخت هستند" />
      <SectionTabs label="نمایندگی" items={RESELLER_TABS} active="apps" />
      <GlassSection title="درخواست‌ها" description="آخرین درخواست‌ها، تازه‌ترین در بالا">
        <Loadable state={state}>
          {(data) =>
            data.rows.length ? <ApplicationsTable rows={data.rows} refresh={state.reload} /> : <EmptyBlock icon="solar:document-add-linear" title="درخواستی نیست" />
          }
        </Loadable>
      </GlassSection>
    </>
  );
}

export function ApplicationsPage() {
  return (
    <PanelShell title="درخواست‌های نمایندگی">
      <Body />
    </PanelShell>
  );
}
