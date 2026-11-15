"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { usePanelSession } from "../../core/session";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { SectionTabs } from "../../ui/SectionTabs";
import { Loadable } from "../../ui/States";
import { credentialError, USERNAME_MAX, type CredentialFields } from "./credentials";
import type { SecurityData } from "./types";

const PANEL_TABS = [
  { key: "general", href: "/settings?tab=general", label: "عمومی" },
  { key: "backup", href: "/settings?tab=backup", label: "بکاپ" },
  { key: "pwa", href: "/settings?tab=pwa", label: "ظاهر و برند" },
  { key: "ssl", href: "/settings?tab=ssl", label: "دامنه‌ها" },
  { key: "update", href: "/settings?tab=update", label: "آپدیت" },
  { key: "security", href: "/security", label: "امنیت" },
];

function PasswordField({ name, label, hint, value, onChange, autoComplete }: { name: string; label: string; hint: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <TextField name={name} type={shown ? "text" : "password"} isRequired value={value} onChange={onChange} autoComplete={autoComplete}>
      <Label>{label}</Label>
      <div className="relative">
        <Input dir="ltr" className="w-full pe-11 text-start" placeholder="••••••••" />
        <button
          type="button"
          aria-label={shown ? "مخفی کردن رمز" : "نمایش رمز"}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
          className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-lg text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Icon name={shown ? "solar:eye-closed-linear" : "solar:eye-linear"} size={20} />
        </button>
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </TextField>
  );
}

function CredentialsForm({ data, onSaved }: { data: SecurityData; onSaved: () => void }) {
  const { refresh } = usePanelSession();
  const [fields, setFields] = useState<CredentialFields>({ old_username: "", current_password: "", new_username: "", new_password: "" });
  const { pending, track } = usePending();
  const [error, setError] = useState("");
  const set = (key: keyof CredentialFields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const problem = credentialError(fields);
    setError(problem);
    if (problem) return;
    await track(async () => {
      const result = await run("/security/credentials", {
        old_username: fields.old_username.trim(),
        current_password: fields.current_password,
        new_username: fields.new_username.trim(),
        new_password: fields.new_password,
      });
      if (!result) return;
      if (result.ok) {
        setFields({ old_username: "", current_password: "", new_username: "", new_password: "" });
        onSaved();
        void refresh();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <form onSubmit={(event) => void submit(event)} autoComplete="off" noValidate id="security-credentials-form">
      <GlassSection title="تغییر نام کاربری و رمز">
        <p className="text-sm leading-7 text-muted">
          یوزر فعلی: <Ltr className="font-semibold text-foreground">{data.username}</Ltr>. برای تغییر، یوزر و رمز قدیم را خودتان وارد کنید؛ سپس مقادیر جدید را بنویسید.{" "}
          {data.role === "reseller"
            ? "نام کاربری نماینده باید با قوانین پاسارگارد سازگار باشد (۳ تا ۱۲۸ کاراکتر؛ حروف انگلیسی، عدد و - _ @ .؛ بدون دو نماد پشت‌سرهم) و معمولاً حروف کوچک است. اگر ادمین پاسارگارد دارید، یوزر باید همان یوزر پاسارگارد بماند و تغییر رمز هر دو پنل را یکی می‌کند."
            : "نام کاربری باید با قوانین پاسارگارد سازگار باشد: ۳ تا ۱۲۸ کاراکتر؛ فقط حروف انگلیسی، عدد و - _ @ .؛ بدون دو نماد پشت‌سرهم."}{" "}
          رمز جدید طبق پاسارگارد: حداقل ۱۲ کاراکتر، دو رقم، دو حرف بزرگ، دو حرف کوچک و یک کاراکتر خاص.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField name="old_username" isRequired value={fields.old_username} onChange={set("old_username")} autoComplete="off">
            <Label>یوزر قدیم</Label>
            <Input dir="ltr" className="text-start" placeholder="user_name" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={USERNAME_MAX} />
            <p className="text-xs text-muted">همان نام کاربری فعلی ورود</p>
          </TextField>
          <PasswordField name="current_password" label="رمز قدیم" hint="رمز فعلی پنل" value={fields.current_password} onChange={set("current_password")} autoComplete="current-password" />
          <TextField name="new_username" isRequired value={fields.new_username} onChange={set("new_username")} autoComplete="off">
            <Label>یوزر جدید</Label>
            <Input dir="ltr" className="text-start" placeholder="new_user" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={USERNAME_MAX} />
            <p className="text-xs text-muted">فقط حروف انگلیسی، عدد و _</p>
          </TextField>
          <PasswordField
            name="new_password"
            label="رمز جدید"
            hint="حداقل ۱۲ کاراکتر، دو رقم، دو حرف بزرگ/کوچک و کاراکتر خاص"
            value={fields.new_password}
            onChange={set("new_password")}
            autoComplete="new-password"
          />
        </div>
        {error ? (
          <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <Icon name="solar:danger-circle-bold" size={18} />
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" isPending={pending} className="button--ink !h-12 !rounded-lg px-8">
            ذخیره تغییرات
          </Button>
        </div>
      </GlassSection>
    </form>
  );
}

function SecurityContent() {
  const security = useJson<SecurityData>("/api/panel/security");
  return (
    <>
      <PageHeader icon="solar:shield-keyhole-bold" tone="green" title="تنظیمات وب پنل" description="نام کاربری و رمز ورود حساب شما" />
      <Loadable state={security} rows={3} height="h-24">
        {(data) => (
          <div className="flex flex-col gap-6">
            {data.show_panel_tabs ? <SectionTabs label="تب‌های تنظیمات وب پنل" items={PANEL_TABS} active="security" /> : null}
            <GlassSection title={data.identity_help.title}>
              <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-7 text-muted">
                {data.identity_help.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </GlassSection>
            <CredentialsForm data={data} onSaved={security.reload} />
          </div>
        )}
      </Loadable>
    </>
  );
}

export function SecurityPage() {
  return (
    <PanelShell title="امنیت">
      <SecurityContent />
    </PanelShell>
  );
}
