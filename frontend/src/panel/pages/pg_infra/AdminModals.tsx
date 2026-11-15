"use client";

import { Button, toast } from "@heroui/react";
import { useState, type FormEvent, type ReactNode } from "react";

import { run, usePending } from "../../core/actions";
import { Ltr } from "../../ui/Data";
import { CheckInput, FormGrid, FormModal, FormSection, SelectInput, SubmitButton, SwitchInput, TextAreaInput, TextInput } from "../../ui/Fields";
import { Notice } from "../../ui/States";
import {
  adminPath,
  convertFields,
  createFields,
  createProblem,
  deleteCopy,
  emptyCreateDraft,
  REASON_MIN,
  resellerFields,
  staffFields,
  type CreateDraft,
  type GrantDraft,
  type StaffDraft,
} from "./adminForms";
import { planLabel } from "./format";
import type { AdminRow, AdminsData, PlanOption } from "./types";

const OVERSELL_LABEL = "اجازه فروش بیش از سقف حجم";
const OVERSELL_HELP =
  "خاموش: فروش این نماینده از سقف حجم اشتراکش بیشتر نمی‌شود. روشن: محدودیتی نیست. برای پلن PAYG اثری ندارد. بعداً از صفحهٔ ویرایش نماینده هم قابل تغییر است.";
const PASSWORD_RULE = "طبق پاسارگارد: حداقل ۱۲ کاراکتر، دو رقم، دو حرف بزرگ/کوچک و کاراکتر خاص";
const CAPACITY_WARNING = "پلن پیش‌فرض «ظرفیت فعلی» سقف حجم/کاربر همین ادمین در پاسارگارد را حفظ می‌کند و صفر نمی‌کند. برای سقف ثابت پلن دیگری انتخاب کنید.";

/** `onReload` re-reads the list (also after a lost reply); `onClose` closes the dialog once the handler succeeded. */
type ModalProps = { onClose: () => void; onReload: () => void };

function Actions({ submit, pending, canSubmit = true, onCancel, danger = false }: { submit: string; pending: boolean; canSubmit?: boolean; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {danger ? (
        <Button type="submit" variant="danger" isPending={pending} isDisabled={!canSubmit} className="!h-12 !rounded-lg px-6 text-sm">
          {submit}
        </Button>
      ) : (
        <SubmitButton pending={pending} isDisabled={!canSubmit}>
          {submit}
        </SubmitButton>
      )}
      <Button variant="outline" onPress={onCancel}>
        انصراف
      </Button>
    </div>
  );
}

function PlanSelect({
  label,
  value,
  onChange,
  plans,
  tagged,
  withDuration,
  help,
  placeholderLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  plans: PlanOption[];
  tagged: boolean;
  withDuration: boolean;
  help?: ReactNode;
  placeholderLabel: string;
}) {
  const options = [{ id: "", label: placeholderLabel }, ...plans.map((plan) => ({ id: String(plan.id), label: planLabel(plan, { tagged, withDuration }) }))];
  return <SelectInput label={label} value={value} onChange={onChange} options={options} help={help} disabled={!plans.length} />;
}

function UsageLine({ admin }: { admin: AdminRow }) {
  return (
    <p className="text-sm text-muted">
      سقف فعلی این ادمین در پاسارگارد (مصرف/سقف): کاربران <Ltr className="font-semibold text-foreground">{admin.users_text}</Ltr> · حجم{" "}
      <Ltr className="font-semibold text-foreground">{admin.traffic_text}</Ltr>. با پلن «ظرفیت فعلی» همین سقف ثبت می‌شود؛ اگر خوانده نشود، اعطا انجام نمی‌شود.
    </p>
  );
}

function AdminIntro({ username, children }: { username: string; children: ReactNode }) {
  return (
    <p className="text-sm text-muted">
      ادمین پاسارگارد: <Ltr className="font-semibold text-foreground">{username}</Ltr> — {children}
    </p>
  );
}

/* ---------- create ---------- */

