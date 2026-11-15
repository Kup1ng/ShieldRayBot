"use client";

import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { toman } from "../../core/format";
import { FormGrid, FormModal, FormSection, SelectInput, SwitchInput, TextInput } from "../../ui/Fields";
import { Loadable, Notice } from "../../ui/States";
import { RiskTagPicker } from "../users/RiskTagChip";
import { FormActions } from "./Actions";
import type { ChildCreateOptions, CreateOptions, OwnerCreateOptions } from "./types";

const OPTIONS_PATH = "/api/panel/resellers/create-options";

const planLabel = (plan: OwnerCreateOptions["plans"][number]): string => {
  const payg = plan.billing_mode === "payg";
  const rate = payg && plan.price_per_gb ? ` · ${toman(plan.price_per_gb)} / گیگ` : "";
  return `${payg ? "[PAYG]" : "[ثابت]"} ${plan.name}${rate}`;
};

/** A Telegram id typed as digits; the server checks the rest. */
export const telegramIdOk = (raw: string): boolean => /^\d{1,15}$/.test(raw.trim());

function OwnerForm({ options, onDone, onClose }: { options: OwnerCreateOptions; onDone: () => void; onClose: () => void }) {
  const [telegramId, setTelegramId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [planId, setPlanId] = useState("");
  const [tag, setTag] = useState("green");
  const [perms, setPerms] = useState<Set<string>>(() => new Set(options.feature_perms.map((perm) => perm.key)));
  const [createAdmin, setCreateAdmin] = useState(true);
  const [sharePanel, setSharePanel] = useState(false);
  const [oversell, setOversell] = useState(false);
  const { pending, track } = usePending();
  const noPlans = options.plans.length === 0;

  const togglePerm = (key: string, on: boolean) =>
    setPerms((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void track(async () => {
      const result = await run(
        "/resellers",
        {
          telegram_id: telegramId.trim(),
          pg_role_id: roleId,
          plan_id: planId,
          color_tag: tag,
          ...Object.fromEntries([...perms].map((key) => [`perm_${key}`, true])),
          create_pg_admin: createAdmin,
          share_pg_panel_url: sharePanel,
          allow_volume_oversell: oversell,
        },
        { success: "نماینده فعال شد" },
      );
      if (result?.ok) {
        onDone();
        onClose();
      }
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-sm text-muted">بعد از ثبت، اطلاعات ورود در تلگرام فرستاده می‌شود. حالت پرداخت از پلن نمایندگی و دسترسی‌های پاسارگارد از نقش انتخاب‌شده می‌آید.</p>
      {noPlans ? (
        <Notice
          tone="warning"
          action={
            <a className="text-sm font-medium text-accent underline" href="/plans">
              پلن‌ها
            </a>
          }
        >
          هنوز پلن نمایندگی فعالی ندارید — ابتدا از بخش پلن‌ها یک پلن نماینده بسازید.
        </Notice>
      ) : null}
      <FormGrid>
        <TextInput label="آیدی عددی تلگرام" type="number" value={telegramId} onChange={setTelegramId} required ltr placeholder="123456789" help="مثال: 123456789" />
        <SelectInput
          label="نقش پاسارگارد"
          value={roleId}
          onChange={setRoleId}
          options={[{ id: "", label: "— از پلن —" }, ...options.roles.map((role) => ({ id: String(role.id), label: role.name }))]}
          help="خالی = نقش تعریف‌شده در پلن؛ در غیر این صورت این نقش جایگزین می‌شود"
        />
      </FormGrid>
      <SelectInput
        label="پلن نمایندگی"
        value={planId}
        onChange={setPlanId}
        disabled={noPlans}
        placeholder="— انتخاب پلن —"
        options={options.plans.map((plan) => ({ id: String(plan.id), label: planLabel(plan) }))}
        help="ثابت یا PAYG — نرخ گیگ و حالت پرداخت از همین پلن تنظیم می‌شود"
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">تگ ریسک</span>
        <RiskTagPicker tags={options.color_tags} value={tag} onChange={setTag} />
        <span className="text-xs text-muted">دیفالت «مطمئن» — فقط کارکنان می‌بینند</span>
      </div>
      <FormSection title="سطح دسترسی پنل ربات (وب = بات)" description="هر سوییچ هم‌زمان برای وب‌پنل و ربات اعمال می‌شود.">
        <div className="grid gap-3 sm:grid-cols-2">
          {options.feature_perms.map((perm) => (
            <SwitchInput key={perm.key} label={perm.label} checked={perms.has(perm.key)} onChange={(on) => togglePerm(perm.key, on)} />
          ))}
        </div>
      </FormSection>
      <div className="flex flex-col gap-3">
        <SwitchInput label="ساخت ادمین پاسارگارد" help="برای مالکیت کاربران لازم است — حتی اگر لینک پنل ارسال نشود" checked={createAdmin} onChange={setCreateAdmin} />
        <SwitchInput label="ارسال لینک و یوزر/رمز پنل پاسارگارد" help="اگر خاموش باشد، نماینده فقط از وب‌پنل ربات مدیریت می‌کند" checked={sharePanel} onChange={setSharePanel} />
        <SwitchInput
          label="اجازه فروش بیش از سقف حجم"
          help="خاموش: فروش این نماینده از سقف حجم اشتراکش بیشتر نمی‌شود. روشن: محدودیتی نیست. برای پلن PAYG اثری ندارد. بعداً از صفحهٔ ویرایش نماینده هم قابل تغییر است."
          checked={oversell}
          onChange={setOversell}
        />
      </div>
      <FormActions submitLabel="ذخیره و ارسال اطلاعات" pending={pending} disabled={noPlans || !telegramIdOk(telegramId) || !planId} onCancel={onClose} />
    </form>
  );
}

function ChildForm({ options, onDone, onClose }: { options: ChildCreateOptions; onDone: () => void; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [note, setNote] = useState("");
  const { pending, track } = usePending();
  const noRoles = options.roles.length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void track(async () => {
      const result = await run("/resellers/create-child", { pg_username: username.trim(), pg_password: password, pg_role_id: roleId, note: note.trim() }, { success: "نماینده ساخته شد" });
      if (result?.ok) {
        onDone();
        onClose();
      }
    });
  };

  return (
    <form className="flex flex-col gap-4" autoComplete="off" onSubmit={submit}>
      <p className="text-sm text-muted">نام کاربری و رمز پنل همان نام کاربری و رمز پاسارگارد است. نقش از پاسارگارد شما انتخاب می‌شود.</p>
      {noRoles ? <Notice tone="warning">نقشی از پاسارگارد شما خوانده نشد؛ بعداً دوباره تلاش کنید.</Notice> : null}
      <FormGrid>
        <TextInput label="نام کاربری پاسارگارد" value={username} onChange={setUsername} required ltr />
        <TextInput label="رمز پاسارگارد" type="password" value={password} onChange={setPassword} required ltr />
      </FormGrid>
      <SelectInput
        label="نقش پاسارگارد"
        value={roleId}
        onChange={setRoleId}
        placeholder="— انتخاب نقش زنده —"
        options={options.roles.map((role) => ({ id: String(role.id), label: role.name }))}
        help="فهرست زنده از پاسارگارد شما — نام نقش، سطح سازمان نیست."
      />
      <TextInput label="یادداشت (اختیاری)" value={note} onChange={setNote} maxLength={200} />
      <FormActions submitLabel="ساخت" pending={pending} disabled={noRoles || !username.trim() || !password || !roleId} onCancel={onClose} />
    </form>
  );
}

function CreateBody({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const options = useJson<CreateOptions>(OPTIONS_PATH);
  return (
    <Loadable state={options} rows={3}>
      {(data) => (data.mode === "owner" ? <OwnerForm options={data} onDone={onDone} onClose={onClose} /> : <ChildForm options={data} onDone={onDone} onClose={onClose} />)}
    </Loadable>
  );
}

/** «افزودن نماینده»: the platform owner grants a shop to a bot user; a representative creates a sub-representative. */
export function CreateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <FormModal isOpen={open} onOpenChange={(next) => !next && onClose()} title="افزودن نماینده" description="مدیریت نمایندگی" size="lg">
      {open ? <CreateBody onClose={onClose} onDone={onDone} /> : null}
    </FormModal>
  );
}
