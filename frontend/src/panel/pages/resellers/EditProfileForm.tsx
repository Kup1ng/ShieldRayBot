"use client";

import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { Ltr, StatusChip } from "../../ui/Data";
import { FormGrid, FormSection, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";
import { FormActions } from "./Actions";
import { buildEditFields, type EditFormState } from "./editFields";
import { parseIdList } from "./idList";
import { IdListInput } from "./IdListInput";
import type { ResellerEdit } from "./types";

function initialState(data: ResellerEdit): EditFormState {
  const { profile } = data;
  return {
    billingMode: profile.billing_mode === "payg" ? "payg" : "fixed",
    confirmBillingChange: false,
    pgAdminUsername: profile.pg_admin_username ?? "",
    pgRoleId: profile.pg_role_id === null ? "" : String(profile.pg_role_id),
    perms: [...data.selected_perms],
    webPassword: "",
    pgApiKey: "",
    clearPgApiKey: false,
    botAdminIds: parseIdList(profile.bot_admin_ids),
    isActive: profile.is_active,
    sharePgPanelUrl: profile.share_pg_panel_url,
    allowVolumeOversell: profile.allow_volume_oversell,
  };
}

function Identities({ data }: { data: ResellerEdit }) {
  const { web_username: web, pg_admin_username: pg, bot_username: bot } = data.profile;
  const unified = web && pg && web === pg;
  return (
    <p className="text-sm text-muted">
      {unified ? (
        <>
          یوزر یکپارچه (وب‌پنل + پاسارگارد): <Ltr>{web}</Ltr>
        </>
      ) : (
        <>
          وب: {web ? <Ltr>{web}</Ltr> : "هنوز ساخته نشده"}
          {pg ? (
            <>
              {" "}
              · پاسارگارد: <Ltr>{pg}</Ltr>
            </>
          ) : null}
        </>
      )}{" "}
      · ربات: {bot ? <Ltr>@{bot}</Ltr> : "—"}
    </p>
  );
}

/** The main edit form: billing mode, panel link, permissions, credentials, bot admins and switches. */
export function EditProfileForm({ data, onSettled }: { data: ResellerEdit; onSettled: (result: ActionResult | null) => void }) {
  const [form, setForm] = useState<EditFormState>(() => initialState(data));
  const { pending, track } = usePending();
  const { profile } = data;
  const set = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const oversellSwitch = data.can_toggle_oversell && !data.is_payg;

  const togglePerm = (key: string, on: boolean) => set("perms", on ? Array.from(new Set([...form.perms, key])) : form.perms.filter((k) => k !== key));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void track(async () => onSettled(await run(`/resellers/${data.user.id}/edit`, buildEditFields(form, { oversellSwitch }))));
  };

  return (
    <GlassSection title="مشخصات و دسترسی‌ها" description="حالت پرداخت، اتصال پاسارگارد، دسترسی‌ها و ادمین‌های ربات این نماینده">
      <form className="flex flex-col gap-5" autoComplete="off" onSubmit={submit}>
        <FormGrid cols={3}>
          <div className="flex flex-col gap-3">
            <SelectInput
              label="حالت پرداخت"
              value={form.billingMode}
              onChange={(value) => set("billingMode", value)}
              options={[
                { id: "fixed", label: "ثابت" },
                { id: "payg", label: "PAYG" },
              ]}
            />
            <SwitchInput
              label="تأیید تغییر نوع پرداخت"
              help="مصرف PAYG از مصرف فعلی ادمین شروع می‌شود و مسدودی PAYG در بازگشت به «ثابت» برداشته می‌شود"
              checked={form.confirmBillingChange}
              onChange={(value) => set("confirmBillingChange", value)}
            />
          </div>
          <TextInput label="یوزرنیم پاسارگارد" value={form.pgAdminUsername} onChange={(value) => set("pgAdminUsername", value)} ltr />
          <SelectInput
            label="نقش پاسارگارد"
            value={form.pgRoleId}
            onChange={(value) => set("pgRoleId", value)}
            options={[{ id: "", label: "—" }, ...data.roles.map((role) => ({ id: String(role.id), label: role.name }))]}
          />
        </FormGrid>

        <FormSection title="سطح دسترسی (وب = بات)" description="هر مورد برای هر دو محیط یکسان اعمال می‌شود؛ نماینده از ربات بیشتر از وب نمی‌تواند.">
          <div className="grid gap-3 sm:grid-cols-2">
            {data.feature_perms.map((perm) => (
              <SwitchInput key={perm.key} label={perm.label} checked={form.perms.includes(perm.key)} onChange={(on) => togglePerm(perm.key, on)} />
            ))}
          </div>
          {data.miniapp_status ? (
            <p role="status" className="text-xs text-muted">
              وضعیت مینی‌اپ فروشگاه: {data.miniapp_status}
            </p>
          ) : null}
        </FormSection>

        <Identities data={data} />

        {profile.web_username ? (
          <TextInput
            label={`رمز عبور (وب‌پنل${profile.pg_admin_username ? " + پاسارگارد" : ""})`}
            type="password"
            value={form.webPassword}
            onChange={(value) => set("webPassword", value)}
            ltr
            placeholder="خالی = حفظ رمز فعلی"
            help={`اختیاری — با وارد کردن رمز جدید،${profile.pg_admin_username ? " رمز پاسارگارد هم" : ""} هم‌زمان عوض می‌شود`}
          />
        ) : null}

        {profile.pg_admin_username ? (
          <div className="flex flex-col gap-3">
            <TextInput
              label="کلید API پاسارگارد"
              type="password"
              value={form.pgApiKey}
              onChange={(value) => set("pgApiKey", value)}
              ltr
              placeholder={data.pg_api_key_stored ? "خالی بماند تا کلید فعلی حفظ شود" : "اختیاری — کلید API از پنل پاسارگارد"}
              help={
                <>
                  ترجیح بر رمز برای فراخوانی API (هدر <Ltr>X-Api-Key</Ltr>). کلید را در پاسارگارد بسازید و فقط یک‌بار اینجا ذخیره کنید.{" "}
                  {data.pg_api_key_stored ? <StatusChip color="success">کلید API ذخیره‌شده</StatusChip> : null}
                </>
              }
            />
            {data.pg_api_key_stored ? <SwitchInput label="حذف کلید API" help="بازگشت به احراز هویت با رمز" checked={form.clearPgApiKey} onChange={(value) => set("clearPgApiKey", value)} /> : null}
          </div>
        ) : null}

        <IdListInput
          label="آیدی ادمین‌های ربات اختصاصی"
          help="آیدی هر ادمین را جداگانه اضافه کنید. فقط روی ربات این نماینده پنل نماینده می‌بینند؛ در ربات اصلی منوی کاربر عادی می‌ماند."
          ids={form.botAdminIds}
          onChange={(next) => set("botAdminIds", next)}
        />

        <div className="flex flex-col gap-3">
          <SwitchInput label="نماینده فعال" checked={form.isActive} onChange={(value) => set("isActive", value)} />
          <SwitchInput label="ارسال لینک پنل پاسارگارد" help="اگر خاموش باشد، فقط وب‌پنل ربات برای مدیریت استفاده می‌شود" checked={form.sharePgPanelUrl} onChange={(value) => set("sharePgPanelUrl", value)} />
          {oversellSwitch ? (
            <SwitchInput
              label="اجازه فروش بیش از سقف حجم"
              help="اگر خاموش باشد، مجموع حجم سرویس‌های فروشگاه از سقف اشتراک بیشتر نمی‌شود. نماینده‌ای که اشتراک یا سقف حجم ندارد محدود نمی‌شود."
              checked={form.allowVolumeOversell}
              onChange={(value) => set("allowVolumeOversell", value)}
            />
          ) : null}
        </div>

        {form.billingMode !== (profile.billing_mode === "payg" ? "payg" : "fixed") && !form.confirmBillingChange ? (
          <Notice tone="warning">برای تغییر حالت پرداخت، «تأیید تغییر نوع پرداخت» را روشن کنید.</Notice>
        ) : null}
        <FormActions submitLabel="ذخیره" pending={pending} />
      </form>
    </GlassSection>
  );
}
