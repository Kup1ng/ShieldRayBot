"use client";

import { followLocation, run, stashFlash } from "../../core/actions";
import { fa } from "../../core/format";
import { StatusChip } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { formatDays, formatGb, formatPackAmount } from "./format";
import type { PackDraft } from "./PlanForms";
import { ActiveChip, BulkBar, RowActions, SelectableTable, type BulkOp, type Column, type RowAction } from "./Tables";
import type { PackRow, PlanRow, PlansOverview } from "./types";
import { useBulk } from "./useBulk";

export type SpecialKind = "trial" | "custom" | "wholesale";

type Row = { id: number; plan?: PlanRow; special?: SpecialKind };

const SPECIAL_IDS: Record<SpecialKind, number> = { trial: -1, custom: -2, wholesale: -3 };

const PLAN_BULK: BulkOp[] = [
  { key: "toggle", label: "روشن/خاموش", confirmMessage: (n) => `وضعیت ${n.toLocaleString("fa-IR")} پلن تغییر کند؟`, confirmTitle: "تغییر وضعیت گروهی", confirmLabel: "اعمال" },
  { key: "delete", label: "حذف", danger: true, confirmMessage: (n) => `${n.toLocaleString("fa-IR")} پلن حذف شوند؟`, confirmTitle: "حذف گروهی", confirmLabel: "حذف" },
];

