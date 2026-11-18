"use client";

import { Button, Input, ListBox, Select, Tabs, toast } from "@heroui/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { run, type Ask } from "../../core/actions";
import { FALLBACK_ERROR, panelAction } from "../../core/api";
import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../ui/States";
import { BULK_META, BULK_ORDER, eligibleIds, fill, FILTER_LABELS, FILTER_ORDER, isSubscriptionLink, LINK_SEARCH_PATH, money, samePath } from "./format";
import { ReasonDialog, type ReasonRequest } from "./ReasonDialog";
import { SelectionBar } from "./SelectionBar";
import type { BulkOp, UserRow, UsersFilter, UsersList } from "./types";
import { BulkMessageDialog, CreateUserDialog, MessageDialog, type ListReturn } from "./UserDialogs";
import { UserCardModal, type MessageTarget } from "./UserCardModal";
import { useSelection } from "./useSelection";
import { UsersTable, type RowAction } from "./UsersTable";

const ALL_TAGS = "all";
const LIST_PARAMS = ["q", "filter", "color", "uid"] as const;

function listPath(read: (key: string) => string): string {
  const query = new URLSearchParams();
  for (const key of LIST_PARAMS) {
    const value = read(key);
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return `/api/panel/users${text ? `?${text}` : ""}`;
}

function StatButton({ active, onPress, children }: { active: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onPress} aria-pressed={active} className={`rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-focus ${active ? "ring-2 ring-accent" : ""}`}>
      {children}
    </button>
  );
}

