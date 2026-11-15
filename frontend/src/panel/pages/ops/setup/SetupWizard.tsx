"use client";

/** The first-run setup wizard: a standalone page (no panel session exists yet). */

import { Button, Checkbox, Label, toast } from "@heroui/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppToastProvider } from "@/components/feedback/AppToast";
import { BrandMark } from "@/components/shell/BrandMark";
import { CrystalBackdrop } from "@/components/shell/CrystalBackdrop";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Icon } from "@/icons/Icon";

import { panelAction } from "../../../core/api";
import { useJson, useQuery } from "../../../core/data";
import { Ltr, StatusChip } from "../../../ui/Data";
import { SubmitButton, TextInput } from "../../../ui/Fields";
import { Notice, ErrorBlock, LoadingBlock } from "../../../ui/States";
import type { SetupAudit, SetupData } from "../types";
import { adminError, botError, CAPTIONS, clampStep, LAST_STEP, loginUrlAfterSetup, otherError, STEP_COUNT } from "./setupLogic";

const PROBE_STEPS = ["اتصال به پاسارگارد", "خواندن نقش و مجوزها", "خواندن سقف‌ها", "آماده‌سازی منوها"];
const PROBE_TICK_MS = 420;
const PROBE_FILL = [18, 42, 68, 86];

function Card({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {lead ? <p className="text-sm leading-7 text-muted">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Actions({ onBack, pending, next = "ادامه" }: { onBack?: () => void; pending?: boolean; next?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {onBack ? (
        <Button variant="outline" className="!h-12 !rounded-lg" onPress={onBack}>
          قبلی
        </Button>
      ) : (
        <span />
      )}
      <SubmitButton pending={pending}>{next}</SubmitButton>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      <Icon name="solar:danger-circle-bold" size={18} />
      {message}
    </p>
  );
}

/** A comma-separated list of numeric Telegram ids, edited as chips. */
function IdListInput({ label, ids, onChange, help }: { label: string; ids: string[]; onChange: (ids: string[]) => void; help: string }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    const value = draft.trim().replace(/^0+(?=\d)/, "");
    if (!value) {
      setError("مقدار را وارد کنید.");
    } else if (!/^\d+$/.test(value)) {
      setError("آیدی باید یک عدد صحیح مثبت باشد.");
    } else if (ids.includes(value)) {
      setError("این مقدار قبلاً در فهرست وجود دارد.");
    } else {
      setError("");
      onChange([...ids, value]);
      setDraft("");
    }
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <strong className="text-sm font-medium text-foreground">{label}</strong>
      {ids.length ? (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li key={id}>
              <StatusChip color="default">
                <Ltr>{id}</Ltr>
                <button type="button" aria-label={`حذف ${id}`} className="ms-1 align-middle" onClick={() => onChange(ids.filter((x) => x !== id))}>
                  <Icon name="solar:close-circle-linear" size={14} />
                </button>
              </StatusChip>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-2">
        <TextInput label="افزودن آیدی" value={draft} onChange={setDraft} ltr placeholder="123456789" className="flex-1" />
        <Button variant="outline" className="!h-10" onPress={add}>
          افزودن
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <p className="text-xs text-muted">{help}</p>
    </div>
  );
}

type StepProps = { data: SetupData; go: (step: number) => void; reload: () => void; error: string; setError: (message: string) => void };

/** Post one step; true when the server accepted it (otherwise its message is shown). */
async function postStep(path: string, fields: Record<string, string | boolean>, setError: (message: string) => void): Promise<boolean> {
  try {
    const result = await panelAction(path, fields);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    return true;
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    return false;
  }
}

function AdminStep({ data, go, reload, error, setError }: StepProps) {
  const [username, setUsername] = useState(data.values.username);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = adminError({ username, password, password_confirm: confirmation });
    setError(problem);
    if (problem) return;
    setPending(true);
    const ok = await postStep("/setup/admin", { username: username.trim(), password, password_confirm: confirmation }, setError);
    setPending(false);
    if (ok) {
      reload();
      go(2);
    }
  };
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
      <Card title="۱ · مدیر پنل" lead="حداقل ۱۲ کاراکتر، شامل حداقل دو رقم، دو حرف بزرگ، دو حرف کوچک و یک کاراکتر خاص.">
        <TextInput label="نام کاربری" value={username} onChange={setUsername} ltr required placeholder="admin" help="حروف انگلیسی، عدد و _ — بعداً قابل تغییر است" />
        <TextInput label="رمز عبور" value={password} onChange={setPassword} type="password" ltr required />
        <TextInput label="تکرار رمز عبور" value={confirmation} onChange={setConfirmation} type="password" ltr required />
        <ErrorLine message={error} />
      </Card>
      <Actions onBack={() => go(0)} pending={pending} />
    </form>
  );
}

function BotStep({ data, go, reload, error, setError }: StepProps) {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState(data.values.bot_username);
  const [ids, setIds] = useState(() => data.values.admin_ids.split(/[,،\s]+/).filter(Boolean));
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = botError({ bot_token: token, bot_username: username, admin_ids: ids }, data.has_bot_token);
    setError(problem);
    if (problem) return;
    setPending(true);
    const ok = await postStep("/setup/bot", { bot_token: token.trim(), bot_username: username.trim(), admin_ids: ids.join(",") }, setError);
    setPending(false);
    if (ok) {
      reload();
      go(3);
    }
  };
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
      <Card title="۲ · ربات تلگرام">
        <TextInput
          label="توکن ربات (BOT_TOKEN)"
          value={token}
          onChange={setToken}
          ltr
          required={!data.has_bot_token}
          placeholder={data.has_bot_token ? "•••••••••• (برای تغییر، مقدار جدید وارد کنید)" : ""}
          help={data.has_bot_token ? "قبلاً ذخیره شده — برای حفظ همان توکن، این فیلد را خالی بگذارید." : undefined}
        />
        <TextInput label="نام کاربری ربات (بدون @)" value={username} onChange={setUsername} ltr required placeholder="MyShopBot" />
        <IdListInput label="آیدی ادمین‌ها" ids={ids} onChange={setIds} help="آیدی هر ادمین را جداگانه اضافه کنید." />
        <ErrorLine message={error} />
      </Card>
      <Actions onBack={() => go(1)} pending={pending} />
    </form>
  );
}