function CreateForm({ data, onClose, onReload }: ModalProps & { data: AdminsData }) {
  const [draft, setDraft] = useState<CreateDraft>(() => emptyCreateDraft(data.feature_perms.map((perm) => perm.key)));
  const { pending, track } = usePending();
  const set = (patch: Partial<CreateDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const togglePerm = (key: string, on: boolean) => set({ perms: on ? Array.from(new Set([...draft.perms, key])) : draft.perms.filter((k) => k !== key) });
  const plans = data.plans.create;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = createProblem(draft);
    if (problem) {
      toast.danger(problem);
      return;
    }
    void track(async () => {
      const result = await run("/pg/admins", createFields(draft, { canToggleOversell: data.can_toggle_oversell }), { success: "ادمین ساخته شد.", refresh: onReload });
      if (result?.ok) onClose();
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FormGrid cols={3}>
        <TextInput
          label="نام کاربری"
          value={draft.username}
          onChange={(username) => set({ username })}
          required
          ltr
          placeholder="admin_name"
          maxLength={128}
          help="۳ تا ۱۲۸ کاراکتر از a-z، 0-9 و - _ @ . بدون دو نماد پشت‌سرهم. همین نام برای ورود به وب هم استفاده می‌شود."
        />
        <TextInput
          label="رمز عبور"
          type="password"
          value={draft.password}
          onChange={(password) => set({ password })}
          required
          ltr
          placeholder="رمز قوی"
          help="حداقل ۱۲ کاراکتر شامل دو رقم، دو حرف بزرگ، دو حرف کوچک و یک نماد. برای پاسارگارد و وب یکی است."
        />
        <SelectInput
          label="نقش پاسارگارد"
          value={draft.role_id}
          onChange={(role_id) => set({ role_id })}
          options={[{ id: "", label: "— بدون نقش (سازگاری قدیم) —" }, ...data.roles.map((role) => ({ id: String(role.id), label: role.name }))]}
          help="سطح دسترسی منو/عملیات از این نقش می‌آید"
        />
      </FormGrid>
      <FormGrid cols={3}>
        <TextInput label="سقف حجم ادمین (گیگ)" type="number" min={0} step="0.1" value={draft.data_limit_gb} onChange={(data_limit_gb) => set({ data_limit_gb })} placeholder="خالی = بدون سقف" help="محدودیت ترافیک کل کاربران این ادمین" />
        <TextInput label="سقف تعداد کاربر" type="number" min={0} value={draft.max_users} onChange={(max_users) => set({ max_users })} placeholder="خالی = از نقش" help="بازنویسی محدودیت نقش (اختیاری)" />
        <TextInput label="سقف HWID هر کاربر" type="number" min={0} value={draft.max_hwid_per_user} onChange={(max_hwid_per_user) => set({ max_hwid_per_user })} placeholder="خالی = از نقش" help="بازنویسی محدودیت نقش (اختیاری)" />
      </FormGrid>
      <TextInput label="یادداشت" value={draft.note} onChange={(note) => set({ note })} placeholder="نماینده فروش" help="اختیاری — در پاسارگارد ذخیره می‌شود" />
      <SwitchInput
        label="این ادمین نماینده شود (ربات شخصی + پنل فروشگاه)"
        help="با روشن کردن، پلن و دسترسی‌های پنل نماینده نمایش داده می‌شود"
        checked={draft.as_reseller}
        onChange={(as_reseller) => set({ as_reseller })}
      />
      {draft.as_reseller ? (
        <FormSection title="نماینده" description="ثابت یا PAYG — پلن «ظرفیت فعلی» اینجا نیست (فقط برای ادمین موجود)">
          {!plans.length ? <Notice tone="warning">برای ساخت نماینده ابتدا از بخش پلن‌ها یک پلن فعال بسازید — یا سوییچ بالا را خاموش بگذارید.</Notice> : null}
          <PlanSelect label="پلن نمایندگی" value={draft.plan_id} onChange={(plan_id) => set({ plan_id })} plans={plans} tagged withDuration={false} placeholderLabel="— انتخاب پلن —" />
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h5 className="text-sm font-medium text-foreground">سطح دسترسی پنل ربات (وب = بات)</h5>
              <p className="text-xs text-muted">هر سوییچ هم‌زمان برای وب‌پنل و ربات اعمال می‌شود — مثل مودال افزودن نماینده.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.feature_perms.map((perm) => (
                <SwitchInput key={perm.key} label={perm.label} checked={draft.perms.includes(perm.key)} onChange={(on) => togglePerm(perm.key, on)} />
              ))}
            </div>
          </div>
          <SwitchInput
            label="ارسال لینک و یوزر/رمز پنل پاسارگارد"
            help="اگر خاموش باشد، نماینده فقط از وب‌پنل ربات مدیریت می‌کند"
            checked={draft.share_pg_panel_url}
            onChange={(share_pg_panel_url) => set({ share_pg_panel_url })}
          />
          {data.can_toggle_oversell ? <SwitchInput label={OVERSELL_LABEL} help={OVERSELL_HELP} checked={draft.allow_volume_oversell} onChange={(allow_volume_oversell) => set({ allow_volume_oversell })} /> : null}
        </FormSection>
      ) : (
        <SwitchInput
          label="دسترسی وب ادمین فرعی (فقط پاسارگارد)"
          help="بدون فروشگاه/ربات — فقط منوی پاسارگارد مطابق نقش"
          checked={draft.grant_web}
          onChange={(grant_web) => set({ grant_web })}
        />
      )}
      <SwitchInput label="دسترسی کامل (قدیمی)" help="فقط پنل‌های قدیمی؛ در نسخه‌های جدید از نقش استفاده کنید" checked={draft.is_sudo} onChange={(is_sudo) => set({ is_sudo })} />
      <Actions submit="ساخت ادمین" pending={pending} onCancel={onClose} />
    </form>
  );
}

export function CreateAdminModal({ open, data, onClose, onReload }: ModalProps & { open: boolean; data: AdminsData }) {
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title="ساخت ادمین پنل" description="ادمین پاسارگارد جدید" size="lg">
      {open ? <CreateForm data={data} onClose={onClose} onReload={onReload} /> : null}
    </FormModal>
  );
}

