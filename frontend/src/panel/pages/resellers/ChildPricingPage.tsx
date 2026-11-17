"use client";

import { Button } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { FormGrid, FormModal, FormSection, MoneyInput, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { FormActions } from "../catalog/PlanParts";
import { RowActions, SelectableTable, type Column } from "../catalog/Tables";
import type { ChildPlan, ChildPricingData, ChildShop, PaygBasis } from "./childPricingTypes";

const PAGE = "/resellers/children-pricing";
const DATA_PATH = "/api/panel/resellers/children-pricing";
const OWNER_PACKAGE = "پکیج مالک";
const NO_PLAN = "";

const BASES: { id: PaygBasis; label: string }[] = [
  { id: "traffic", label: "حجم" },
  { id: "user", label: "کاربر" },
  { id: "user_traffic", label: "کاربر + حجم" },
];

const PLAN_COLUMNS: Column[] = [
  { id: "name", label: "نام", rowHeader: true },
  { id: "basis", label: "مبنا" },
  { id: "gb", label: "نرخ هر گیگ" },
  { id: "user", label: "قیمت هر کاربر" },
  { id: "actions", label: <span className="sr-only">اقدام</span> },
];

const CHILD_COLUMNS: Column[] = [
  { id: "label", label: "نماینده", rowHeader: true },
  { id: "plan", label: "پلن قیمت" },
  { id: "credit", label: "سقف اعتبار" },
  { id: "actions", label: <span className="sr-only">اقدام</span> },
];

export function basisLabel(basis: string): string {
  return BASES.find((item) => item.id === basis)?.label ?? basis;
}

/** The pricing list a child pays by, or the owner's package when none is assigned (or it vanished). */
export function childPlanName(child: Pick<ChildShop, "plan_id">, plans: Pick<ChildPlan, "id" | "name">[]): string {
  return plans.find((plan) => plan.id === child.plan_id)?.name ?? OWNER_PACKAGE;
}

function PlanForm({ plan, onSaved, onCancel }: { plan: ChildPlan | null; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [basis, setBasis] = useState<string>(plan?.payg_basis ?? "traffic");
  const [perGb, setPerGb] = useState(String(plan?.price_per_gb ?? 0));
  const [perUser, setPerUser] = useState(String(plan?.payg_user_price ?? 0));
  const [unlimited, setUnlimited] = useState(plan?.payg_unlimited_price == null ? "" : String(plan.payg_unlimited_price));
  const [per30Days, setPer30Days] = useState(plan?.payg_user_price_per_30d ?? false);
  const [pending, setPending] = useState(false);
  const pricesTraffic = basis !== "user";
  const pricesUsers = basis !== "traffic";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const fields = { name, payg_basis: basis, price_per_gb: perGb, payg_user_price: perUser, payg_unlimited_price: unlimited, payg_user_price_per_30d: per30Days };
      const result = await run(plan ? `${PAGE}/plans/${plan.id}` : `${PAGE}/plans`, fields, { success: plan ? "پلن قیمت ذخیره شد." : "پلن قیمت ساخته شد." });
      if (result?.ok) onSaved();
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <FormSection title="پلن">
        <TextInput label="نام پلن" value={name} onChange={setName} required maxLength={128} />
        <SelectInput label="مبنای هزینه" value={basis} onChange={setBasis} options={BASES} />
      </FormSection>
      <FormSection title="قیمت">
        <FormGrid>
          {pricesTraffic ? <MoneyInput label="نرخ هر گیگ" value={perGb} onChange={setPerGb} /> : null}
          {pricesUsers ? <MoneyInput label="قیمت هر کاربر" value={perUser} onChange={setPerUser} /> : null}
          <MoneyInput label="قیمت کاربر نامحدود" value={unlimited} onChange={setUnlimited} placeholder="ممنوع" help="خالی یعنی کاربر نامحدود ممنوع است." />
        </FormGrid>
        {pricesUsers ? <SwitchInput label="قیمت کاربر به ازای هر ۳۰ روز" checked={per30Days} onChange={setPer30Days} /> : null}
      </FormSection>
      {plan ? <p className="text-sm text-muted">تغییر فقط روی هزینه‌های بعدی اثر دارد.</p> : null}
      <FormActions submitLabel={plan ? "ذخیرهٔ پلن" : "ساخت پلن"} pending={pending} onCancel={onCancel} />
    </form>
  );
}

function ChildForm({ child, plans, freeCredit, onSaved, onCancel }: { child: ChildShop; plans: ChildPlan[]; freeCredit: number; onSaved: () => void; onCancel: () => void }) {
  const [planId, setPlanId] = useState(child.plan_id == null ? NO_PLAN : String(child.plan_id));
  const [credit, setCredit] = useState(String(child.credit_limit));
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await run(`${PAGE}/${child.shop_id}`, { plan_id: planId, credit_limit: credit }, { success: "قیمت و اعتبار زیرمجموعه ذخیره شد." });
      if (result?.ok) onSaved();
    } finally {
      setPending(false);
    }
  };

  const options = [{ id: NO_PLAN, label: OWNER_PACKAGE }, ...plans.map((plan) => ({ id: String(plan.id), label: plan.name }))];
  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <FormSection title="قیمت و اعتبار">
        <SelectInput label="پلن قیمت" value={planId} onChange={setPlanId} options={options} />
        <MoneyInput label="سقف اعتبار" value={credit} onChange={setCredit} help={`از اعتبار آزاد شما کم می‌شود؛ آزاد: ${toman(freeCredit)}`} />
      </FormSection>
      <FormActions submitLabel="ذخیره" pending={pending} onCancel={onCancel} />
    </form>
  );
}

