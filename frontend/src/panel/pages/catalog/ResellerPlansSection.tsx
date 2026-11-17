"use client";

import { StatusChip } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { run } from "../../core/actions";
import { fa } from "../../core/format";
import { Notice } from "../../ui/States";
import { ActiveChip, BulkBar, RowActions, SelectableTable, type BulkOp, type Column, type RowAction } from "./Tables";
import type { ResellerPlanRow } from "./types";
import { useBulk } from "./useBulk";

const BULK: BulkOp[] = [
  { key: "toggle", label: "روشن/خاموش", confirmMessage: (n) => `وضعیت ${n.toLocaleString("fa-IR")} پلن نمایندگی تغییر کند؟`, confirmTitle: "تغییر وضعیت گروهی", confirmLabel: "اعمال" },
  { key: "delete", label: "حذف", danger: true, confirmMessage: (n) => `${n.toLocaleString("fa-IR")} پلن نمایندگی حذف شوند؟`, confirmTitle: "حذف گروهی", confirmLabel: "حذف" },
];

const ACTIONS_COLUMN: Column = { id: "actions", label: <span className="sr-only">عملیات</span> };

function Dash() {
  return <span className="text-muted">—</span>;
}

function PlanName({ plan, showDescription = true }: { plan: ResellerPlanRow; showDescription?: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <bdi className="font-medium text-foreground">{plan.name}</bdi>
        {plan.is_system ? <StatusChip color="default">سیستمی</StatusChip> : null}
      </span>
      {showDescription && plan.description ? <bdi className="text-xs text-muted">{plan.description}</bdi> : null}
    </span>
  );
}

function Price({ value }: { value: number }) {
  return (
    <bdi className="num">
      {fa(value)} <span className="text-xs text-muted">تومان</span>
    </bdi>
  );
}

function ResellerTable({
  title,
  description,
  anchor,
  ariaLabel,
  plans,
  columns,
  cells,
  empty,
  deleteText,
  reload,
}: {
  title: string;
  description?: string;
  anchor: string;
  ariaLabel: string;
  plans: ResellerPlanRow[];
  columns: Column[];
  cells: (plan: ResellerPlanRow) => React.ReactNode[];
  empty: string;
  deleteText: string;
  reload: () => void;
}) {
  const bulk = useBulk("/resellers/plans/bulk-action", "/plans", plans.map((p) => p.id), reload);
  const actions = (plan: ResellerPlanRow): RowAction[] => [
    { id: "edit", label: "ویرایش", icon: "solar:pen-linear", run: () => window.location.assign(`/resellers/plans/${plan.id}/edit`) },
    ...(plan.is_system
      ? []
      : [
          {
            id: "toggle",
            label: plan.is_active ? "خاموش‌کردن" : "روشن‌کردن",
            icon: "solar:power-linear",
            run: async () => {
              await run(`/resellers/plans/${plan.id}/toggle`);
              reload();
            },
          },
          {
            id: "delete",
            label: "حذف",
            icon: "solar:trash-bin-trash-linear",
            tone: "danger" as const,
            confirmText: { message: deleteText, description: "تأیید حذف", confirmLabel: "حذف" },
            run: async () => {
              await run(`/resellers/plans/${plan.id}/delete`, {}, { success: "حذف شد" });
              reload();
            },
          },
        ]),
  ];
  return (
    <GlassSection title={title} description={description ? `${description} (${fa(plans.length)})` : `${fa(plans.length)} مورد`}>
      <div id={anchor} />
      <SelectableTable
        ariaLabel={ariaLabel}
        columns={[...columns, ACTIONS_COLUMN]}
        rows={plans}
        rowId={(p) => p.id}
        cells={(p) => [...cells(p), <RowActions key="a" label={`عملیات ${p.name}`} actions={actions(p)} />]}
        empty={empty}
        selected={bulk.selected}
        onSelectedChange={bulk.setSelected}
        unselectable={(p) => p.is_system}
        minWidth={640}
      />
      <BulkBar count={bulk.count} ops={BULK} busy={bulk.busy} onRun={(op) => void bulk.run(op)} onClear={bulk.clear} />
    </GlassSection>
  );
}

