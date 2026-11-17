"use client";

import type { ActionResult } from "../../core/api";
import { FormModal, SelectInput } from "../../ui/Fields";
import { AddonPackCreateForm } from "./AddonPackCreateForm";
import { AddonPackForm, CustomForm, FixedPlanForm, TrialForm, WholesaleForm, type PackDraft } from "./PlanForms";
import { ResellerPlanForm, type ResellerKind } from "./ResellerPlanForm";
import type { PlansOverview } from "./types";

export type Audience = "users" | "resellers";
export type PlanDialogState = { audience: Audience; kind: string } | null;

const USER_KINDS = [
  { id: "fixed", label: "ثابت" },
  { id: "custom", label: "دلخواه" },
  { id: "trial", label: "تست" },
  { id: "wholesale", label: "فروش عمده" },
  { id: "addon_volume", label: "بسته حجم" },
  { id: "addon_duration", label: "بسته زمان" },
];
const RESELLER_KINDS = [
  { id: "fixed", label: "اشتراک ثابت" },
  { id: "payg", label: "اشتراک PAYG" },
  { id: "addon_volume", label: "بسته حجم" },
  { id: "addon_users", label: "بسته کاربر" },
];

/** The unified «افزودن پلن» dialog: audience and kind decide the form, each posts its own handler. */
export function PlanDialog({ data, state, onChange, onClose, onDone }: { data: PlansOverview; state: PlanDialogState; onChange: (next: PlanDialogState) => void; onClose: () => void; onDone: (result: ActionResult) => void }) {
  if (!state) return null;
  const kinds = state.audience === "resellers" ? RESELLER_KINDS : USER_KINDS;
  const kind = kinds.some((k) => k.id === state.kind) ? state.kind : kinds[0].id;
  const common = { data, onDone, onCancel: onClose };
  const resellerCategories = data.categories.filter((c) => c.is_active && c.audience === "resellers");

  let form: React.ReactNode;
  if (state.audience === "resellers") {
    form = (
      <ResellerPlanForm
        key={kind}
        mode="create"
        groups={data.groups}
        pgRoles={data.pg_roles}
        featurePerms={data.feature_perms}
        limits={data.limits}
        categories={resellerCategories}
        styleOptions={data.plan_style_options}
        packStyleOptions={data.pack_style_options}
        packConfig={data.pack_config.reseller}
        initialKind={kind as ResellerKind}
        onDone={onDone}
        onCancel={onClose}
      />
    );
  } else if (kind === "trial") form = <TrialForm {...common} />;
  else if (kind === "custom") form = <CustomForm {...common} />;
  else if (kind === "wholesale") form = <WholesaleForm {...common} />;
  else if (kind === "addon_volume" || kind === "addon_duration") form = <AddonPackCreateForm key={kind} {...common} kind={kind === "addon_duration" ? "duration" : "volume"} />;
  else form = <FixedPlanForm {...common} />;

  return (
    <FormModal isOpen onOpenChange={(open) => !open && onClose()} title="افزودن پلن" description="پلن فروشگاه یا نمایندگی را اینجا بسازید" size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="مخاطب پلن"
          value={state.audience}
          onChange={(v) => onChange({ audience: v === "resellers" && data.is_platform_admin ? "resellers" : "users", kind: "fixed" })}
          options={[{ id: "users", label: "کاربران" }, ...(data.is_platform_admin ? [{ id: "resellers", label: "نمایندگان" }] : [])]}
        />
        <SelectInput label="نوع پلن" value={kind} onChange={(v) => onChange({ audience: state.audience, kind: v })} options={kinds} />
      </div>
      {form}
    </FormModal>
  );
}

/** Dialog that edits one existing add-on pack. */
export function PackDialog({ data, draft, onClose, onDone }: { data: PlansOverview; draft: PackDraft | null; onClose: () => void; onDone: (result: ActionResult) => void }) {
  return (
    <FormModal isOpen={Boolean(draft)} onOpenChange={(open) => !open && onClose()} title="بسته حجم / زمان" description="کاربر می‌تواند حجم یا زمان بخرد و به سرویس فعلی‌اش اضافه کند" size="md">
      {draft ? <AddonPackForm key={draft.id} data={data} initial={draft} onDone={onDone} onCancel={onClose} /> : null}
    </FormModal>
  );
}
