"use client";

import { useState, type FormEvent } from "react";

import type { ActionResult } from "../../core/api";
import { CheckGroup, FormGrid, FormSection, MoneyInput, SelectInput, SwitchInput, TextAreaInput, TextInput } from "../../ui/Fields";
import { Notice } from "../../ui/States";
import { ButtonStyleField, CategorySelect, FormActions, asOptions, groupFields } from "./PlanParts";
import type { Limits, PgOption, ResellerPlanEdit, StyleOption } from "./types";
import { useFormSubmit } from "./useFormSubmit";

export type ResellerKind = "fixed" | "payg" | "addon_volume" | "addon_users" | "current_capacity";

type Plan = ResellerPlanEdit["plan"];

type Props = {
  mode: "create" | "edit";
  groups: PgOption[];
  pgRoles: PgOption[];
  featurePerms: Array<[string, string]>;
  limits: Limits;
  categories: Array<{ id: number; name: string; is_active?: boolean }>;
  styleOptions: StyleOption[];
  plan?: Plan;
  selectedPerms?: string[];
  initialKind?: ResellerKind;
  onDone: (result: ActionResult) => void;
  onCancel: () => void;
};

const KIND_OPTIONS = [
  { id: "fixed", label: "اشتراک ثابت" },
  { id: "payg", label: "اشتراک PAYG" },
  { id: "addon_volume", label: "بسته حجم" },
  { id: "addon_users", label: "بسته کاربر" },
];

const KIND_HINTS: Record<ResellerKind, string> = {
  fixed: "اشتراک ثابت — گروه و نقش پاسارگارد الزامی است.",
  payg: "اشتراک PAYG — نرخ هر گیگ، گروه و نقش پاسارگارد الزامی است؛ خرید حجم/کاربر اضافه لازم نیست.",
  addon_volume: "بسته حجم — بدون گروه/نقش/دسترسی/نام‌گذاری سرویس؛ فقط برای نمایندگان با اشتراک فعال.",
  addon_users: "بسته کاربر — بدون گروه/نقش/دسترسی/نام‌گذاری سرویس؛ فقط برای نمایندگان با اشتراک فعال.",
  current_capacity: "پلن سیستمی «ظرفیت فعلی» — نوع و حجم/کاربر پایه قفل است؛ سقف از پاسارگارد ادمین خوانده می‌شود. فقط قیمت، مدت، تمدید و دسترسی قابل ویرایش است.",
};

export function kindOfPlan(plan: Pick<Plan, "is_system" | "plan_kind" | "billing_mode">): ResellerKind {
  if (plan.is_system || plan.plan_kind === "current_capacity") return "current_capacity";
  if (plan.plan_kind === "addon_volume" || plan.plan_kind === "addon_users") return plan.plan_kind;
  return plan.billing_mode === "payg" ? "payg" : "fixed";
}

const text = (n: number | null | undefined, empty = "0") => (n === null || n === undefined ? empty : String(n));