function PlansSection({ data, onCreate, onEdit, reload }: { data: ChildPricingData; onCreate: () => void; onEdit: (plan: ChildPlan) => void; reload: () => void }) {
  const actions = (plan: ChildPlan) => [
    { id: "edit", label: "ویرایش", icon: "solar:pen-bold", run: () => onEdit(plan) },
    {
      id: "delete",
      label: "حذف",
      icon: "solar:trash-bin-trash-bold",
      tone: "danger" as const,
      confirmText: { message: "حذف پلن", description: `پلن «${plan.name}» حذف شود؟ هزینه‌های قبلی تغییری نمی‌کنند.`, confirmLabel: "حذف" },
      run: () => void run(`${PAGE}/plans/${plan.id}/delete`, {}, { success: "پلن قیمت حذف شد.", refresh: reload }),
    },
  ];
  return (
    <GlassSection
      title="پلن‌های قیمت"
      description={`${fa(data.plans.length)} پلن`}
      actions={
        <Button className="button--ink !h-10 !rounded-lg" onPress={onCreate}>
          <Icon name="solar:add-circle-bold" size={18} />
          پلن قیمت تازه
        </Button>
      }
    >
      <p className="text-sm leading-6 text-muted">زیرمجموعه به قیمت پلن شما می‌پردازد و شما به قیمت پلن خودتان. پلنی که به زیرمجموعه‌ای وصل است حذف نمی‌شود.</p>
      <SelectableTable
        ariaLabel="پلن‌های قیمت"
        columns={PLAN_COLUMNS}
        rows={data.plans}
        rowId={(plan) => plan.id}
        empty="هنوز پلن قیمتی نساخته‌اید."
        cells={(plan) => [
          <bdi key="n" className="font-medium text-foreground">{plan.name}</bdi>,
          <span key="b">{basisLabel(plan.payg_basis)}</span>,
          <bdi key="g" className="num">{toman(plan.price_per_gb)}</bdi>,
          <bdi key="u" className="num">{toman(plan.payg_user_price)}</bdi>,
          <RowActions key="a" label={`عملیات ${plan.name}`} actions={actions(plan)} />,
        ]}
        minWidth={620}
      />
    </GlassSection>
  );
}

