"use client";

import { Button, toast, type Selection } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, takeFlash } from "../../core/actions";
import { useJson, useQuery, useUrlFlash } from "../../core/data";
import { fa, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { BulkBar, PagerBar, SearchBar, type BulkButton } from "../../ui/Data";
import { SelectInput } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { SectionTabs } from "../../ui/SectionTabs";
import { EmptyBlock, Loadable, Notice } from "../../ui/States";
import { ColorTagDialog } from "./ColorTagDialog";
import { CreateDialog } from "./CreateDialogs";
import type { ChildPricingLink } from "./childPricingTypes";
import { RESELLER_TABS } from "./labels";
import { legacyEditTarget } from "./legacyEdit";
import { ReasonDialog, type ReasonRequest } from "./ReasonDialog";
import { ResellersTable, type RowHandlers } from "./ResellersTable";
import { OwnerCards } from "./SettingsCards";
import type { ResellerList, ResellerRow } from "./types";

const LIST_PATH = "/api/panel/resellers";
const BULK_URL = "/resellers/bulk-action";
const CHILD_PRICING_PATH = "/resellers/children-pricing";
const NO_COLOR = "";

function listPath(q: string, color: string, page: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (color) params.set("color", color);
  if (page) params.set("page", page);
  const query = params.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}

/** A page opened as `/resellers?edit=7` (a handler's old redirect) continues on the edit page. */
function useLegacyEditRedirect(): void {
  useEffect(() => {
    const target = legacyEditTarget(window.location.search);
    if (target) window.location.replace(target);
  }, []);
}

function useStashedFlash(): void {
  useEffect(() => {
    const message = takeFlash();
    if (message) toast.success(message);
  }, []);
}

function deleteShopRequest(row: ResellerRow, refresh: () => void): ReasonRequest {
  return {
    title: "حذف نمایندگی (+ ادمین پاسارگارد)",
    text: "نمایندگی حذف شود؟ ادمین پاسارگارد متصل هم حذف می‌شود و علت برای کاربر ارسال می‌گردد. حساب بات، سفارش‌ها و کیف پول کاربر باقی می‌ماند مگر «حذف کاربر» را بزنید.",
    reasonLabel: "علت حذف نمایندگی",
    confirmLabel: "حذف نمایندگی و ادمین",
    onConfirm: (reason) => run(`/resellers/${row.user_id}/delete`, { reason }, { refresh }),
  };
}

function deleteUserRequest(row: ResellerRow, refresh: () => void): ReasonRequest {
  const wallet = row.wallet_balance ?? 0;
  const warning = wallet > 0 ? `هشدار: موجودی کیف پول ${toman(wallet)} از بین می‌رود. ` : "";
  return {
    title: "حذف کامل (+ ادمین پاسارگارد)",
    text: `${warning}کاربر، نمایندگی، ادمین پاسارگارد، تمام سفارش‌ها، سرویس‌ها و پرداخت‌ها کامل حذف شوند؟ برگشت‌ناپذیر است. توجه: اگر دوباره به ربات پیام بدهد، حساب جدید (خالی) برای همان تلگرام ساخته می‌شود.`,
    reasonLabel: "علت حذف کامل کاربر",
    confirmLabel: "حذف کامل",
    onConfirm: (reason) => run(`/resellers/${row.user_id}/delete-user`, { reason }, { refresh }),
  };
}

type BulkKey = "grant_miniapp" | "delete_reseller" | "delete_user";

const BULK_LABELS: Record<BulkKey, string> = { grant_miniapp: "دادن دسترسی مینی‌اپ", delete_reseller: "حذف نمایندگی", delete_user: "حذف کاربر" };

function bulkReasonRequest(key: Exclude<BulkKey, "grant_miniapp">, ids: number[], done: () => void): ReasonRequest {
  const n = fa(ids.length);
  const post = (reason: string) => run(BULK_URL, { action: key, ids, return_to: "/resellers", reason }, { refresh: done });
  return key === "delete_reseller"
    ? { title: "حذف نمایندگی گروهی", text: `${n} نمایندگی حذف شوند؟ ادمین پاسارگارد متصل هم حذف می‌شود.`, reasonLabel: "علت حذف نمایندگی", confirmLabel: "حذف نمایندگی", onConfirm: post }
    : { title: "حذف کامل گروهی", text: `${n} کاربر کامل حذف شوند؟ برگشت‌ناپذیر است.`, reasonLabel: "علت حذف کامل", confirmLabel: "حذف کامل", onConfirm: post };
}

function grantMiniapp(ids: number[], done: () => void): Promise<unknown> {
  return run(
    BULK_URL,
    { action: "grant_miniapp", ids, return_to: "/resellers" },
    {
      ask: {
        title: "دادن دسترسی مینی‌اپ",
        text: `به ${fa(ids.length)} نماینده دسترسی «مینی‌اپ فروشگاه برای مشتریان» داده شود؟ نماینده‌ای که دسترسی‌هایش عمداً خالی است تغییر نمی‌کند و مینی‌اپ تا وقتی خود نماینده روشنش نکند باز نمی‌شود.`,
        confirmLabel: "دادن دسترسی",
      },
      refresh: done,
    },
  );
}

function selectedIds(keys: Selection, rows: ResellerRow[]): number[] {
  const present = new Set(rows.map((row) => row.user_id));
  if (keys === "all") return [...present];
  return [...keys].map(Number).filter((id) => present.has(id));
}

function ColorFilter({ data, value, onChange }: { data: ResellerList; value: string; onChange: (color: string) => void }) {
  return (
    <SelectInput
      label="فیلتر تگ ریسک"
      value={value}
      onChange={onChange}
      className="w-full sm:w-48"
      options={[{ id: NO_COLOR, label: "همه تگ‌ها" }, ...data.color_tags.map((tag) => ({ id: tag.key, label: tag.title }))]}
    />
  );
}

function ListSection({ data, reload, onTag }: { data: ResellerList; reload: () => void; onTag: (row: ResellerRow) => void }) {
  const query = useQuery();
  const [keys, setKeys] = useState<Selection>(new Set());
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  const ids = useMemo(() => selectedIds(keys, data.rows), [keys, data.rows]);
  const done = () => {
    setKeys(new Set());
    reload();
  };

  const handlers: RowHandlers = {
    onEdit: (row) => window.location.assign(`/resellers/${row.user_id}/edit`),
    onTag,
    onDeleteShop: (row) => setReason(deleteShopRequest(row, done)),
    onDeleteUser: (row) => setReason(deleteUserRequest(row, done)),
  };

  const bulkButtons: BulkButton[] = (["grant_miniapp", "delete_reseller", "delete_user"] as const).map((key) => ({
    op: key,
    label: BULK_LABELS[key],
    count: ids.length,
    danger: key !== "grant_miniapp",
    onPress: () => (key === "grant_miniapp" ? void grantMiniapp(ids, done) : setReason(bulkReasonRequest(key, ids, done))),
  }));

  return (
    <GlassSection title="لیست نمایندگان" description={`${fa(data.pager.total ?? data.rows.length)} نماینده`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <SearchBar value={data.q} placeholder="نام، تلگرام، وب، ربات…" onSearch={(q) => query.set({ q, page: null })} />
        </div>
        {data.color_tags.length ? <ColorFilter data={data} value={data.color} onChange={(color) => query.set({ color, page: null })} /> : null}
      </div>
      {data.rows.length ? (
        <>
          <ResellersTable rows={data.rows} ownerView={data.owner_view} selected={keys} onSelect={setKeys} handlers={handlers} />
          <PagerBar pager={data.pager} noun="نماینده" onPage={(page) => query.set({ page: page > 1 ? String(page) : null })} />
        </>
      ) : (
        <EmptyBlock icon="solar:users-group-rounded-linear" title="نماینده‌ای نیست" description={data.q || data.color ? "برای این جستجو یا فیلتر نماینده‌ای پیدا نشد." : undefined} />
      )}
      {data.owner_view ? <BulkBar selected={ids.length} buttons={bulkButtons} onClear={() => setKeys(new Set())} label="عملیات گروهی نمایندگان" /> : null}
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </GlassSection>
  );
}

function OversoldNotice({ ids }: { ids: number[] }) {
  if (!ids.length) return null;
  return (
    <div className="mb-6">
      <Notice tone="warning" title="نمایندگانی که تخصیص حجمشان از سقف بیشتر است">
        {ids.map((id, index) => (
          <span key={id}>
            {index ? "، " : ""}
            <a className="font-medium underline" href={`/resellers/${id}/edit`}>
              #{fa(id)}
            </a>
          </span>
        ))}
      </Notice>
    </div>
  );
}

function Content({ data, reload }: { data: ResellerList & ChildPricingLink; reload: () => void }) {
  const [creating, setCreating] = useState(false);
  const [tagTarget, setTagTarget] = useState<ResellerRow | null>(null);
  return (
    <>
      <PageHeader
        icon="solar:users-group-rounded-bold"
        tone="blue"
        title={data.owner_view ? "نمایندگان" : "نمایندگان من"}
        description={data.owner_view ? "فروشگاه‌های نماینده، ظرفیت و دسترسی‌هایشان" : "نمایندگانی که زیر مجموعهٔ شما هستند"}
        actions={
          <>
            {data.can_price_children ? (
              <Button variant="outline" className="!h-12 !rounded-lg px-6 text-sm" onPress={() => window.location.assign(CHILD_PRICING_PATH)}>
                <Icon name="solar:tag-price-bold" size={20} />
                قیمت و اعتبار زیرمجموعه
              </Button>
            ) : null}
            <Button className="button--ink !h-12 !rounded-lg px-6 text-sm" onPress={() => setCreating(true)}>
              <Icon name="solar:add-circle-linear" size={20} />
              افزودن نماینده
            </Button>
          </>
        }
      />
      {data.owner_view ? <SectionTabs label="نمایندگی" items={RESELLER_TABS} active="list" /> : null}
      {data.owner_view ? <OwnerCards onChanged={reload} /> : null}
      <OversoldNotice ids={data.owner_view ? data.oversold_ids : []} />
      <ListSection data={data} reload={reload} onTag={setTagTarget} />
      <CreateDialog open={creating} onClose={() => setCreating(false)} onDone={reload} />
      <ColorTagDialog userId={tagTarget?.user_id ?? null} name={tagTarget?.name ?? ""} onClose={() => setTagTarget(null)} onDone={reload} />
    </>
  );
}

function Body() {
  const query = useQuery();
  useLegacyEditRedirect();
  useUrlFlash();
  useStashedFlash();
  const state = useJson<ResellerList & ChildPricingLink>(listPath(query.get("q"), query.get("color"), query.get("page")), { keepPrevious: true });
  return <Loadable state={state}>{(data) => <Content data={data} reload={state.reload} />}</Loadable>;
}

export function ResellersPage() {
  return (
    <PanelShell title="نمایندگان">
      <Body />
    </PanelShell>
  );
}
