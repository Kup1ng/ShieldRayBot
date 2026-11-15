"use client";

/** «ربات اختصاصی», «ظاهر و برند» and «لینک‌های سریع»: the tabs that are not a plain settings form. */

import { Button, toast } from "@heroui/react";
import { useRef, useState } from "react";

import { BrandMark } from "@/components/shell/BrandMark";
import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../../core/actions";
import { usePanelSession } from "../../../core/session";
import { Ltr } from "../../../ui/Data";
import { SubmitButton, TextInput } from "../../../ui/Fields";
import { GlassSection } from "../../../ui/Page";
import { Notice } from "../../../ui/States";
import type { BotExtra, BrandExtra, LinksExtra, ShopSettings } from "../types";

export type TabProps = { data: ShopSettings; reload: () => void };

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const BRAND_NAME_MAX = 40;
const LINK_LABELS: [string, string][] = [
  ["renew", "تمدید"],
  ["wallet", "کیف پول"],
  ["support", "پشتیبانی"],
  ["config", "دریافت مجدد کانفیگ"],
  ["gift", "کد هدیه"],
];

export function BotTab({ data, reload }: TabProps) {
  const extra = data.extra as BotExtra;
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const { pending, track } = usePending();
  const status = extra.status;
  const submit = () =>
    track(async () => {
      if (!token.trim()) {
        setError("توکن ربات الزامی است.");
        return;
      }
      setError("");
      const result = await run("/shop-settings?tab=bot", { BOT_TOKEN: token.trim() }, { success: "ربات متصل شد." });
      if (!result || result.ok) {
        setToken("");
        reload();
      }
    });
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <GlassSection title="ربات اختصاصی شما" description="توکن را از @BotFather بگیرید. پس از ذخیره، ربات شما بدون ری‌استارت کل سرور وصل می‌شود.">
        <TextInput
          label="توکن ربات"
          value={token}
          onChange={setToken}
          ltr
          required
          placeholder="123456:ABC..."
          help={
            <>
              فعلی: <Ltr>{extra.token_masked || "—"}</Ltr> · یوزرنیم: <Ltr>@{extra.username || "—"}</Ltr>
            </>
          }
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Notice tone={status.ok ? "success" : "warning"} title="وضعیت ربات">
          {status.ok ? (
            <>
              آنلاین · <Ltr>@{status.username || "—"}</Ltr> (id=<Ltr>{status.id ?? "—"}</Ltr>)
            </>
          ) : (
            status.error
          )}
        </Notice>
      </GlassSection>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>ذخیره و اتصال ربات</SubmitButton>
      </div>
    </form>
  );
}

export function BrandTab({ data, reload }: TabProps) {
  const extra = data.extra as BrandExtra;
  const { refresh } = usePanelSession();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(extra.name);
  const [file, setFile] = useState<File | null>(null);
  const [clear, setClear] = useState(false);
  const [error, setError] = useState("");
  const { pending, track } = usePending();

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > LOGO_MAX_BYTES) {
      setError("حجم لوگو حداکثر ۲ مگابایت باشد.");
      return;
    }
    setError("");
    setFile(picked);
    setClear(false);
  };
  const submit = () =>
    track(async () => {
      const result = await run("/panel-brand", { panel_brand_name: name, panel_brand_logo: file, panel_brand_logo_clear: clear }, { success: "برند پنل ذخیره شد." });
      if (!result || result.ok) {
        setFile(null);
        setClear(false);
        reload();
        void refresh();
      }
    });
  const shownName = name.trim() || extra.effective_name;
  const logoNote = extra.has_own_logo ? "" : extra.platform_logo ? "لوگوی پلتفرم نمایش داده می‌شود" : "لوگوی پیش‌فرض نمایش داده می‌شود";
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <GlassSection title="برند وب‌پنل" description="نام و لوگو بالای وب‌پنل فقط برای کارکنان فروشگاه شما نمایش داده می‌شود. هر مورد را خالی بگذارید تا برند پلتفرم نشان داده شود.">
        <div className="inset-tile flex items-center gap-3 rounded-lg p-3" aria-label="پیش‌نمایش هدر">
          <BrandMark logoUrl={clear ? null : extra.logo_url} name={shownName} size={40} />
          <span className="flex min-w-0 flex-col">
            <strong dir="auto" className="truncate text-sm text-foreground">
              {shownName}
            </strong>
            <small className="text-xs text-muted">پیش‌نمایش هدر</small>
          </span>
        </div>
        <TextInput label="نام برند" value={name} onChange={setName} maxLength={BRAND_NAME_MAX} placeholder="نام پلتفرم" help={`حداکثر ${BRAND_NAME_MAX.toLocaleString("fa-IR")} کاراکتر — خالی = نام پلتفرم`} />
        <div className="flex flex-col gap-2">
          <strong className="text-sm font-medium text-foreground">لوگو</strong>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="sr-only" aria-label="انتخاب لوگو" onChange={(event) => pick(event.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onPress={() => input.current?.click()}>
              <Icon name="solar:upload-linear" size={18} />
              انتخاب لوگو
            </Button>
            <span className="text-xs text-muted">{file ? file.name : "فایلی انتخاب نشده"}</span>
            {extra.has_own_logo && !clear ? (
              <Button size="sm" variant="ghost" className="text-danger" onPress={() => setClear(true)}>
                حذف لوگو
              </Button>
            ) : null}
            {clear ? <span className="text-xs text-muted">لوگو با ذخیره حذف می‌شود.</span> : null}
            {logoNote ? <span className="text-xs text-muted">{logoNote}</span> : null}
          </div>
          <p className="text-xs text-muted">PNG، JPG یا WebP — حداکثر ۲ مگابایت. لوگو در قاب مربع ۴۰ پیکسلی هدر، بدون برش و با همان نسبت نمایش داده می‌شود. پس‌زمینهٔ شفاف توصیه می‌شود.</p>
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </GlassSection>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>ذخیره برند</SubmitButton>
      </div>
    </form>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LinksTab({ data }: TabProps) {
  const extra = data.extra as LinksExtra;
  const copy = async (label: string, text: string) => {
    if (await copyText(text)) toast.success(`لینک ${label} کپی شد.`);
    else toast.danger("کپی انجام نشد؛ لینک را دستی انتخاب کنید.");
  };
  return (
    <GlassSection
      title="لینک‌های سریع ربات"
      description={extra.bot_username ? <>ربات: <Ltr>@{extra.bot_username}</Ltr> — لینک را برای کاربر بفرستید تا مستقیم وارد همان بخش شود.</> : undefined}
    >
      {!extra.bot_username ? <Notice title="یوزرنیم ربات مشخص نیست">اول اتصال ربات را در تب «ربات اختصاصی» درست کنید.</Notice> : null}
      <ul className="flex flex-col gap-3">
        {LINK_LABELS.map(([key, label]) => {
          const link = extra.links[key];
          return (
            <li key={key} className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <input readOnly dir="ltr" value={link || "—"} aria-label={`لینک ${label}`} className="inset-tile min-w-0 flex-1 rounded-lg px-3 py-2 text-start text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus" />
                {link ? (
                  <Button size="sm" variant="outline" aria-label={`کپی لینک ${label}`} onPress={() => void copy(label, link)}>
                    <Icon name="solar:copy-linear" size={18} />
                    کپی
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </GlassSection>
  );
}