/** Keyed by the applied search, so a new address starts the box from that text. */
function SearchBar({ q, color, tags, onSearch, onColor }: { q: string; color: string; tags: UsersList["color_tags"]; onSearch: (text: string) => void; onColor: (key: string) => void }) {
  const [text, setText] = useState(q);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(text.trim());
  };
  return (
    <form onSubmit={submit} role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Icon name="solar:magnifer-linear" size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input aria-label="جستجوی کاربران" value={text} onChange={(event) => setText(event.target.value)} placeholder="نام، تلگرام، نقش…" autoComplete="off" fullWidth className="!ps-9" />
      </div>
      <Button type="submit" variant="outline" className="!h-10 !rounded-lg">
        جستجو
      </Button>
      {tags.length ? (
        <Select aria-label="فیلتر تگ ریسک" value={color || ALL_TAGS} onChange={(key) => onColor(key === ALL_TAGS || key === null ? "" : String(key))} variant="secondary" className="w-44">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id={ALL_TAGS} textValue="همه تگ‌ها">
                همه تگ‌ها
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {tags.map((tag) => (
                <ListBox.Item key={tag.key} id={tag.key} textValue={tag.title}>
                  {tag.title}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ) : null}
    </form>
  );
}

export function UsersContent() {
  const { search } = useLocation();
  const query = useQuery();
  const update = query.set;
  // The server answers with the customer's row, or the same «not found» for every miss.
  const findByLink = async (link: string) => {
    try {
      const next = samePath((await panelAction(LINK_SEARCH_PATH, { link })).location);
      if (next) window.location.assign(next);
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : FALLBACK_ERROR);
    }
  };
  const list = useJson<UsersList>(listPath(query.get));
  const { data, reload } = list;
  const { selected, select: setSelected, clear: clearSelection } = useSelection(search);
  const [cardId, setCardId] = useState<number | null>(null);
  const [message, setMessage] = useState<MessageTarget | null>(null);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reason, setReason] = useState<ReasonRequest | null>(null);

  // A link from another screen: ?edit=<id> opens that customer's edit screen and carries ?ok= / ?err=
  // along; any other message the server left in the address is shown once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const edit = params.get("edit");
    if (!edit || !/^\d{1,12}$/.test(edit)) return;
    const carry = new URLSearchParams();
    for (const key of ["ok", "err"]) {
      const value = params.get(key);
      if (value) carry.set(key, value);
    }
    window.location.replace(`/users/${edit}/edit${carry.size ? `?${carry}` : ""}`);
  }, []);
  useUrlFlash();

  const filter: UsersFilter = data?.filter ?? "all";
  const listReturn: ListReturn = useMemo(() => ({ filter, q: data?.q ?? "" }), [filter, data?.q]);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const returnTo = `/users${search}`;

  const refresh = () => {
    clearSelection();
    reload();
  };

  const returnFields = { return_filter: listReturn.filter, ...(listReturn.q ? { return_q: listReturn.q } : {}) };

  const rowAction = async (row: UserRow, action: RowAction) => {
    if (action === "message") setMessage({ id: row.id, name: row.message_name });
    else if (action === "edit") window.location.assign(`/users/${row.id}/edit`);
    else if (action === "renew") {
      setReason({
        title: "تمدید سرویس",
        message: "سرویس بحرانی (نزدیک‌ترین انقضا) با پلن فعلی تمدید شود؟ مصرف ریست می‌شود.",
        confirmLabel: "تمدید",
        reasonLabel: "علت تمدید",
        onConfirm: async (text) => {
          await run(`/users/${row.id}/quick-renew`, { ...returnFields, reason: text }, { success: "سرویس تمدید شد", refresh });
        },
      });
    } else if (action === "block") {
      await run(`/users/${row.id}/block`, {}, {
        ask: {
          title: row.is_blocked ? "مسدودیت این کاربر برداشته شود؟ پیام برای کاربر ارسال می‌شود." : "این کاربر مسدود شود؟ پیام برای کاربر ارسال می‌شود.",
          confirmLabel: row.is_blocked ? "رفع مسدودی" : "مسدود کردن",
          tone: row.is_blocked ? "accent" : "warning",
        },
        success: "وضعیت مسدودی تغییر کرد",
        refresh,
      });
    } else if (action === "delete") {
      const warn = row.wallet_balance > 0 ? `هشدار: موجودی کیف پول این کاربر ${money(row.wallet_balance)} تومان است و با حذف از بین می‌رود. ` : "";
      setReason({
        title: "تأیید حذف کاربر",
        message: `${warn}کاربر و تمام سفارش‌ها، سرویس‌ها، پرداخت‌ها و تیکت‌های مرتبط کامل حذف شوند؟ این عمل برگشت‌ناپذیر است. توجه: اگر دوباره به ربات پیام بدهد، حساب جدید (خالی) برای همان تلگرام ساخته می‌شود.`,
        confirmLabel: "حذف کاربر",
        reasonLabel: "علت حذف",
        tone: "danger",
        onConfirm: async (text) => {
          await run(`/users/${row.id}/delete`, { reason: text, confirm_reason: text }, { success: "کاربر حذف شد", refresh });
        },
      });
    }
  };

  const bulk = async (op: BulkOp) => {
    const ids = eligibleIds(rows, selected, op);
    if (ids.length === 0) return;
    const meta = BULK_META[op];
    const question = fill(meta.message, ids.length);
    const post = async (text?: string, ask?: Ask) => {
      await run("/users/bulk-action", { action: op, ids, return_to: returnTo, ...(text ? { reason: text, confirm_reason: text } : {}) }, { ask, refresh });
    };
    if (meta.reasonLabel) {
      setReason({ title: meta.title, message: question, confirmLabel: meta.confirmLabel, reasonLabel: meta.reasonLabel, tone: meta.tone, onConfirm: (text) => post(text) });
    } else {
      await post(undefined, { title: question, confirmLabel: meta.confirmLabel, tone: meta.tone });
    }
  };

  const bulkCount = filter !== "all" ? rows.length : 0;
  const can = data?.can;

  const actions = can ? (
    <>
      {bulkCount > 0 ? (
        <Button variant="outline" className="!h-12 !rounded-lg" onPress={() => setBulkMessageOpen(true)}>
          پیام گروهی ({fa(bulkCount)})
        </Button>
      ) : null}
      {can.provision ? (
        <Button className="button--ink !h-12 !rounded-lg" onPress={() => setCreateOpen(true)}>
          <Icon name="solar:user-plus-linear" size={20} />
          کاربر جدید
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <>
      <PageHeader icon="solar:users-group-rounded-bold" title="کاربران بات" description="مشتریان فروشگاه، سرویس‌ها و کیف پول آن‌ها" actions={actions} />
      {list.status === "error" && !data ? (
        <ErrorBlock message={list.message} onRetry={reload} />
      ) : !data ? (
        <GlassSection>
          <LoadingBlock rows={6} />
        </GlassSection>
      ) : (
        <div className="flex flex-col gap-6 pb-20">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatButton active={filter === "expiring"} onPress={() => update({ filter: "expiring" })}>
              <StatTile icon="solar:clock-circle-bold" tone="orange" label="نزدیک انقضا" value={fa(data.counts.expiring)} />
            </StatButton>
            <StatButton active={filter === "low_volume"} onPress={() => update({ filter: "low_volume" })}>
              <StatTile icon="solar:graph-down-bold" tone="yellow" label="حجم کم" value={fa(data.counts.low_volume)} />
            </StatButton>
            <StatButton active={filter === "alerts"} onPress={() => update({ filter: "alerts" })}>
              <StatTile icon="solar:bell-bold" tone="red" label="دارای اعلان" value={fa(data.counts.alerts)} />
            </StatButton>
          </div>

          <GlassSection>
            <Tabs selectedKey={filter} onSelectionChange={(key) => update({ filter: key === "all" ? null : String(key) })}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="فیلتر کاربران">
                  {FILTER_ORDER.map((key) => (
                    <Tabs.Tab key={key} id={key}>
                      {FILTER_LABELS[key]}
                      {key === "all" ? ` (${fa(data.counts.total)})` : ""}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
            <SearchBar key={data.q} q={data.q} color={data.color} tags={data.color_tags} onSearch={(text) => (isSubscriptionLink(text) ? void findByLink(text) : update({ q: text || null, uid: null }))} onColor={(key) => update({ color: key || null })} />
            {rows.length === 0 ? (
              <EmptyBlock icon="solar:users-group-rounded-linear" title="کاربری نیست" description={data.q || data.color || filter !== "all" ? "با این فیلتر کاربری پیدا نشد." : "هنوز کاربری ثبت نشده است."} />
            ) : (
              <>
                <p className="num text-xs text-muted">{fa(rows.length)} کاربر</p>
                <UsersTable rows={rows} can={data.can} focusUid={data.focus_uid} selected={selected} onSelect={setSelected} onOpenCard={setCardId} onRowAction={(row, action) => void rowAction(row, action)} />
              </>
            )}
          </GlassSection>
        </div>
      )}

      <SelectionBar
        selectedCount={selected.size}
        items={BULK_ORDER.map((op) => ({ key: op, label: BULK_META[op].label, count: eligibleIds(rows, selected, op).length, danger: op === "delete" }))}
        onRun={(op) => void bulk(op as BulkOp)}
        onClear={clearSelection}
      />
      <UserCardModal userId={cardId} page="users" onClose={() => setCardId(null)} onMessage={setMessage} />
      <MessageDialog target={message} listReturn={listReturn} onClose={() => setMessage(null)} onDone={refresh} />
      <BulkMessageDialog open={bulkMessageOpen} count={bulkCount} listReturn={listReturn} onClose={() => setBulkMessageOpen(false)} onDone={refresh} />
      <CreateUserDialog
        open={createOpen}
        tags={data?.color_tags ?? []}
        listReturn={listReturn}
        onClose={() => setCreateOpen(false)}
        onDone={(editId) => {
          if (editId) window.location.assign(`/users/${editId}/edit`);
          else refresh();
        }}
      />
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </>
  );
}

export function UsersPage() {
  return (
    <PanelShell title="کاربران بات">
      <UsersContent />
    </PanelShell>
  );
}