/** One form for creating and editing a reseller package; the kind decides which fields count. */
export function ResellerPlanForm({ mode, groups, pgRoles, featurePerms, limits, categories, styleOptions, plan, selectedPerms, initialKind = "fixed", onDone, onCancel }: Props) {
  const editing = mode === "edit";
  const [kind, setKind] = useState<ResellerKind>(plan ? kindOfPlan(plan) : initialKind);
  const [category, setCategory] = useState(plan?.category_id ? String(plan.category_id) : "");
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(text(plan?.price));
  const [pricePerGb, setPricePerGb] = useState(text(plan?.price_per_gb));
  const [sort, setSort] = useState(text(plan?.sort_order));
  const [description, setDescription] = useState(plan?.description ?? "");
  const [duration, setDuration] = useState(text(plan?.duration_days));
  const [includedGb, setIncludedGb] = useState(text(plan?.included_gb));
  const [includedUsers, setIncludedUsers] = useState(text(plan?.included_users));
  const [addonGb, setAddonGb] = useState(text(plan?.addon_gb));
  const [addonUsers, setAddonUsers] = useState(text(plan?.addon_users));
  const [renewPrice, setRenewPrice] = useState(text(plan?.renew_price));
  const [renewMode, setRenewMode] = useState(plan?.renew_pricing_mode === "from_capacity" ? "from_capacity" : "fixed");
  const [selectedGroups, setSelectedGroups] = useState<string[]>(plan?.pg_group_ids ?? []);
  const [perms, setPerms] = useState<string[]>(selectedPerms ?? featurePerms.map(([key]) => key));
  const [createAdmin, setCreateAdmin] = useState(plan ? plan.create_pg_admin : true);
  const [shareUrl, setShareUrl] = useState(plan?.share_pg_panel_url ?? false);
  const [allowExtra, setAllowExtra] = useState(plan?.allow_buy_extra ?? false);
  const [extraGb, setExtraGb] = useState(text(plan?.extra_gb_price));
  const [extraUser, setExtraUser] = useState(text(plan?.extra_user_price));
  const [role, setRole] = useState(plan?.pg_role_id ? String(plan.pg_role_id) : "");
  const [active, setActive] = useState(plan ? plan.is_active : true);
  const [style, setStyle] = useState(plan?.button_style ?? "inherit");
  const { pending, send } = useFormSubmit(onDone);

  const system = kind === "current_capacity";
  const isVol = kind === "addon_volume";
  const isUsers = kind === "addon_users";
  const isAddon = isVol || isUsers;
  const isPayg = kind === "payg";
  const buyExtraAllowed = !isAddon && !isPayg;
  const extraOn = buyExtraAllowed && allowExtra;

  const submit = () => {
    const base: Record<string, string | boolean> = {
      category_id: category,
      name,
      price,
      sort_order: sort,
      description,
      button_style: style,
      is_active: system ? true : active,
    };
    let fields: Record<string, string | boolean>;
    if (isAddon) {
      fields = { ...base, plan_kind: kind, billing_mode: "fixed", addon_gb: addonGb, addon_users: addonUsers };
    } else {
      fields = {
        ...base,
        plan_kind: system ? "current_capacity" : "subscription",
        billing_mode: isPayg ? "payg" : "fixed",
        duration_days: duration,
        renew_price: renewPrice,
        renew_pricing_mode: extraOn ? "from_capacity" : renewMode,
        share_pg_panel_url: shareUrl,
        ...Object.fromEntries(perms.map((key) => [`perm_${key}`, true])),
        ...(buyExtraAllowed ? { allow_buy_extra: allowExtra, extra_gb_price: extraOn ? extraGb : "0", extra_user_price: extraOn ? extraUser : "0" } : {}),
        ...(system
          ? {}
          : {
              price_per_gb: isPayg ? pricePerGb : "0",
              included_gb: includedGb,
              included_users: includedUsers,
              create_pg_admin: createAdmin,
              pg_role_id: role,
              ...groupFields(selectedGroups),
            }),
      };
    }
    return send(editing ? `/resellers/plans/${plan?.id}/edit` : "/resellers/plans", fields, "پلن نمایندگی ذخیره شد");
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const priceLabel = isAddon ? "قیمت بسته (تومان)" : editing ? "قیمت (تومان)" : "قیمت ورود (تومان)";
  const priceHint = isAddon ? "فقط برای نمایندگانی که قبلاً اشتراک خریده‌اند — تاریخ انقضا عوض نمی‌شود" : "هزینه خرید پکیج نمایندگی — ۰ = رایگان؛ فقط تأیید ادمین";
  const placeholder = isVol ? "بسته ۲۰ گیگ" : isUsers ? "بسته ۱۰ کاربر" : "نمایندگی نقره‌ای";

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      {limits.cards.length ? (
        <Notice tone="accent">ظرفیت نمایندگی‌ها از سقف زنده ادمین اصلی بیشتر نمی‌شود: {limits.cards.map((c) => `${c.label}: ${c.value}`).join(" · ")}</Notice>
      ) : null}
      {system ? <Notice>{KIND_HINTS.current_capacity}</Notice> : <p className="text-sm text-muted">{KIND_HINTS[kind]}</p>}
      <FormGrid>
        <TextInput label="مخاطب پلن" value="نمایندگان" onChange={() => undefined} disabled />
        {system ? (
          <TextInput label="نوع پلن" value="ظرفیت فعلی (سیستمی)" onChange={() => undefined} disabled />
        ) : (
          <SelectInput label="نوع پلن" value={kind} onChange={(v) => setKind(v as ResellerKind)} options={KIND_OPTIONS} />
        )}
      </FormGrid>
      <CategorySelect
        value={category}
        onChange={setCategory}
        categories={categories}
        help={isAddon ? "بسته فقط برای نمایندگانی دیده می‌شود که پلن اشتراک‌شان همین برچسب را دارد" : "برچسب نمایش برای پلن‌های نمایندگی — از «برچسب دسته» با مخاطب نمایندگان بسازید"}
      />
      <FormGrid cols={3}>
        <TextInput label="نام" value={name} onChange={setName} required readOnly={system} placeholder={placeholder} />
        <MoneyInput label={priceLabel} value={price} onChange={setPrice} help={priceHint} />
        {isPayg && !system ? <MoneyInput label="نرخ هر گیگ (تومان)" value={pricePerGb} onChange={setPricePerGb} help="فقط برای PAYG — هر پلن می‌تواند نرخ جدا داشته باشد" /> : null}
        <TextInput label="ترتیب" type="number" value={sort} onChange={setSort} />
      </FormGrid>
      <TextAreaInput label="توضیح" value={description} onChange={setDescription} />

      {isAddon ? (
        <FormGrid>
          {isVol ? <TextInput label="حجم بسته (گیگ)" type="number" min={0} value={addonGb} onChange={setAddonGb} /> : null}
          {isUsers ? <TextInput label="کاربر بسته" type="number" min={0} value={addonUsers} onChange={setAddonUsers} /> : null}
        </FormGrid>
      ) : (
        <>
          <TextInput label="مدت اشتراک (روز)" type="number" min={0} value={duration} onChange={setDuration} help="۰ = زمان نامحدود (بدون انقضای اشتراک)" />
          {system ? (
            <p className="text-sm text-muted">حجم/کاربر پایه همیشه ۰ است — هنگام اعطا، سقف زنده ادمین پاسارگارد در اشتراک محلی ثبت می‌شود.</p>
          ) : (
            <FormGrid>
              <TextInput
                label="حجم پایه (گیگ)"
                type="number"
                min={0}
                value={includedGb}
                onChange={setIncludedGb}
                help={`۰ = سقف حجم از این پلن اعمال نمی‌شود (نامحدود/حفظ وضعیت فعلی)${limits.account_data_limit_text ? ` — سقف ادمین اصلی: ${limits.account_data_limit_text}` : ""}`}
              />
              <TextInput
                label="کاربر پایه"
                type="number"
                min={0}
                value={includedUsers}
                onChange={setIncludedUsers}
                help={`۰ = سقف کاربر از این پلن اعمال نمی‌شود${limits.max_users ? ` — سقف ادمین اصلی: ${limits.max_users.toLocaleString("fa-IR")} کاربر` : ""}`}
              />
            </FormGrid>
          )}
          <FormGrid>
            <MoneyInput label="قیمت تمدید (تومان)" value={renewPrice} onChange={setRenewPrice} help="۰ = همان قیمت ورود پلن" />
            <SelectInput
              label="محاسبه تمدید"
              value={extraOn ? "from_capacity" : renewMode}
              onChange={setRenewMode}
              disabled={extraOn}
              options={[
                { id: "fixed", label: "ثابت (فقط قیمت تمدید)" },
                { id: "from_capacity", label: "بر اساس ظرفیت (پایه + اضافه‌ها)" },
              ]}
              help="اگر خرید حجم/کاربر اضافه روشن باشد، همیشه بر اساس ظرفیت محاسبه می‌شود."
            />
          </FormGrid>
          {system ? null : (
            <CheckGroup
              label="گروه‌های پاسارگارد (الزامی)"
              help="حداقل یک گروه باید انتخاب شود — برای ثابت و PAYG."
              options={asOptions(groups)}
              selected={selectedGroups}
              onChange={setSelectedGroups}
              empty="گروهی از پاسارگارد لود نشد — اتصال PG را بررسی کنید."
            />
          )}
          <FormSection title="دسترسی پیش‌فرض (وب = بات)" description="این دسترسی‌ها هنگام تأیید درخواست نمایندگی اعمال می‌شوند.">
            <CheckGroup label="دسترسی‌ها" options={featurePerms.map(([key, label]) => ({ id: key, label }))} selected={perms} onChange={setPerms} columns />
          </FormSection>
          <div className="flex flex-col gap-3">
            {system ? null : <SwitchInput label="ساخت ادمین پاسارگارد هنگام تأیید" help="با نقش پاسارگارد پلن؛ برای مالکیت کاربران لازم است" checked={createAdmin} onChange={setCreateAdmin} />}
            <SwitchInput label="ارسال لینک و یوزر/رمز پنل پاسارگارد" help="اگر خاموش باشد، نماینده فقط از وب‌پنل ربات مدیریت می‌کند" checked={shareUrl} onChange={setShareUrl} />
            {buyExtraAllowed ? <SwitchInput label="امکان خرید حجم و کاربر اضافه" help="فقط اشتراک ثابت — در ربات پله‌های ۱/۵/۱۰… نمایش داده می‌شود؛ برای PAYG لازم نیست" checked={allowExtra} onChange={setAllowExtra} /> : null}
          </div>
          {extraOn ? (
            <FormGrid>
              <MoneyInput label="قیمت هر گیگ اضافه (تومان)" value={extraGb} onChange={setExtraGb} />
              <MoneyInput label="قیمت هر کاربر اضافه (تومان)" value={extraUser} onChange={setExtraUser} />
            </FormGrid>
          ) : null}
          {system ? (
            <p className="text-sm text-muted">نقش پاسارگارد از خود ادمین موجود می‌آید — این پلن نقش جدید نمی‌سازد.</p>
          ) : (
            <SelectInput label="نقش پاسارگارد (الزامی)" value={role} onChange={setRole} options={[{ id: "", label: "— انتخاب کنید —" }, ...asOptions(pgRoles)]} />
          )}
        </>
      )}

      {system ? <p className="text-sm text-muted">وضعیت: فعال (پلن سیستمی — خاموش‌کردن مجاز نیست)</p> : <SwitchInput label="پلن فعال" checked={active} onChange={setActive} />}
      <ButtonStyleField value={style} onChange={setStyle} options={styleOptions} />
      <FormActions submitLabel={editing ? "ذخیره" : "ذخیره پلن"} pending={pending} onCancel={onCancel} />
    </form>
  );
}