/* ---------- secondary admin ---------- */

function StaffForm({ admin, data, onClose, onReload }: ModalProps & { admin: AdminRow; data: AdminsData }) {
  const web = admin.web;
  const editing = web.source === "pg_staff";
  const misaligned = editing && web.username_aligned === false;
  const [draft, setDraft] = useState<StaffDraft>({ web_password: "", pg_api_key: "", clear_pg_api_key: false, note: editing ? (web.note ?? "") : "", plan_id: "", confirm_align: false });
  const { pending, track } = usePending();
  const { pending: renewing, track: trackRenew } = usePending();
  const set = (patch: Partial<StaffDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const needsPassword = !editing;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (needsPassword && !draft.web_password) {
      toast.danger("رمز عبور وب‌پنل الزامی است.");
      return;
    }
    void track(async () => {
      const result = await run(adminPath(admin.username, "web-access/staff"), staffFields(admin.username, draft), { success: "دسترسی ادمین فرعی ذخیره شد.", refresh: onReload });
      if (result?.ok) onClose();
    });
  };

  const renew = () =>
    void trackRenew(async () => {
      const result = await run(adminPath(admin.username, "subscription/renew"), { plan_id: "" }, { success: "اشتراک تمدید شد.", refresh: onReload });
      if (result?.ok) onClose();
    });

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <AdminIntro username={admin.username}>فقط منوی پاسارگارد؛ فروشگاه/ربات ساخته نمی‌شود.</AdminIntro>
        {misaligned ? (
          <Notice tone="warning">
            نام کاربری وب فعلی (<Ltr>{web.web_username}</Ltr>) با پاسارگارد (<Ltr>{admin.username.toLowerCase()}</Ltr>) یکی نیست. برای ادامه، هم‌ترازسازی را صریحاً تأیید کنید.
          </Notice>
        ) : null}
        <TextInput label="نام کاربری وب‌پنل" value={admin.username.toLowerCase()} onChange={() => undefined} readOnly ltr help="باید دقیقاً همان نام ادمین پاسارگارد باشد (ورود یکپارچه)" />
        {misaligned ? <CheckInput label="هم‌ترازسازی نام کاربری با پاسارگارد (بدون این تأیید، نام کاربری تغییر نمی‌کند)" checked={draft.confirm_align} onChange={(confirm_align) => set({ confirm_align })} /> : null}
        <TextInput
          label="رمز عبور وب‌پنل"
          type="password"
          value={draft.web_password}
          onChange={(web_password) => set({ web_password })}
          required={needsPassword}
          ltr
          placeholder={editing ? "خالی = حفظ رمز فعلی (اگر اعتبارنامه ذخیره شده)" : "رمز قوی"}
          help={`${editing ? "اگر اعتبارنامه پاسارگارد ذخیره نشده، رمز الزامی است — " : ""}${PASSWORD_RULE}`}
        />
        <TextInput
          label="کلید API پاسارگارد"
          type="password"
          value={draft.pg_api_key}
          onChange={(pg_api_key) => set({ pg_api_key })}
          ltr
          placeholder={web.api_key_ready ? "خالی بماند تا کلید فعلی حفظ شود" : "اختیاری — کلید API پاسارگارد"}
          help={`ترجیح بر رمز برای API (X-Api-Key)${web.api_key_ready ? " · ذخیره‌شده" : ""}`}
        />
        {web.api_key_ready ? <CheckInput label="حذف کلید API" checked={draft.clear_pg_api_key} onChange={(clear_pg_api_key) => set({ clear_pg_api_key })} /> : null}
        <TextInput label="یادداشت" value={draft.note} onChange={(note) => set({ note })} placeholder="ادمین فرعی محدود" help="اختیاری" />
        <PlanSelect
          label="پلن اشتراک زمانی (اختیاری)"
          value={draft.plan_id}
          onChange={(plan_id) => set({ plan_id })}
          plans={data.plans.staff}
          tagged={false}
          withDuration
          placeholderLabel="— بدون محدودیت زمان —"
          help="با انقضا، ادمین و کاربرانش موقتاً غیرفعال می‌شوند"
        />
        <Actions submit={editing ? "ذخیره" : "اعطای دسترسی ادمین فرعی"} pending={pending} canSubmit={!misaligned || draft.confirm_align} onCancel={onClose} />
      </form>
      {editing ? (
        <div>
          <Button variant="outline" isPending={renewing} onPress={renew}>
            تمدید اشتراک زمانی (بدون کسر کیف پول)
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function StaffAccessModal({ admin, data, onClose, onReload }: ModalProps & { admin: AdminRow | null; data: AdminsData }) {
  const editing = admin?.web.source === "pg_staff";
  return (
    <FormModal isOpen={admin !== null} onOpenChange={(next) => !next && onClose()} title={editing ? "ویرایش ادمین فرعی" : "اعطای ادمین فرعی (فقط پاسارگارد)"} description="مدیریت پاسارگارد">
      {admin ? <StaffForm key={admin.username} admin={admin} data={data} onClose={onClose} onReload={onReload} /> : null}
    </FormModal>
  );
}

/* ---------- reseller grant and conversion ---------- */

function GrantForm({ admin, data, convert, onClose, onReload }: ModalProps & { admin: AdminRow; data: AdminsData; convert: boolean }) {
  const plans = data.plans.grant;
  const passwordReady = Boolean(admin.web.password_ready);
  const [draft, setDraft] = useState<GrantDraft>({
    plan_id: data.plans.grant_default_id === null ? "" : String(data.plans.grant_default_id),
    web_password: "",
    note: "",
    allow_volume_oversell: false,
    confirm_billing_mode_change: false,
  });
  const { pending, track } = usePending();
  const set = (patch: Partial<GrantDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const needsPassword = !convert || !passwordReady;
  const canSubmit = plans.length > 0 && /^\d+$/.test(draft.plan_id);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (needsPassword && !draft.web_password) {
      toast.danger("رمز عبور وب‌پنل الزامی است.");
      return;
    }
    const options = { canToggleOversell: data.can_toggle_oversell };
    const path = adminPath(admin.username, convert ? "convert-to-reseller" : "web-access/reseller");
    const fields = convert ? convertFields(draft, options) : resellerFields(admin.username, draft, options);
    void track(async () => {
      const result = await run(path, fields, { success: convert ? "ادمین فرعی به نماینده تبدیل شد." : "دسترسی نماینده فعال شد.", refresh: onReload });
      if (result?.ok) onClose();
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <AdminIntro username={admin.username}>
        {convert
          ? "دسترسی «ادمین فرعی» حذف می‌شود و مسیر «نماینده» (پنل ربات + فروشگاه) جایگزین می‌شود. هر ادمین فقط یکی از این دو مسیر را می‌تواند داشته باشد. محدودیت‌های نقش پاسارگارد و پلن نمایندگی همچنان اعمال می‌شوند."
          : "منوی پاسارگارد از نقش ادمین؛ فروشگاه/ربات از پلن نمایندگی. اگر این ادمین قبلاً ادمین فرعی باشد، ابتدا آن دسترسی را حذف کنید."}
      </AdminIntro>
      <UsageLine admin={admin} />
      {!plans.length ? <Notice tone="warning">هنوز پلن نمایندگی فعالی ندارید — ابتدا از بخش نمایندگان یک پلن بسازید.</Notice> : null}
      <PlanSelect
        label="پلن نمایندگی"
        value={draft.plan_id}
        onChange={(plan_id) => set({ plan_id })}
        plans={plans}
        tagged
        withDuration
        placeholderLabel="— انتخاب پلن —"
        help={convert ? "دسترسی‌های داشبورد، پلن، سفارش، تنظیمات ربات و… از این پلن می‌آید" : "دسترسی‌های داشبورد، پلن، سفارش، تنظیمات ربات و… از این پلن کپی می‌شود"}
      />
      {convert ? <SwitchInput label="تأیید تغییر نوع پرداخت" help="فقط اگر این ادمین از قبل نماینده است و نوع پلن جدید فرق دارد" checked={draft.confirm_billing_mode_change} onChange={(confirm_billing_mode_change) => set({ confirm_billing_mode_change })} /> : null}
      {data.can_toggle_oversell ? <SwitchInput label={OVERSELL_LABEL} help={OVERSELL_HELP} checked={draft.allow_volume_oversell} onChange={(allow_volume_oversell) => set({ allow_volume_oversell })} /> : null}
      <Notice tone="warning">{CAPACITY_WARNING}</Notice>
      {convert ? null : <TextInput label="نام کاربری وب‌پنل" value={admin.username.toLowerCase()} onChange={() => undefined} readOnly ltr help="باید دقیقاً همان نام ادمین پاسارگارد باشد" />}
      <TextInput
        label={convert ? "رمز عبور مشترک" : "رمز عبور وب‌پنل"}
        type="password"
        value={draft.web_password}
        onChange={(web_password) => set({ web_password })}
        required={needsPassword}
        ltr
        placeholder={convert ? (passwordReady ? "خالی = استفاده از رمز ذخیره‌شده" : "رمز الزامی است") : "رمز قوی"}
        help={convert ? "رمز وب و پاسارگارد یکی است. اگر رمز ذخیره‌شده دارید، خالی بگذارید (کلید API به‌تنهایی کافی نیست)." : PASSWORD_RULE}
      />
      <TextInput label="یادداشت" value={draft.note} onChange={(note) => set({ note })} placeholder={convert ? "تبدیل از ادمین فرعی" : "نماینده فروش"} help={convert ? undefined : "اختیاری"} />
      <Actions submit={convert ? "تبدیل به نماینده" : "اعطای دسترسی نماینده"} pending={pending} canSubmit={canSubmit} onCancel={onClose} />
    </form>
  );
}

export function ResellerGrantModal({ admin, data, convert, onClose, onReload }: ModalProps & { admin: AdminRow | null; data: AdminsData; convert: boolean }) {
  return (
    <FormModal
      isOpen={admin !== null}
      onOpenChange={(next) => !next && onClose()}
      title={convert ? "تبدیل به نماینده" : "اعطای دسترسی نماینده (فروشگاه)"}
      description="مدیریت نمایندگی"
    >
      {admin ? <GrantForm key={`${admin.username}-${convert}`} admin={admin} data={data} convert={convert} onClose={onClose} onReload={onReload} /> : null}
    </FormModal>
  );
}

/* ---------- delete ---------- */

function DeleteForm({ admin, onClose, onReload }: ModalProps & { admin: AdminRow }) {
  const [reason, setReason] = useState("");
  const { pending, track } = usePending();
  const clean = reason.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (clean.length < REASON_MIN) return;
    void track(async () => {
      const result = await run(adminPath(admin.username, "delete"), { reason: clean }, { success: "حذف شد.", refresh: onReload });
      if (result?.ok) onClose();
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <TextAreaInput label="علت حذف" value={reason} onChange={setReason} rows={3} help={`حداقل ${REASON_MIN.toLocaleString("fa-IR")} کاراکتر`} />
      <Actions submit="حذف" pending={pending} canSubmit={clean.length >= REASON_MIN} onCancel={onClose} danger />
    </form>
  );
}

/** Deleting an admin asks for a reason (the old page's confirm with a reason box). */
export function DeleteAdminModal({ admin, onClose, onReload }: ModalProps & { admin: AdminRow | null }) {
  const copy = admin ? deleteCopy(admin.username, admin.web.source) : null;
  return (
    <FormModal isOpen={admin !== null} onOpenChange={(next) => !next && onClose()} title={copy?.title ?? ""} description={copy?.text} size="md">
      {admin ? <DeleteForm key={admin.username} admin={admin} onClose={onClose} onReload={onReload} /> : null}
    </FormModal>
  );
}
