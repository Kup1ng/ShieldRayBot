"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { fa } from "../../core/format";
import { CheckGroup, CheckInput, FormGrid, MoneyInput, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { FormActions } from "./PlanParts";
import type { GiftCode, GiftCodesData } from "./types";
import { useFormSubmit } from "./useFormSubmit";

const orEmpty = (n: number | null) => (n === null ? "" : String(n));

/** What a field starts at when its «نامحدود» box is unticked again. */
const DEFAULT_CAP = "50000";
const DEFAULT_USES = "1";
const DEFAULT_DAYS = "30";

type LimitFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** What the field means while it is empty. */
  emptyLabel: string;
  restore: string;
  min?: number;
  max?: number;
  money?: boolean;
  help?: ReactNode;
};

/** A number where an empty field means no limit; the box below says so and brings a number back. */
function LimitField({ label, value, onChange, emptyLabel, restore, min, max, money = false, help }: LimitFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {money ? (
        <MoneyInput label={label} value={value} onChange={onChange} placeholder={emptyLabel} help={help} />
      ) : (
        <TextInput label={label} type="number" min={min} max={max} step={1} value={value} onChange={onChange} ltr placeholder={emptyLabel} help={help} />
      )}
      <CheckInput label={emptyLabel} checked={value === ""} onChange={(on) => onChange(on ? "" : restore)} />
    </div>
  );
}

export type GiftCodeDraft = {
  kind: "wallet" | "discount";
  amount: string;
  percent: string;
  cap: string;
  maxUses: string;
  perUser: string;
  days: string;
  /** The days the edit form was opened with; posting them back keeps the code's exact expiry. */
  shownDays: string;
  custom: string;
  note: string;
  firstOnly: boolean;
  types: string[];
  planIds: string[];
  editing: boolean;
};

/** The fields of the create and edit handlers; discount-only rules are not sent for a wallet code. */
export function giftCodeFields(draft: GiftCodeDraft) {
  return {
    kind: draft.kind,
    ...(draft.kind === "wallet"
      ? { amount: draft.amount }
      : { percent: draft.percent, max_discount_toman: draft.cap, first_purchase_only: draft.firstOnly, purchase_types: draft.types, plan_ids: draft.planIds }),
    max_uses: draft.maxUses,
    max_uses_per_user: draft.perUser,
    expires_in_days: draft.days,
    expires_in_days_shown: draft.shownDays,
    ...(draft.editing ? {} : { code: draft.custom }),
    note: draft.note,
  };
}

