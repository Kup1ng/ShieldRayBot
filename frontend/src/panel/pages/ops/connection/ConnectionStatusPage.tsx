"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../../core/actions";
import { useJson, useQuery, useUrlFlash } from "../../../core/data";
import { fa } from "../../../core/format";
import { PanelShell } from "../../../layout/PanelShell";
import { StatusChip } from "../../../ui/Data";
import { SelectInput, SubmitButton, TextInput } from "../../../ui/Fields";
import { GlassSection, PageHeader, StatTile } from "../../../ui/Page";
import { EmptyBlock, Loadable, Notice } from "../../../ui/States";
import type { ConnectionStatus, MonitorHost, MonitorHosts, MonitorTarget } from "../types";

const BASE = "/connection-status";
const DONE = "انجام شد. نتیجه‌های جدید بعد از اجرای تست نمایش داده می‌شوند.";
const NAME_MAX = 64;
const ORDER_MAX = 2147483647;
const USERNAME_MIN = 3;
const USERNAME_MAX = 128;
const VISIBILITY = [
  { id: "0", label: "فقط ادمین" },
  { id: "1", label: "کاربران ربات هم ببینند" },
];

function TestUserCard({ data, reload }: { data: ConnectionStatus; reload: () => void }) {
  const [username, setUsername] = useState(data.settings.username);
  const [error, setError] = useState("");
  const { pending, track } = usePending();
  const submit = () =>
    track(async () => {
      const name = username.trim();
      if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
        setError("نام کاربری باید بین ۳ تا ۱۲۸ نویسه باشد.");
        return;
      }
      setError("");
      const result = await run(`${BASE}/account`, { username: name }, { ask: { title: "ثبت کاربر تست", text: "ثبت کاربر تست، تست‌های فعلی را متوقف و کانفیگ‌ها را از فهرست کاربران مخفی می‌کند. ادامه می‌دهید؟", confirmLabel: "ثبت" }, success: DONE });
      if (result) reload();
    });
  return (
    <GlassSection title="کاربر تست" actions={<StatusChip color={data.settings.has_account ? "success" : "default"}>{data.settings.has_account ? "تنظیم شده" : "تنظیم نشده"}</StatusChip>}>
      <p className="text-sm leading-7 text-muted">یک کاربر فعال در پاسارگارد انتخاب کنید که مال هیچ مشتری نباشد. لازم نیست حساب مالک باشد؛ فقط ربات باید به آن دسترسی داشته باشد.</p>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextInput label="نام کاربری در پاسارگارد" value={username} onChange={setUsername} ltr required maxLength={USERNAME_MAX} placeholder="MattDev" help="فقط نام کاربری را بنویسید؛ رمز عبور، توکن یا لینک اشتراک وارد نکنید." />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <SubmitButton pending={pending}>ثبت کاربر تست</SubmitButton>
        </div>
      </form>
    </GlassSection>
  );
}