const kindText = (p: ResellerPlanRow) => (p.plan_kind === "addon_users" ? "کاربر" : "حجم");
const amountText = (p: ResellerPlanRow) => (p.plan_kind === "addon_users" ? `+${fa(p.addon_users)} کاربر` : `+${fa(p.addon_gb)} گیگ`);

export function ResellerPlansSection({ plans, error, reload }: { plans: ResellerPlanRow[]; error: string | null; reload: () => void }) {
  const fixed = plans.filter((p) => p.group === "fixed");
  const payg = plans.filter((p) => p.group === "payg");
  const addons = plans.filter((p) => p.group === "addon");
  return (
    <div id="reseller-plans" className="flex flex-col gap-6">
      <p className="text-sm text-muted">اشتراک (ثابت / PAYG) برای ورود نمایندگی؛ بسته‌های حجم/کاربر فقط برای نمایندگانی که قبلاً پلن خریده‌اند.</p>
      {error ? <Notice>{error}</Notice> : null}
      <ResellerTable
        title="اشتراک ثابت"
        anchor="reseller-plans-fixed"
        ariaLabel="پلن‌های اشتراک ثابت نمایندگان"
        plans={fixed}
        columns={[
          { id: "name", label: "نام", rowHeader: true },
          { id: "price", label: "قیمت ورود" },
          { id: "status", label: "وضعیت" },
        ]}
        cells={(p) => [<PlanName key="n" plan={p} />, <Price key="p" value={p.price} />, <ActiveChip key="s" active={p.is_active} />]}
        empty="پلن اشتراک ثابت نیست — از «افزودن پلن» با مخاطب نمایندگان بسازید."
        deleteText="این پلن نمایندگی حذف شود؟"
        reload={reload}
      />
      <ResellerTable
        title="اشتراک PAYG"
        anchor="reseller-plans-payg"
        ariaLabel="پلن‌های PAYG نمایندگان"
        plans={payg}
        columns={[
          { id: "name", label: "نام", rowHeader: true },
          { id: "price", label: "قیمت ورود" },
          { id: "rate", label: "نرخ / گیگ" },
          { id: "groups", label: "گروه‌ها" },
          { id: "status", label: "وضعیت" },
        ]}
        cells={(p) => [
          <PlanName key="n" plan={p} />,
          <Price key="p" value={p.price} />,
          p.price_per_gb ? <Price key="r" value={p.price_per_gb} /> : <Dash key="r" />,
          p.pg_group_ids ? <bdi key="g" className="num">{p.pg_group_ids}</bdi> : <Dash key="g" />,
          <ActiveChip key="s" active={p.is_active} />,
        ]}
        empty="پلن PAYG نیست — از «افزودن پلن» با نوع PAYG بسازید."
        deleteText="این پلن نمایندگی حذف شود؟"
        reload={reload}
      />
      <ResellerTable
        title="بسته‌های حجم / کاربر"
        description="فقط برای نمایندگان با اشتراک فعال. برای قیمت جدا، برچسب دسته را با پلن اشتراک نماینده یکی بگذارید."
        anchor="reseller-plans-addons"
        ariaLabel="بسته‌های حجم و کاربر نمایندگان"
        plans={addons}
        columns={[
          { id: "name", label: "نام", rowHeader: true },
          { id: "category", label: "برچسب" },
          { id: "kind", label: "نوع" },
          { id: "amount", label: "مقدار" },
          { id: "price", label: "قیمت" },
          { id: "status", label: "وضعیت" },
        ]}
        cells={(p) => [
          <PlanName key="n" plan={p} />,
          p.category_name ? <bdi key="c">{p.category_name}</bdi> : <Dash key="c" />,
          kindText(p),
          <bdi key="m" className="num">{amountText(p)}</bdi>,
          <Price key="p" value={p.price} />,
          <ActiveChip key="s" active={p.is_active} />,
        ]}
        empty="بسته اضافه نیست — مخاطب پلن: نمایندگان → نوع: بسته حجم/کاربر."
        deleteText="این بسته حذف شود؟"
        reload={reload}
      />
    </div>
  );
}