function ProbeProgress() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => Math.min(n + 1, PROBE_STEPS.length - 1)), PROBE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <Card title="بررسی سطح دسترسی" lead="نقش، مجوزها و سقف‌های حساب پاسارگارد در حال خواندن است.">
      <div className="h-2 overflow-hidden rounded-full bg-surface-secondary" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${PROBE_FILL[tick]}%` }} />
      </div>
      <ol className="flex flex-col gap-2 text-sm" aria-live="polite">
        {PROBE_STEPS.map((label, index) => (
          <li key={label} className={index <= tick ? "text-foreground" : "text-muted"}>
            {index < tick ? "✓ " : index === tick ? "… " : ""}
            {label}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function OtherStep({ data, go, reload, error, setError }: StepProps) {
  const v = data.values;
  const [fields, setFields] = useState({ pg_base_url: v.pg_base_url, pg_subscription_path: v.pg_subscription_path || "/sub", pg_username: v.pg_username, pg_password: "", pg_api_key: "", web_port: v.web_port || "9000", public_base_url: v.public_base_url, currency: v.currency || "تومان" });
  const [clearKey, setClearKey] = useState(false);
  const [probing, setProbing] = useState(false);
  const set = (key: keyof typeof fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = otherError(fields, data.has_pg_password);
    setError(problem);
    if (problem) return;
    setProbing(true);
    const ok = await postStep("/setup/other", { ...fields, clear_pg_api_key: clearKey }, setError);
    setProbing(false);
    if (ok) {
      reload();
      go(LAST_STEP);
    }
  };
  if (probing) return <ProbeProgress />;
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
      <Card title="۳ · پاسارگارد و وب">
        <TextInput label="آدرس پاسارگارد (PG_BASE_URL)" value={fields.pg_base_url} onChange={set("pg_base_url")} ltr required placeholder="https://panel.example.com:8443/base" help="با پورت و path وارد کنید — مثال: https://panel.example.com:8443/base · ریشه API — نه مسیر داشبورد (/shieldray)" />
        <TextInput label="مسیر سابسکریپشن" value={fields.pg_subscription_path} onChange={set("pg_subscription_path")} ltr maxLength={128} placeholder="/sub/" help="فقط مسیر لینک اشتراک؛ مثل /sub/ یا /apilog/، بدون دامنه و توکن." />
        <TextInput label="نام کاربری پاسارگارد" value={fields.pg_username} onChange={set("pg_username")} ltr required placeholder="pg_user" help="یوزر همان ادمین متصل در پاسارگارد (لزوماً owner نیست)" />
        <TextInput
          label="رمز پاسارگارد"
          value={fields.pg_password}
          onChange={set("pg_password")}
          type="password"
          ltr
          required={!data.has_pg_password && !data.has_pg_api_key}
          placeholder={data.has_pg_password ? "خالی بماند تا رمز فعلی حفظ شود" : ""}
          help={data.has_pg_password ? "قبلاً ذخیره شده — برای حفظ همان رمز، این فیلد را خالی بگذارید." : "رمز یا کلید API — حداقل یکی لازم است"}
        />
        <TextInput
          label="کلید API پاسارگارد"
          value={fields.pg_api_key}
          onChange={set("pg_api_key")}
          type="password"
          ltr
          placeholder={data.has_pg_api_key ? "خالی بماند تا کلید فعلی حفظ شود" : "اختیاری — کلید API از پنل پاسارگارد"}
          help={
            <>
              ترجیح بر رمز برای فراخوانی API (هدر <Ltr>X-Api-Key</Ltr>). {data.has_pg_api_key ? <StatusChip color="success">کلید API ذخیره‌شده</StatusChip> : null}
            </>
          }
        />
        {data.has_pg_api_key ? (
          <Checkbox isSelected={clearKey} onChange={setClearKey}>
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Label>حذف کلید API (بازگشت به احراز هویت با رمز)</Label>
            </Checkbox.Content>
          </Checkbox>
        ) : null}
        <TextInput label="پورت وب‌پنل (WEB_PORT)" value={fields.web_port} onChange={set("web_port")} ltr required />
        <TextInput label="آدرس عمومی (PUBLIC_BASE_URL) — اختیاری" value={fields.public_base_url} onChange={set("public_base_url")} ltr placeholder="https://bot.example.com" />
        <TextInput label="واحد پول (CURRENCY)" value={fields.currency} onChange={set("currency")} required />
        <ErrorLine message={error} />
      </Card>
      <Actions onBack={() => go(2)} />
    </form>
  );
}

function AuditCard({ audit }: { audit: SetupAudit }) {
  if (!audit.ok) return audit.error ? <Notice title="بررسی دسترسی انجام نشد">{audit.error}</Notice> : null;
  return (
    <div className="inset-tile flex flex-col gap-3 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip color={audit.pg_is_owner ? "success" : "warning"}>{audit.account_label}</StatusChip>
        {audit.username ? <Ltr className="text-sm text-foreground">{audit.username}</Ltr> : null}
        {audit.role_name ? <span className="text-sm text-muted">{audit.role_name}</span> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <small className="text-xs text-muted">منوی پاسارگارد</small>
        {audit.features.length ? (
          <div className="flex flex-wrap gap-1.5">
            {audit.features.map((feature) => (
              <StatusChip key={feature} color="default">
                {feature}
              </StatusChip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">هیچ بخش پاسارگارد برای این نقش فعال نیست.</p>
        )}
      </div>
      {audit.limits.length ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          {audit.limits.map((row) => (
            <div key={row.label} className="flex flex-col rounded-lg bg-surface px-3 py-2">
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd className="num text-sm font-semibold text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <ul className="flex flex-col gap-1 text-sm">
        <li className={audit.can_manage_representatives ? "text-success" : "text-muted"}>{audit.can_manage_representatives ? "ساخت نماینده / ادمین مجاز است" : "ساخت نماینده و ادمین دیگر مجاز نیست"}</li>
        <li className="text-success">فروشگاه این نصب کامل است (پلن، سفارش، تنظیمات)</li>
      </ul>
    </div>
  );
}

function CopyBlock({ label, value, buttonLabel }: { label: string; value: string; buttonLabel: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("کپی شد.");
    } catch {
      toast.danger("کپی انجام نشد — متن را دستی انتخاب کنید.");
    }
  };
  return (
    <div className="inset-tile flex flex-col gap-1.5 rounded-lg p-3">
      <small className="text-xs text-muted">{label}</small>
      <code dir="ltr" className="break-all text-start text-sm text-foreground">
        {value}
      </code>
      <div>
        <Button size="sm" variant="outline" onPress={() => void copy()}>
          <Icon name="solar:copy-linear" size={16} />
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({ data, go }: { data: SetupData; go: (step: number) => void }) {
  const [entering, setEntering] = useState(false);
  const enter = async () => {
    setEntering(true);
    const loginUrl = loginUrlAfterSetup(data.panel_url, data.finish_login_url, data.https_ready);
    try {
      // The panel restarts right after this answer, so a lost reply is expected and harmless.
      await fetch("/setup/finish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ next: loginUrl }).toString(),
        redirect: "manual",
      });
    } catch (err) {
      console.debug("setup finish reply lost", err);
    }
    window.location.replace(loginUrl);
  };
  return (
    <div className="flex flex-col gap-4">
      <Card title="۴ · سطح دسترسی" lead="خلاصه نقش پاسارگارد برای این نصب — منوها از همین سطح زنده می‌آیند.">
        {data.access_audit ? <AuditCard audit={data.access_audit} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyBlock label="آدرس پنل" value={data.panel_url} buttonLabel="کپی آدرس پنل" />
          <CopyBlock label="ربات" value={`@${data.bot_username || "—"}`} buttonLabel="کپی آدرس ربات" />
        </div>
        <Notice>فایل env را امن نگه دارید. با زدن دکمه زیر، پنل و ربات به‌صورت خودکار ری‌استارت می‌شوند.</Notice>
      </Card>
      <div className="flex flex-col gap-2">
        <Button className="button--ink !h-12 !rounded-lg" fullWidth isPending={entering} onPress={() => void enter()}>
          ورود به پنل
        </Button>
        <Button variant="ghost" onPress={() => go(3)}>
          قبلی
        </Button>
      </div>
    </div>
  );
}

function Steps({ data, step, go, reload }: { data: SetupData; step: number; go: (step: number) => void; reload: () => void }) {
  const [error, setError] = useState("");
  const move = (next: number) => {
    setError("");
    go(next);
  };
  const props = { data, go: move, reload, error, setError };
  if (step === 0) {
    return (
      <Card title="خوش آمدید" lead="چند مرحله کوتاه برای تنظیم مدیر، ربات و اتصال پاسارگارد. فقط با تکمیل هر مرحله می‌توانید ادامه دهید.">
        <Button className="button--ink !h-12 !rounded-lg" onPress={() => move(1)}>
          شروع
        </Button>
      </Card>
    );
  }
  if (step === 1) return <AdminStep {...props} />;
  if (step === 2) return <BotStep {...props} />;
  if (step === 3) return <OtherStep {...props} />;
  return <DoneStep data={data} go={move} />;
}

function Wizard() {
  // The address carries the step (?step=2); the export renders without a location, the browser supplies it.
  const query = useQuery();
  const step = clampStep(query.get("step"));
  const state = useJson<SetupData>(`/setup/data?step=${step >= LAST_STEP ? LAST_STEP : 0}`, { keepPrevious: true });
  const go = (next: number) => query.set({ step: String(next) }, { replace: true });
  const data = state.data;
  // A finished setup answers with a redirect (as JSON {location} through the panel fetch layer).
  useEffect(() => {
    if (data && !("values" in data)) window.location.assign("/");
  }, [data]);
  const ready = data && "values" in data ? data : null;
  return (
    <main className="glass flex flex-col gap-6 rounded-xl p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold text-foreground">راه‌اندازی اولیه</h1>
        <p className="text-sm text-muted">{CAPTIONS[step]}</p>
        {step < LAST_STEP ? (
          <div className="flex items-center gap-1.5" aria-label={`مرحله ${step + 1} از ${STEP_COUNT}`} role="img">
            {Array.from({ length: STEP_COUNT }, (_, index) => (
              <span key={index} className={`h-1.5 w-6 rounded-full ${index < step ? "bg-success" : index === step ? "bg-accent" : "bg-surface-secondary"}`} />
            ))}
          </div>
        ) : null}
      </div>
      {ready ? <Steps key={step} data={ready} step={step} go={go} reload={state.reload} /> : state.status === "error" ? <ErrorBlock message={state.message} onRetry={state.reload} /> : <LoadingBlock rows={4} />}
    </main>
  );
}

export function SetupWizard() {
  return (
    <>
      <CrystalBackdrop />
      <AppToastProvider />
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center gap-6 px-4 py-10">
        <div className="glass flex h-[72px] items-center justify-between rounded-xl px-6">
          <BrandMark name="ShieldRay" size={32} showName />
          <ThemeToggle />
        </div>
        <Wizard />
        <p className="text-center text-xs text-muted">
          © <bdi>ShieldRay</bdi> · شیلدری
        </p>
      </div>
    </>
  );
}