const COLUMNS: Column[] = [
  { id: "name", label: "نام", rowHeader: true },
  { id: "category", label: "برچسب" },
  { id: "price", label: "قیمت" },
  { id: "duration", label: "مدت" },
  { id: "volume", label: "حجم" },
  { id: "source", label: "منبع پاسارگارد" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

const PACK_COLUMNS: Column[] = [
  { id: "name", label: "نام", rowHeader: true },
  { id: "category", label: "برچسب" },
  { id: "kind", label: "نوع" },
  { id: "amount", label: "مقدار" },
  { id: "price", label: "قیمت" },
  { id: "status", label: "وضعیت" },
  { id: "actions", label: <span className="sr-only">عملیات</span> },
];

function Dash() {
  return <span className="text-muted">—</span>;
}

function Warnings({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1">{children}</div>;
}

function SourceCell({ plan }: { plan: PlanRow }) {
  if (plan.pg_template_id) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <bdi className="num">تمپلیت #{plan.pg_template_id}</bdi>
        {plan.template_missing ? <StatusChip color="warning">خالی</StatusChip> : null}
      </span>
    );
  }
  return plan.pg_group_ids ? <bdi className="num">گروه {plan.pg_group_ids}</bdi> : <Dash />;
}

export function UserPlansSection({ data, reload, onSetting, onEditPack }: { data: PlansOverview; reload: () => void; onSetting: (kind: SpecialKind) => void; onEditPack: (draft: PackDraft) => void }) {
  const rows: Row[] = [
    ...data.plans.map((plan) => ({ id: plan.id, plan })),
    ...(["trial", "custom", "wholesale"] as SpecialKind[]).map((special) => ({ id: SPECIAL_IDS[special], special })),
  ];
  const bulk = useBulk("/plans/bulk-action", "/plans", data.plans.map((p) => p.id), reload);

  const act = async (path: string, text?: string) => {
    await run(path, {}, { success: text });
    reload();
  };

  const planActions = (plan: PlanRow): RowAction[] => [
    { id: "edit", label: "ویرایش", icon: "solar:pen-linear", run: () => window.location.assign(`/plans/${plan.id}/edit`) },
    {
      id: "clone",
      label: "کپی",
      icon: "solar:copy-linear",
      confirmText: { message: "یک کپی خاموش از این پلن ساخته شود؟", description: "کپی پلن", confirmLabel: "کپی" },
      run: async () => {
        const result = await run(`/plans/${plan.id}/clone`, {}, { success: "کپی پلن ساخته شد" });
        if (result?.ok) {
          stashFlash(result.message);
          followLocation(result.location);
        } else reload();
      },
    },
    { id: "toggle", label: plan.is_active ? "خاموش‌کردن" : "روشن‌کردن", icon: "solar:power-linear", run: () => act(`/plans/${plan.id}/toggle`) },
    {
      id: "delete",
      label: "حذف",
      icon: "solar:trash-bin-trash-linear",
      tone: "danger",
      confirmText: { message: "حذف پلن از فروشگاه؟", description: "تأیید حذف پلن", confirmLabel: "حذف پلن" },
      run: () => act(`/plans/${plan.id}/delete`, "پلن حذف شد"),
    },
  ];

  const settingAction = (kind: SpecialKind): RowAction[] => [{ id: "setting", label: "تنظیم", icon: "solar:settings-bold", run: () => onSetting(kind) }];

  const cells = (row: Row) => {
    if (row.plan) {
      const p = row.plan;
      const incomplete = p.template_missing || p.source_empty;
      return [
        <span key="n" className="flex flex-col gap-1">
          <bdi className="font-medium text-foreground">{p.name}</bdi>
          {incomplete || p.limit_issue ? (
            <Warnings>
              {p.limit_issue ? <StatusChip color="warning">خارج از سقف</StatusChip> : null}
              {incomplete ? <StatusChip color="warning">منبع ناقص</StatusChip> : null}
            </Warnings>
          ) : null}
        </span>,
        p.category_name ? <bdi key="c">{p.category_name}</bdi> : <Dash key="c" />,
        <bdi key="p" className="num">{fa(p.price)} <span className="text-xs text-muted">تومان</span></bdi>,
        formatDays(p.duration_days),
        formatGb(p.data_limit_gb),
        <SourceCell key="s" plan={p} />,
        <span key="st" className="flex flex-col items-start gap-1">
          <ActiveChip active={p.is_active} />
          {p.limit_issue ? <span className="max-w-[18ch] text-xs text-muted">{p.limit_issue}</span> : null}
        </span>,
        <RowActions key="a" label={`عملیات پلن ${p.name}`} actions={planActions(p)} />,
      ];
    }
    if (row.special === "trial") {
      const t = data.trial;
      return [
        <span key="n" className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            پلن تست{t.exists ? <> — <bdi>{t.name}</bdi></> : null}
          </span>
          {t.limit_issue ? <StatusChip color="warning">خارج از سقف</StatusChip> : null}
        </span>,
        <Dash key="c" />,
        "رایگان",
        t.exists ? formatDays(t.duration_days) : <Dash key="d" />,
        t.exists ? formatGb(t.data_limit_gb) : <Dash key="v" />,
        t.pg_template_id ? <bdi key="s" className="num">تمپلیت #{t.pg_template_id}</bdi> : t.pg_group_ids.length ? <bdi key="s" className="num">گروه {t.pg_group_ids.join(",")}</bdi> : <Dash key="s" />,
        <span key="st" className="flex flex-col items-start gap-1">
          <ActiveChip active={t.enabled} />
          {t.limit_issue ? <span className="max-w-[18ch] text-xs text-muted">{t.limit_issue}</span> : null}
        </span>,
        <RowActions key="a" label="عملیات پلن تست" actions={settingAction("trial")} />,
      ];
    }
    if (row.special === "custom") {
      const c = data.custom;
      return [
        <span key="n" className="flex flex-col gap-1">
          <span className="font-medium text-foreground">پلن دلخواه</span>
          {c.limit_issue ? <StatusChip color="warning">خارج از سقف</StatusChip> : null}
        </span>,
        <Dash key="c" />,
        "هر گیگ / روز",
        <bdi key="d" className="num">{c.min_days}–{c.max_days} روز</bdi>,
        <bdi key="v" className="num">{c.min_gb}–{c.max_gb} گیگ</bdi>,
        c.template_id ? <bdi key="s" className="num">تمپلیت #{c.template_id}</bdi> : c.group_ids.length ? <bdi key="s" className="num">گروه {c.group_ids.join(",")}</bdi> : <Dash key="s" />,
        <span key="st" className="flex flex-col items-start gap-1">
          <ActiveChip active={c.enabled} />
          {c.limit_issue ? <span className="max-w-[18ch] text-xs text-muted">{c.limit_issue}</span> : null}
        </span>,
        <RowActions key="a" label="عملیات پلن دلخواه" actions={settingAction("custom")} />,
      ];
    }
    const w = data.wholesale;
    return [
      <span key="n" className="font-medium text-foreground">فروش عمده</span>,
      <Dash key="c" />,
      "تخفیف پلکانی",
      <Dash key="d" />,
      <bdi key="v" className="num">{w.min_qty}–{w.max_qty} عدد</bdi>,
      <Dash key="s" />,
      <ActiveChip key="st" active={w.enabled} />,
      <RowActions key="a" label="عملیات فروش عمده" actions={settingAction("wholesale")} />,
    ];
  };

  return (
    <div className="flex flex-col gap-6">
      <GlassSection title="پلن‌های کاربران" description={`${fa(data.plans.length + 3)} پلن`}>
        <SelectableTable
          ariaLabel="پلن‌های کاربران"
          columns={COLUMNS}
          rows={rows}
          rowId={(r) => r.id}
          cells={cells}
          empty="پلن ثابتی نیست — از «افزودن پلن» بسازید."
          selected={bulk.selected}
          onSelectedChange={bulk.setSelected}
          unselectable={(r) => !r.plan}
          minWidth={860}
        />
        <BulkBar count={bulk.count} ops={PLAN_BULK} busy={bulk.busy} onRun={(op) => void bulk.run(op)} onClear={bulk.clear} />
      </GlassSection>
      <AddonPacksSection packs={data.addon_packs} reload={reload} onEdit={onEditPack} />
    </div>
  );
}

function AddonPacksSection({ packs, reload, onEdit }: { packs: PackRow[]; reload: () => void; onEdit: (draft: PackDraft) => void }) {
  const toDraft = (a: PackRow): PackDraft => ({ id: a.id, name: a.name, kind: a.kind, category: a.category_id ? String(a.category_id) : "", amount: String(a.amount), price: String(a.price), sort: String(a.sort_order), description: a.description });
  const actions = (a: PackRow): RowAction[] => [
    { id: "edit", label: "ویرایش", icon: "solar:pen-linear", run: () => onEdit(toDraft(a)) },
    {
      id: "toggle",
      label: a.is_active ? "خاموش‌کردن" : "روشن‌کردن",
      icon: "solar:power-linear",
      run: async () => {
        await run(`/plans/addons/${a.id}/toggle`);
        reload();
      },
    },
    {
      id: "delete",
      label: "حذف",
      icon: "solar:trash-bin-trash-linear",
      tone: "danger",
      confirmText: { message: "این بسته حذف شود؟", description: "حذف بسته افزونه", confirmLabel: "حذف" },
      run: async () => {
        await run(`/plans/addons/${a.id}/delete`, {}, { success: "بسته حذف شد" });
        reload();
      },
    },
  ];
  return (
    <GlassSection title="بسته‌های حجم / زمان" description={`فقط از کارت سرویس در ربات یا مینی‌اپ خریداری می‌شود. برای قیمت جدا، برچسب دسته را با پلن همان سرویس یکی بگذارید. (${fa(packs.length)} بسته)`}>
      <div id="user-service-addons" />
      <SelectableTable
        ariaLabel="بسته‌های حجم و زمان"
        columns={PACK_COLUMNS}
        rows={packs}
        rowId={(a) => a.id}
        empty="هنوز بسته‌ای نیست — از «افزودن پلن» با نوع بسته حجم یا زمان بسازید."
        cells={(a) => [
          <span key="n" className="flex flex-col">
            <bdi className="font-medium text-foreground">{a.name}</bdi>
            {a.description ? <bdi className="text-xs text-muted">{a.description}</bdi> : null}
          </span>,
          a.is_general ? "عمومی" : a.category_name ? <bdi key="c">{a.category_name}</bdi> : <Dash key="c" />,
          a.kind === "duration" ? "زمان" : "حجم",
          <bdi key="m" className="num">{formatPackAmount(a.kind, a.amount)}</bdi>,
          <bdi key="p" className="num">{fa(a.price)} <span className="text-xs text-muted">تومان</span></bdi>,
          <ActiveChip key="s" active={a.is_active} />,
          <RowActions key="a" label={`عملیات بسته ${a.name}`} actions={actions(a)} />,
        ]}
        minWidth={720}
      />
    </GlassSection>
  );
}