/** The create form and the edit form of one code; the kind of an existing code cannot change. */
export function GiftCodeForm({ data, code, onSaved, onCancel }: { data: GiftCodesData; code?: GiftCode; onSaved: () => void; onCancel?: () => void }) {
  const editing = Boolean(code);
  const [kind, setKind] = useState<"wallet" | "discount">(code?.kind ?? "wallet");
  const [amount, setAmount] = useState(code && code.kind === "wallet" ? String(code.amount) : "");
  const [percent, setPercent] = useState(code && code.kind === "discount" ? String(code.percent) : "");
  const [cap, setCap] = useState(code ? orEmpty(code.max_discount_toman) : "");
  const [maxUses, setMaxUses] = useState(code ? orEmpty(code.max_uses) : DEFAULT_USES);
  const [perUser, setPerUser] = useState(code ? orEmpty(code.max_uses_per_user) : DEFAULT_USES);
  const shownDays = code?.expiry_days ?? "";
  const [days, setDays] = useState(shownDays);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState(code?.note ?? "");
  const [firstOnly, setFirstOnly] = useState(code?.first_purchase_only ?? false);
  const [types, setTypes] = useState<string[]>(code?.purchase_types ?? []);
  const [planIds, setPlanIds] = useState<string[]>((code?.plan_ids ?? []).map(String));
  const { pending, send } = useFormSubmit(onSaved);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(
      code ? `/plans/gift-codes/${code.id}/edit` : "/plans/gift-codes",
      giftCodeFields({ kind, amount, percent, cap, maxUses, perUser, days, shownDays, custom, note, firstOnly, types, planIds, editing }),
      code ? "تنظیمات کد ذخیره شد" : "کد ساخته شد",
    );
  };
  const toggleFirst = (on: boolean) => {
    setFirstOnly(on);
    if (on) setTypes(["new"]);
  };
  const currentExpiry =
    code && shownDays ? (
      <>
        انقضای فعلی: <bdi dir="ltr" className="num">{code.expiry_label}</bdi> (تهران)
      </>
    ) : null;

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FormGrid>
        {editing ? (
          <TextInput label="نوع کد" value={kind === "wallet" ? "شارژ کیف پول" : "تخفیف درصدی خرید"} onChange={() => undefined} disabled />
        ) : (
          <SelectInput
            label="نوع کد"
            value={kind}
            onChange={(v) => setKind(v === "discount" ? "discount" : "wallet")}
            options={[
              { id: "wallet", label: "شارژ کیف پول" },
              { id: "discount", label: "تخفیف درصدی خرید" },
            ]}
          />
        )}
        {kind === "wallet" ? (
          <MoneyInput label="مبلغ شارژ (تومان)" value={amount} onChange={setAmount} required placeholder="50000" help={`حداکثر ${fa(data.limits.max_amount)}`} />
        ) : (
          <>
            <TextInput label="درصد تخفیف" type="number" min={1} max={100} value={percent} onChange={setPercent} required ltr placeholder="20" />
            <LimitField label="سقف تخفیف (تومان)" value={cap} onChange={setCap} emptyLabel="بدون سقف" restore={DEFAULT_CAP} money />
          </>
        )}
        <LimitField label="سقف استفاده کل (بار)" value={maxUses} onChange={setMaxUses} emptyLabel="نامحدود" restore={DEFAULT_USES} min={1} max={data.limits.max_uses} />
        <LimitField label="سقف استفاده هر کاربر (بار)" value={perUser} onChange={setPerUser} emptyLabel="نامحدود" restore={DEFAULT_USES} min={1} max={data.limits.max_uses} />
        <LimitField
          label="مدت اعتبار (روز)"
          value={days}
          onChange={setDays}
          emptyLabel="بدون انقضا"
          restore={DEFAULT_DAYS}
          min={shownDays === "0" ? 0 : 1}
          max={data.limits.max_expiry_days}
          help={currentExpiry}
        />
        {editing ? null : <TextInput label="کد سفارشی (اختیاری)" value={custom} onChange={setCustom} ltr maxLength={64} placeholder="خالی = خودکار" />}
        <TextInput label="یادداشت" value={note} onChange={setNote} maxLength={255} placeholder="مثلاً کمپین نوروز" />
      </FormGrid>
      {kind === "discount" ? (
        <div className="flex flex-col gap-3">
          <SwitchInput label="فقط خرید اول" help="فقط برای کاربرانی که در این فروشگاه هنوز خرید موفقی ندارند. تست رایگان و سفارش لغوشده حساب نمی‌شود." checked={firstOnly} onChange={toggleFirst} />
          <CheckGroup label="قابل استفاده برای" help="بدون انتخاب = همه نوع خرید. می‌توانید چند مورد را انتخاب کنید." options={data.purchase_types.map((t) => ({ id: t.key, label: t.label }))} selected={types} onChange={setTypes} />
          {data.plans.length ? (
            <CheckGroup
              label="فقط برای این پلن‌ها"
              help="بدون انتخاب = همه پلن‌ها. کد محدود به پلن فقط روی خرید جدید و تمدید همان پلن‌ها اعمال می‌شود، نه افزایش حجم یا زمان."
              options={data.plans.map((p) => ({ id: String(p.id), label: p.active ? p.name : `${p.name} (غیرفعال)` }))}
              selected={planIds}
              onChange={setPlanIds}
            />
          ) : null}
          <p className="text-sm text-muted">کاربر کد تخفیف را هنگام پرداخت وارد می‌کند. سقف تخفیف روی مجموع مبلغ سفارش اعمال می‌شود.</p>
        </div>
      ) : null}
      <FormActions submitLabel={editing ? "ذخیره تنظیمات" : "ساخت کد"} pending={pending} onCancel={onCancel} cancelLabel="بستن" />
    </form>
  );
}