function ChildrenSection({ data, onEdit }: { data: ChildPricingData; onEdit: (child: ChildShop) => void }) {
  return (
    <GlassSection title="زیرمجموعه‌ها" description={`${fa(data.children.length)} زیرمجموعه`}>
      <SelectableTable
        ariaLabel="زیرمجموعه‌ها"
        columns={CHILD_COLUMNS}
        rows={data.children}
        rowId={(child) => child.shop_id}
        empty="نمایندهٔ زیرمجموعه‌ای با فروشگاه ندارید"
        cells={(child) => [
          <bdi key="l" dir="ltr" className="font-medium text-foreground">{child.label}</bdi>,
          <span key="p">{childPlanName(child, data.plans)}</span>,
          <bdi key="c" className="num">{toman(child.credit_limit)}</bdi>,
          <RowActions key="a" label={`عملیات ${child.label}`} actions={[{ id: "edit", label: "ویرایش", icon: "solar:pen-bold", run: () => onEdit(child) }]} />,
        ]}
        minWidth={560}
      />
    </GlassSection>
  );
}

type PlanDialog = { plan: ChildPlan | null } | null;

function ChildPricingBody({ data, reload }: { data: ChildPricingData; reload: () => void }) {
  const [planDialog, setPlanDialog] = useState<PlanDialog>(null);
  const [childDialog, setChildDialog] = useState<ChildShop | null>(null);
  const saved = () => {
    setPlanDialog(null);
    setChildDialog(null);
    reload();
  };
  // Read the live row, so the form always starts from what the server last returned.
  const liveChild = childDialog ? (data.children.find((child) => child.shop_id === childDialog.shop_id) ?? childDialog) : null;
  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <StatTile icon="solar:wallet-money-bold" tone="green" label="اعتبار آزاد شما" value={<bdi>{toman(data.free_credit)}</bdi>} />
        <StatTile icon="solar:users-group-rounded-bold" tone="blue" label="زیرمجموعه‌ها" value={fa(data.children.length)} />
      </div>
      <div className="flex flex-col gap-6">
        <PlansSection data={data} onCreate={() => setPlanDialog({ plan: null })} onEdit={(plan) => setPlanDialog({ plan })} reload={reload} />
        <ChildrenSection data={data} onEdit={setChildDialog} />
      </div>
      <FormModal isOpen={planDialog !== null} onOpenChange={(open) => !open && setPlanDialog(null)} title={planDialog?.plan ? "ویرایش پلن قیمت" : "پلن قیمت تازه"} size="md">
        {planDialog ? <PlanForm key={planDialog.plan?.id ?? "new"} plan={planDialog.plan} onSaved={saved} onCancel={() => setPlanDialog(null)} /> : null}
      </FormModal>
      <FormModal isOpen={liveChild !== null} onOpenChange={(open) => !open && setChildDialog(null)} title={liveChild ? `قیمت و اعتبار ${liveChild.label}` : ""} size="md">
        {liveChild ? <ChildForm key={liveChild.shop_id} child={liveChild} plans={data.plans} freeCredit={data.free_credit} onSaved={saved} onCancel={() => setChildDialog(null)} /> : null}
      </FormModal>
    </>
  );
}

export function ChildPricingPage() {
  const state = useJson<ChildPricingData>(DATA_PATH);
  useUrlFlash();
  return (
    <PanelShell title="قیمت و اعتبار زیرمجموعه">
      <PageHeader icon="solar:tag-price-bold" tone="teal" title="قیمت و اعتبار زیرمجموعه" description="پلن قیمت و سقف اعتبار فروشگاه‌های زیرمجموعهٔ شما" />
      <Loadable state={state} rows={4}>
        {(data) => <ChildPricingBody data={data} reload={state.reload} />}
      </Loadable>
    </PanelShell>
  );
}