function RuntimeCard({ data, reload }: { data: ConnectionStatus; reload: () => void }) {
  const { settings, binary_configured: ready } = data;
  const { pending, track } = usePending();
  const toggle = () =>
    track(async () => {
      const ask = settings.enabled ? { title: "توقف تست‌ها", text: "تست‌ها متوقف و همهٔ کانفیگ‌ها از فهرست کاربران مخفی می‌شوند. ادامه می‌دهید؟", confirmLabel: "توقف", tone: "danger" as const } : undefined;
      const result = await run(`${BASE}/runtime`, { enabled: settings.enabled ? "0" : "1" }, { ask, success: DONE });
      if (result) reload();
    });
  return (
    <GlassSection title="تست خودکار" actions={<StatusChip color={settings.enabled ? "success" : "default"}>{settings.enabled ? "روشن" : "خاموش"}</StatusChip>}>
      <p className="text-sm leading-7 text-muted">بعد از ثبت کاربر تست و انتخاب کانفیگ‌ها، تست‌ها را روشن کنید. بررسی تقریباً هر دقیقه انجام می‌شود و «تازه‌سازی» فقط آخرین نتیجه را نشان می‌دهد.</p>
      {!ready ? (
        <Notice title="هستهٔ Xray هنوز آماده نیست">
          نصب و آپدیت با اسکریپت آن را خودکار آماده می‌کند. برای نصب قبلی یا تلاش دوباره، روی سرور این دستور را اجرا کنید:
          <code className="mt-2 block rounded-lg bg-surface-secondary px-3 py-2 text-start text-xs" dir="ltr">
            bash pgclock.sh xray
          </code>
        </Notice>
      ) : (
        <p className="text-sm text-muted">هستهٔ Xray تنظیم شده است؛ معتبر بودن فایل هنگام شروع تست‌ها بررسی می‌شود.</p>
      )}
      <div>
        <Button className={settings.enabled ? "!h-12 !rounded-lg bg-danger text-danger-foreground" : "button--ink !h-12 !rounded-lg"} isPending={pending} isDisabled={!settings.enabled && (!settings.has_account || !ready)} onPress={() => void toggle()}>
          {settings.enabled ? "توقف تست‌ها" : "شروع تست‌ها"}
        </Button>
      </div>
      <small className="text-xs text-muted">روشن کردن دوبارهٔ تست‌ها، کانفیگ‌ها را خودکار به کاربران نشان نمی‌دهد.</small>
    </GlassSection>
  );
}

