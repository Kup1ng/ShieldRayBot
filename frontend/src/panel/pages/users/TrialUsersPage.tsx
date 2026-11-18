"use client";

import { Button, Checkbox, Chip, Dropdown, Input, Label, Table, Tabs } from "@heroui/react";
import { useMemo, useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { run, type Ask } from "../../core/actions";
import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { SectionTabs } from "../../ui/SectionTabs";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../ui/States";
import { UserNameLink } from "../../ui/UserNameLink";
import { money, selectedIds } from "./format";
import { ReasonDialog, type ReasonRequest } from "./ReasonDialog";
import { SelectionBar } from "./SelectionBar";
import type { TrialOp, TrialRow, TrialUsers } from "./types";
import { useSelection } from "./useSelection";

const TRIAL_PARAMS = ["filter", "q", "before"] as const;
const BULK_PATH = "/trial-users/bulk-action";
const SEARCH_MAX = 64;
const MESSAGE_MAX = 1000;
const OP_ORDER: TrialOp[] = ["message", "block", "unblock"];

type OpMeta = { label: string; question: string; confirmLabel: string; tone: "accent" | "warning"; icon: string };

/** Confirmation copy; `{n}` is the number of people the action will reach. */
const OPS: Record<TrialOp, OpMeta> = {
  message: { label: "پیام", question: "پیام برای {n} کاربر ارسال شود؟ کاربرانی که پیام بازاریابی را قطع کرده‌اند حذف می‌شوند.", confirmLabel: "ارسال", tone: "accent", icon: "solar:chat-round-dots-linear" },
  block: { label: "مسدود", question: "{n} کاربر در کل سیستم مسدود شوند؟ پیام برای کاربر ارسال می‌شود.", confirmLabel: "مسدود کردن", tone: "warning", icon: "solar:lock-linear" },
  unblock: { label: "رفع مسدودی", question: "مسدودیت {n} کاربر برداشته شود؟", confirmLabel: "رفع مسدودی", tone: "accent", icon: "solar:lock-unlocked-linear" },
};

const ONE_QUESTION: Record<TrialOp, string> = {
  message: "پیام برای این کاربر ارسال شود؟",
  block: "این کاربر در کل سیستم مسدود شود؟ پیام برای کاربر ارسال می‌شود.",
  unblock: "مسدودیت این کاربر برداشته شود؟",
};

function dataPath(read: (key: string) => string): string {
  const query = new URLSearchParams();
  for (const key of TRIAL_PARAMS) {
    const value = read(key);
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return `/api/panel/trial-users${text ? `?${text}` : ""}`;
}

function FilterButton({ active, onPress, children }: { active: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onPress} aria-pressed={active} className={`rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-focus ${active ? "ring-2 ring-accent" : ""}`}>
      {children}
    </button>
  );
}

function RowMenu({ row, onOp }: { row: TrialRow; onOp: (op: TrialOp) => void }) {
  if (row.ops.length === 0) return null;
  return (
    <Dropdown>
      <Button isIconOnly variant="ghost" size="sm" aria-label={`عملیات ${row.name}`}>
        <Icon name="solar:menu-dots-bold" size={20} />
      </Button>
      <Dropdown.Popover placement="bottom end" className="min-w-[170px]">
        <Dropdown.Menu aria-label="عملیات کاربر تست" onAction={(key) => onOp(String(key) as TrialOp)}>
          {row.ops.map((op) => (
            <Dropdown.Item key={op} id={op} textValue={OPS[op].label}>
              <Icon name={OPS[op].icon} size={18} className="text-muted" />
              <Label>{OPS[op].label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

const SELECT_BOX = (
  <Checkbox.Content>
    <Checkbox.Control>
      <Checkbox.Indicator />
    </Checkbox.Control>
  </Checkbox.Content>
);

function TrialTable({ data, selectable, selected, onSelect, onOp }: { data: TrialUsers; selectable: boolean; selected: ReadonlySet<number>; onSelect: (next: Set<number>) => void; onOp: (row: TrialRow, op: TrialOp) => void }) {
  const rows = useMemo(() => data.rows.map((row) => ({ ...row, id: row.user_id })), [data.rows]);
  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label="کاربران تست"
          className="min-w-[820px]"
          selectionMode={selectable ? "multiple" : "none"}
          selectedKeys={new Set(selected)}
          onSelectionChange={(keys) => onSelect(selectedIds(keys === "all" ? "all" : (keys as Set<string | number>), rows))}
        >
          <Table.Header>
            {selectable ? (
              <Table.Column className="w-10 pe-0">
                <Checkbox aria-label="انتخاب همه" slot="selection">
                  {SELECT_BOX}
                </Checkbox>
              </Table.Column>
            ) : null}
            <Table.Column className="hidden md:table-cell">#</Table.Column>
            <Table.Column isRowHeader>کاربر</Table.Column>
            <Table.Column className="hidden lg:table-cell">تلگرام</Table.Column>
            <Table.Column>وضعیت تست</Table.Column>
            <Table.Column className="hidden md:table-cell">زمان تست</Table.Column>
            <Table.Column>مجموع خرید</Table.Column>
            <Table.Column>خرید</Table.Column>
            <Table.Column className="hidden lg:table-cell">اولین خرید</Table.Column>
            <Table.Column className="hidden md:table-cell">حساب</Table.Column>
            {selectable ? (
              <Table.Column className="w-12">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            ) : null}
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.user_id} id={row.user_id}>
                {selectable ? (
                  <Table.Cell className="pe-0">
                    <Checkbox aria-label={`انتخاب ${row.name}`} slot="selection" variant="secondary">
                      {SELECT_BOX}
                    </Checkbox>
                  </Table.Cell>
                ) : null}
                <Table.Cell className="hidden md:table-cell">
                  <bdi dir="ltr" className="num text-muted">
                    {row.trial_order_id}
                  </bdi>
                </Table.Cell>
                <Table.Cell>
                  <UserNameLink userId={row.user_id} name={row.name} page="trials" />
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell">
                  <bdi dir="ltr" className="num text-muted">
                    {row.telegram_id}
                  </bdi>
                </Table.Cell>
                <Table.Cell>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {row.trial_state_label}
                    {row.is_blocked ? (
                      <Chip size="sm" variant="soft" color="danger" className="md:hidden">
                        مسدود
                      </Chip>
                    ) : null}
                  </span>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <bdi dir="ltr" className="num text-muted">
                    {row.trial_at}
                  </bdi>
                </Table.Cell>
                <Table.Cell>
                  {row.is_buyer ? (
                    <bdi dir="ltr" className="num">
                      {money(row.total_spent)}
                    </bdi>
                  ) : (
                    "—"
                  )}
                </Table.Cell>
                <Table.Cell>
                  {row.is_buyer ? (
                    <Chip size="sm" variant="soft" color="success" title={`${fa(row.purchase_count)} خرید`}>
                      خریدار
                    </Chip>
                  ) : (
                    <Chip size="sm" variant="soft">
                      بدون خرید
                    </Chip>
                  )}
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell">
                  {row.first_purchase_at ? (
                    <bdi dir="ltr" className="num text-muted">
                      {row.first_purchase_at}
                    </bdi>
                  ) : (
                    "—"
                  )}
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Chip size="sm" variant="soft" color={row.is_blocked ? "danger" : "success"}>
                      {row.is_blocked ? "مسدود" : "فعال"}
                    </Chip>
                    {row.is_opted_out ? (
                      <Chip size="sm" variant="soft" title="پیام بازاریابی دریافت نمی‌کند">
                        انصراف از پیام
                      </Chip>
                    ) : null}
                  </span>
                </Table.Cell>
                {selectable ? (
                  <Table.Cell>
                    <RowMenu row={row} onOp={(op) => onOp(row, op)} />
                  </Table.Cell>
                ) : null}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

/** Keyed by the applied search, so a new address starts the box from that text. */
function TrialSearch({ q, onSearch }: { q: string; onSearch: (text: string) => void }) {
  const [text, setText] = useState(q);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(text.trim());
  };
  return (
    <form onSubmit={submit} role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Icon name="solar:magnifer-linear" size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input aria-label="جستجوی کاربران تست" value={text} onChange={(event) => setText(event.target.value)} maxLength={SEARCH_MAX} placeholder="نام، یوزرنیم یا شناسهٔ تلگرام…" autoComplete="off" fullWidth className="!ps-9" />
      </div>
      <Button type="submit" variant="outline" className="!h-10 !rounded-lg">
        جستجو
      </Button>
    </form>
  );
}

export function TrialContent() {
  const { search } = useLocation();
  const query = useQuery();
  const update = query.set;
  const trial = useJson<TrialUsers>(dataPath(query.get));
  const { data, reload } = trial;
  const { selected, select: setSelected, clear: clearSelection } = useSelection(search);
  const [reason, setReason] = useState<ReasonRequest | null>(null);

  // A message the server left in the address (?ok= / ?err=) is shown once.
  useUrlFlash();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const returnTo = `/trial-users${search}`;
  const selectable = Boolean(data && (data.can_message || data.can_block));

  const finish = () => {
    clearSelection();
    reload();
  };

  const runOp = async (op: TrialOp, ids: number[], question: string, tone: OpMeta["tone"]) => {
    const meta = OPS[op];
    const post = async (typed?: string, ask?: Ask) => {
      await run(BULK_PATH, { action: op, ids, return_to: returnTo, ...(typed ? { reason: typed } : {}) }, { ask, refresh: finish });
    };
    if (op === "message") {
      setReason({ title: "پیام به کاربران تست", message: question, confirmLabel: meta.confirmLabel, reasonLabel: "متن پیام", tone, maxLength: MESSAGE_MAX, rows: 5, placeholder: "متن پیام…", onConfirm: (typed) => post(typed) });
    } else {
      await post(undefined, { title: question, confirmLabel: meta.confirmLabel, tone });
    }
  };

  const eligible = (op: TrialOp) => rows.filter((row) => selected.has(row.user_id) && row.ops.includes(op)).map((row) => row.user_id);

  const settings = data?.settings_href ? (
    <Button variant="outline" className="!h-12 !rounded-lg" aria-label="تنظیمات و محدودیت اکانت تست" onPress={() => window.location.assign(data.settings_href ?? "/home")}>
      <Icon name="solar:settings-linear" size={20} />
      تنظیمات
    </Button>
  ) : null;

  return (
    <>
      <PageHeader icon="solar:gift-bold" tone="green" title="کاربران تست" description="مشتریانی که تست رایگان گرفته‌اند و اینکه خرید کرده‌اند یا نه" actions={settings} />
      {trial.status === "error" && !data ? (
        <ErrorBlock message={trial.message} onRetry={reload} />
      ) : !data ? (
        <GlassSection>
          <LoadingBlock rows={6} />
        </GlassSection>
      ) : (
        <div className="pb-20">
          <SectionTabs label="بازاریابی و وفاداری" items={data.marketing_tabs} active="trial_users" />
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FilterButton active={data.filter === "all"} onPress={() => update({ filter: null, before: null })}>
              <StatTile icon="solar:test-tube-bold" tone="purple" label="تست گرفته‌اند" value={fa(data.summary.trials)} />
            </FilterButton>
            <FilterButton active={data.filter === "non_buyers"} onPress={() => update({ filter: "non_buyers", before: null })}>
              <StatTile icon="solar:clock-circle-bold" tone="orange" label="بدون خرید" value={fa(data.summary.non_buyers)} />
            </FilterButton>
            <FilterButton active={data.filter === "buyers"} onPress={() => update({ filter: "buyers", before: null })}>
              <StatTile icon="solar:check-circle-bold" tone="green" label={`خریدار (${fa(data.summary.conversion_percent)}٪)`} value={fa(data.summary.buyers)} />
            </FilterButton>
          </div>

          <GlassSection>
            <Tabs selectedKey={data.filter} onSelectionChange={(key) => update({ filter: key === "all" ? null : String(key), before: null })}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="فیلتر کاربران تست">
                  {data.filters.map((item) => (
                    <Tabs.Tab key={item.key} id={item.key}>
                      {item.label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
            <TrialSearch key={data.q} q={data.q} onSearch={(text) => update({ q: text || null, before: null })} />
            {rows.length === 0 ? (
              <EmptyBlock icon="solar:test-tube-linear" title={data.q || data.filter !== "all" ? "موردی با این فیلتر پیدا نشد." : "هنوز کسی تست رایگان نگرفته است."} />
            ) : (
              <>
                <p className="num text-xs text-muted">{fa(rows.length)} کاربر</p>
                <TrialTable data={data} selectable={selectable} selected={selected} onSelect={setSelected} onOp={(row, op) => void runOp(op, [row.user_id], ONE_QUESTION[op], OPS[op].tone)} />
              </>
            )}
            {data.next_before || query.get("before") ? (
              <nav aria-label="صفحه‌بندی کاربران تست" className="flex items-center justify-end gap-2">
                {query.get("before") ? (
                  <Button variant="outline" size="sm" className="!rounded-lg" onPress={() => update({ before: null })}>
                    از ابتدا
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" className="!rounded-lg" isDisabled={!data.next_before} onPress={() => update({ before: String(data.next_before) })}>
                  بعدی
                </Button>
              </nav>
            ) : null}
          </GlassSection>
        </div>
      )}
      <SelectionBar
        selectedCount={selected.size}
        items={OP_ORDER.map((op) => ({ key: op, label: OPS[op].label, count: eligible(op).length }))}
        onRun={(key) => {
          const op = key as TrialOp;
          const ids = eligible(op);
          if (ids.length) void runOp(op, ids, OPS[op].question.replace(/\{n\}/g, fa(ids.length)), OPS[op].tone);
        }}
        onClear={clearSelection}
      />
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </>
  );
}

export function TrialUsersPage() {
  return (
    <PanelShell title="کاربران تست">
      <TrialContent />
    </PanelShell>
  );
}