function HostRow({ host, onAdd }: { host: MonitorHost; onAdd: () => void }) {
  return (
    <li className="inset-tile flex flex-wrap items-center gap-3 rounded-lg p-3">
      <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold" aria-label={`ردیف ${fa(host.position + 1)}`}>
        {fa(host.position + 1)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h4 className="truncate text-sm font-semibold text-foreground">
          <bdi dir="auto">{host.name}</bdi>
        </h4>
        <div className="flex flex-wrap items-center gap-1.5" dir="ltr" aria-label="پروتکل و نوع اتصال">
          <StatusChip color="accent">{host.protocol}</StatusChip>
          <StatusChip color="default">{host.transport}</StatusChip>
          {host.security ? <StatusChip color="default">{host.security}</StatusChip> : null}
          {host.port ? <span className="text-xs text-muted">port {host.port}</span> : null}
        </div>
        <p className="text-xs text-muted">{host.issue || "آمادهٔ انتخاب · ابتدا فقط ادمین نتیجه را می‌بیند"}</p>
      </div>
      {host.issue ? (
        <Button size="sm" variant="outline" isDisabled>
          قابل تست نیست
        </Button>
      ) : (
        <Button size="sm" variant="outline" aria-label={`افزودن ${host.name} به تست`} onPress={onAdd}>
          افزودن به تست
        </Button>
      )}
    </li>
  );
}

function HostPicker({ hasAccount, reload }: { hasAccount: boolean; reload: () => void }) {
  const query = useQuery();
  const open = query.get("hosts") === "1";
  const offset = Number(query.get("host_after")) || 0;
  const state = useJson<MonitorHosts>(open && hasAccount ? `/api/panel/connection-status/hosts?offset=${offset}` : null, { keepPrevious: true });
  const add = async (host: MonitorHost) => {
    const result = await run(`${BASE}/configs/${host.config_key}`, {}, { success: DONE });
    if (result) reload();
  };
  return (
    <GlassSection title="انتخاب کانفیگ‌های اشتراک" description="نام و ترتیب کانفیگ‌ها مثل اشتراک کاربر تست است. کانفیگ تازه اول فقط برای ادمین دیده می‌شود. در هر دور حداکثر ۱۲ کانفیگ تست می‌شود.">
      {!hasAccount ? (
        <small className="text-sm text-muted">ابتدا کاربر تست را ثبت کنید.</small>
      ) : (
        <div>
          <Button variant="outline" onPress={() => query.set({ hosts: "1", host_after: null })}>
            <Icon name="solar:refresh-linear" size={18} />
            دریافت کانفیگ‌ها از اشتراک
          </Button>
        </div>
      )}
      {open && hasAccount ? (
        <Loadable state={state} rows={3}>
          {(hosts) => (
            <>
              {hosts.error ? <Notice title="دریافت کانفیگ‌ها انجام نشد">{hosts.error}</Notice> : null}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <StatusChip color="default">{fa(hosts.total_count)} کانفیگ</StatusChip>
                به ترتیب اشتراک · جزئیات اتصال بدون نمایش اطلاعات محرمانه
              </div>
              {hosts.choices.length ? (
                <ol className="flex flex-col gap-2" aria-label="کانفیگ‌های اشتراک">
                  {hosts.choices.map((host) => (
                    <HostRow key={host.config_key} host={host} onAdd={() => void add(host)} />
                  ))}
                </ol>
              ) : hosts.error ? null : (
                <p className="text-sm text-muted">کانفیگ دیگری در اشتراک پیدا نشد.</p>
              )}
              {hosts.next_offset ? (
                <div>
                  <Button variant="outline" onPress={() => query.set({ host_after: String(hosts.next_offset) })}>
                    کانفیگ‌های بعدی
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Loadable>
      ) : null}
    </GlassSection>
  );
}

function TargetCard({ target, monitorOn, reload }: { target: MonitorTarget; monitorOn: boolean; reload: () => void }) {
  const [name, setName] = useState(target.public_name);
  const [order, setOrder] = useState(String(target.display_order));
  const [visibility, setVisibility] = useState(target.is_public ? "1" : "0");
  const { pending, track } = usePending();
  const title = target.public_name || target.config_name || `کانفیگ قبلی ${fa(target.id)}`;
  const post = async (action: string, fields: Record<string, string>, options: Parameters<typeof run>[2] = {}) => {
    const result = await run(`${BASE}/targets/${target.id}${action}`, fields, { success: DONE, ...options });
    if (result) reload();
  };
  const save = () =>
    track(async () => {
      const value = Number(order);
      if (!Number.isInteger(value) || value < 0 || value > ORDER_MAX) return;
      await post("", { public_name: name, display_order: String(value), is_public: visibility });
    });
  const remove = (text: string) => post("/delete", {}, { ask: { title: "تأیید حذف کانفیگ", text, confirmLabel: "حذف کانفیگ", tone: "danger" } });
  return (
    <GlassSection title={<bdi dir="auto">{title}</bdi>} actions={<StatusChip color={target.status_color}>{target.status_label}</StatusChip>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon="solar:bolt-linear" tone="blue" label="تأخیر واقعی" value={target.delay_ms !== null ? <>{fa(target.delay_ms)} <span className="text-xs font-normal">میلی‌ثانیه</span></> : "—"} />
        <StatTile icon="solar:clock-circle-linear" tone="purple" label="آخرین تست" value={<span className="text-sm">{target.checked_text}</span>} />
        <StatTile icon="solar:routing-2-linear" tone="green" label="مسیرهای بررسی‌شده" value={`${fa(target.covered)} از ${fa(target.expected)}`} />
      </div>
      {target.reason_text ? <small className="text-xs text-muted">{target.reason_text}</small> : null}
      {target.manual_pending ? <Notice tone="accent">تست در صف است؛ نتیجه بعد از اجرا نمایش داده می‌شود.</Notice> : null}
      {target.test_enabled ? (
        <>
          <form
            className="grid gap-3 sm:grid-cols-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <TextInput label="نام نمایشی در ربات" value={name} onChange={setName} maxLength={NAME_MAX} placeholder="مثلاً سرور آلمان" />
            <TextInput label="ترتیب نمایش" value={order} onChange={setOrder} type="number" min={0} max={ORDER_MAX} required help="عدد کوچک‌تر بالاتر نمایش داده می‌شود." />
            <SelectInput label="چه کسی نتیجه را ببیند؟" value={visibility} onChange={setVisibility} options={VISIBILITY} help="نمایش به کاربران به نام نمایشی و تست خودکار روشن نیاز دارد." />
            <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
              <SubmitButton pending={pending}>ذخیرهٔ کانفیگ</SubmitButton>
              <Button variant="outline" className="!h-12 !rounded-lg" isDisabled={!monitorOn || target.manual_pending} onPress={() => void post("/check", {})}>
                تست الان
              </Button>
              <Button variant="outline" className="!h-12 !rounded-lg text-danger" onPress={() => void post("/pause", {}, { ask: { title: "توقف کانفیگ", text: "تست این کانفیگ متوقف و نتیجهٔ آن از فهرست کاربران مخفی می‌شود. ادامه می‌دهید؟", confirmLabel: "توقف", tone: "danger" } })}>
                توقف کانفیگ
              </Button>
              <Button variant="outline" className="!h-12 !rounded-lg text-danger" onPress={() => void remove("این کانفیگ از فهرست تست حذف شود؟ تست و نمایش عمومی آن متوقف می‌شود.")}>
                حذف
              </Button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {target.config_key ? (
            <Button
              variant="outline"
              onPress={async () => {
                const result = await run(`${BASE}/configs/${target.config_key}`, {}, { success: DONE });
                if (result) reload();
              }}
            >
              فعال‌سازی دوبارهٔ کانفیگ
            </Button>
          ) : (
            <small className="text-xs text-muted">این مورد از فهرست قدیمی هاست‌ها مانده است؛ کانفیگ را دوباره از اشتراک انتخاب کنید. نام نمایشی قبلی حفظ شده است.</small>
          )}
          <Button variant="outline" className="text-danger" onPress={() => void remove("این کانفیگ از فهرست تست حذف شود؟")}>
            حذف
          </Button>
        </div>
      )}
    </GlassSection>
  );
}

function Content() {
  const query = useQuery();
  useUrlFlash();
  const after = Number(query.get("after")) || 0;
  const state = useJson<ConnectionStatus>(`/api/panel/connection-status?after=${after}`, { keepPrevious: true });
  const { reload } = state;
  return (
    <>
      <PageHeader
        icon="solar:pulse-2-linear"
        tone="teal"
        title="وضعیت اتصال"
        description="تست خودکار اتصال کانفیگ‌ها از دید سرور ربات"
        actions={
          <Button variant="outline" onPress={reload}>
            <Icon name="solar:refresh-linear" size={18} />
            تازه‌سازی
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <Notice title="این قابلیت در حال توسعه است و هنوز کامل نشده است.">بعضی بخش‌ها ممکن است تغییر کنند یا درست کار نکنند؛ برای تصمیم مهم به نتیجه‌هایش تکیه نکنید.</Notice>
        <Notice tone="accent">این نتیجه فقط اتصال از سرور ربات را نشان می‌دهد و دسترسی کاربران داخل ایران را تأیید نمی‌کند.</Notice>
      </div>
      <Loadable state={state} rows={6}>
        {(data) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <TestUserCard key={data.settings.username} data={data} reload={reload} />
              <RuntimeCard data={data} reload={reload} />
            </div>
            <HostPicker hasAccount={data.settings.has_account} reload={reload} />
            {data.targets.length ? (
              data.targets.map((target) => <TargetCard key={`${target.id}:${target.status}:${target.public_name}:${target.display_order}:${target.is_public}`} target={target} monitorOn={data.settings.enabled} reload={reload} />)
            ) : (
              <GlassSection>
                <EmptyBlock title="هنوز کانفیگی برای تست انتخاب نشده است" description="از بخش «انتخاب کانفیگ‌های اشتراک» شروع کنید." />
              </GlassSection>
            )}
            {data.next_id ? (
              <div>
                <Button variant="outline" onPress={() => query.set({ after: String(data.next_id) })}>
                  نتیجه‌های بعدی
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Loadable>
    </>
  );
}

export function ConnectionStatusPage() {
  return (
    <PanelShell title="وضعیت اتصال">
      <Content />
    </PanelShell>
  );
}
