"use client";

import { Chip, Modal, Spinner, toast } from "@heroui/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { confirm } from "../../core/confirm";
import { usePending } from "../../core/actions";
import { usePanelSession } from "../../core/session";
import { Ltr } from "../../ui/Data";
import { CheckInput, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";
import { SaveBar } from "../../settings-ui/GroupSections";
import type { TabProps } from "./GenericTab";
import { ListField } from "../../settings-ui/ListField";
import { DEFAULT_WEBHOOK_PATH, webhookPreview } from "./logic";
import { answerError, postForm } from "../../settings-ui/rawPost";
import { RESTART_HINT, STAY_WARNING, waitForRestart } from "../system/restart";
import type { BotExtra } from "./types";

const PATH = "/settings?tab=bot";
const RESTART_TIMEOUT_MS = 180_000;
const RESTART_CONFIRM = "برای اعمال این تغییرات سرویس یک‌بار ری‌استارت می‌شود. چند ثانیه قطعی طبیعی است؛ پیام‌های در صف تلگرام ممکن است از دست بروند. پس از تأیید در همین صفحه می‌مانید.";

type BotAnswer = { ok?: boolean; error?: string; message?: string; needs_restart?: boolean; restarting?: boolean; changed?: boolean; pre_boot_id?: string };

function RestartDialog({ open, message, error }: { open: boolean; message: string; error: string }) {
  return (
    <Modal.Backdrop isOpen={open} isDismissable={false} isKeyboardDismissDisabled variant="blur">
      <Modal.Container size="md">
        <Modal.Dialog className="!rounded-xl">
          <Modal.Header>
            <Modal.Heading>در حال اعمال تغییرات</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4 p-1" aria-live="polite">
            <Notice tone="warning">{STAY_WARNING}</Notice>
            {error ? (
              <Notice tone="danger" title="ری‌استارت کامل نشد">
                {error}
              </Notice>
            ) : (
              <p className="flex items-center gap-3 text-sm">
                <Spinner size="sm" />
                {message}
              </p>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function Overview({ extra, webhook, previewUrl }: { extra: BotExtra; webhook: boolean; previewUrl: string }) {
  const bot = extra.bot_status;
  return (
    <GlassSection title="وضعیت اتصال" description="وضعیت زنده ربات و روش دریافت پیام از تلگرام.">
      <div className="flex flex-wrap gap-3" role="list">
        <div className="inset-tile flex min-w-52 flex-1 items-center justify-between gap-3 rounded-lg p-3" role="listitem">
          <span className="flex flex-col">
            <span className="text-sm font-semibold">ربات</span>
            <Ltr className="text-xs text-muted">{bot.ok ? `@${bot.username || "—"}${bot.id ? ` · id=${bot.id}` : ""}` : bot.error || "آفلاین"}</Ltr>
          </span>
          <Chip size="sm" color={bot.ok ? "success" : "danger"} variant="soft">
            <Chip.Label>{bot.ok ? "متصل" : "قطع"}</Chip.Label>
          </Chip>
        </div>
        <div className="inset-tile flex min-w-52 flex-1 items-center justify-between gap-3 rounded-lg p-3" role="listitem">
          <span className="flex flex-col">
            <span className="text-sm font-semibold">دریافت پیام</span>
            <span className="text-xs text-muted">{webhook ? <>Webhook{previewUrl ? <> · <Ltr>{previewUrl}</Ltr></> : null}</> : "Long Polling"}</span>
          </span>
          <Chip size="sm" color={webhook ? "success" : "accent"} variant="soft">
            <Chip.Label>
              <bdi dir="ltr">{webhook ? "Webhook" : "Polling"}</bdi>
            </Chip.Label>
          </Chip>
        </div>
      </div>
    </GlassSection>
  );
}

/** Bot token, admins, update mode and the PasarGuard connection. A change that needs a restart is confirmed, then followed until the service is back. */
export function BotTab({ data, reload }: TabProps<BotExtra>) {
  const extra = data.extra as BotExtra;
  const { session } = usePanelSession();
  const [token, setToken] = useState("");
  const [username, setUsername] = useState(extra.bot_username);
  const [adminIds, setAdminIds] = useState(extra.admin_ids);
  const [webhook, setWebhook] = useState(extra.update_mode === "webhook");
  const [webhookUrl, setWebhookUrl] = useState(extra.webhook_url);
  const [webhookPath, setWebhookPath] = useState(extra.webhook_path);
  const [pgBase, setPgBase] = useState(extra.pg_base_url);
  const [pgSub, setPgSub] = useState(extra.pg_subscription_path);
  const [pgUser, setPgUser] = useState(extra.pg_username);
  const [pgPass, setPgPass] = useState("");
  const [pgKey, setPgKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [error, setError] = useState("");
  const [restart, setRestart] = useState<{ message: string; error: string } | null>(null);
  const { pending, track } = usePending();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const previewUrl = webhookPreview(webhookUrl, extra.public_base_url, webhookPath);
  const fields = (): Record<string, string> => ({
    BOT_TOKEN: token,
    BOT_USERNAME: username,
    ADMIN_IDS: adminIds,
    BOT_UPDATE_MODE: webhook ? "webhook" : "polling",
    WEBHOOK_URL: webhookUrl,
    WEBHOOK_PATH: webhookPath,
    PG_BASE_URL: pgBase,
    PG_SUBSCRIPTION_PATH: pgSub,
    PG_USERNAME: pgUser,
    PG_PASSWORD: pgPass,
    PG_API_KEY: pgKey,
    ...(clearKey ? { clear_pg_api_key: "1" } : {}),
  });
  const post = (extraFields: Record<string, string>) => postForm<BotAnswer>(PATH, { ...fields(), ajax: "1", ...extraFields }, session.csrf_token);

  const followRestart = async (preBootId: string) => {
    const controller = new AbortController();
    abort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), RESTART_TIMEOUT_MS);
    setRestart({ message: "ذخیره شد؛ منتظر راه‌اندازی مجدد سرویس…", error: "" });
    const health = await waitForRestart({ preBootId, signal: controller.signal, onState: (state) => setRestart({ message: state.message, error: "" }) });
    window.clearTimeout(timer);
    if (health) {
      setRestart(null);
      toast.success("تغییرات اعمال شد.");
      reload();
    } else if (controller.signal.aborted && abort.current === controller) {
      setRestart({ message: "", error: `ری‌استارت بیش از حد طول کشید. دستی بررسی کنید: ${RESTART_HINT}` });
    }
  };

  const apply = async (confirmRestart: boolean) => {
    const answer = await post({ confirm_restart: confirmRestart ? "1" : "0" });
    if (!answer.body?.ok) {
      const message = answerError(answer);
      setError(message);
      toast.danger(message);
      return;
    }
    if (answer.body.restarting) {
      await followRestart(answer.body.pre_boot_id ?? "");
      return;
    }
    toast.success(answer.body.message || "تغییرات اعمال شد.");
    reload();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      setError("");
      const checked = await post({ preview: "1" });
      if (!checked.body?.ok) {
        const message = answerError(checked);
        setError(message);
        toast.danger(message);
        return;
      }
      if (checked.body.needs_restart) {
        const sure = await confirm("تأیید ری‌استارت", { description: RESTART_CONFIRM, confirmLabel: "تأیید و ری‌استارت" });
        if (!sure) return;
        await apply(true);
      } else {
        await apply(false);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
      <Overview extra={extra} webhook={webhook} previewUrl={previewUrl} />
      {error ? (
        <Notice tone="danger" title="ذخیره انجام نشد">
          {error}
        </Notice>
      ) : null}
      <GlassSection title="ربات تلگرام" description="توکن و هویت ربات اصلی. تغییر این بخش معمولاً ری‌استارت می‌خواهد؛ قبل از اعمال تأیید می‌گیریم.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextInput
              label="توکن ربات (BOT_TOKEN)"
              type="password"
              ltr
              value={token}
              onChange={setToken}
              placeholder="توکن جدید"
              help={<>خالی بماند تا توکن فعلی حفظ شود{extra.token_masked ? <> · فعلی: <Ltr>{extra.token_masked}</Ltr></> : null}</>}
            />
          </div>
          <TextInput label="نام کاربری (بدون @)" value={username} onChange={setUsername} ltr required />
          <ListField label="آیدی ادمین‌ها" help="آیدی هر ادمین را جداگانه اضافه کنید." value={adminIds} onChange={setAdminIds} kind="telegram" placeholder="123456789" />
        </div>
      </GlassSection>
      <GlassSection title="دریافت پیام تلگرام" description="پیش‌فرض Long Polling است. Webhook برای بار بالاتر مناسب‌تر است و به HTTPS عمومی نیاز دارد.">
        <SwitchInput label="Webhook" help="تلگرام پیام‌ها را به آدرس HTTPS پنل می‌فرستد. خاموش = Long Polling (بدون دامنه عمومی)." checked={webhook} onChange={setWebhook} />
        {webhook ? (
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold">تنظیمات Webhook</h4>
            <p className="text-xs text-muted">آدرس پایه فقط ریشهٔ HTTPS است؛ مسیر جدا وارد می‌شود. سکرت به‌صورت خودکار ساخته می‌شود.</p>
            <TextInput label="آدرس پایه" value={webhookUrl} onChange={setWebhookUrl} ltr required placeholder="https://bot.example.com" help="اگر خالی باشد از «آدرس عمومی» پایین استفاده می‌شود" />
            <TextInput label="مسیر" value={webhookPath} onChange={setWebhookPath} ltr placeholder={DEFAULT_WEBHOOK_PATH} />
            <Notice tone="warning" title="آدرس نهایی">
              <Ltr>{previewUrl || "—"}</Ltr>
            </Notice>
          </div>
        ) : null}
      </GlassSection>
      <GlassSection title="پاسارگارد" description="آدرس اصلی API و مشخصات ادمین متصل را وارد کنید، نه آدرس داشبورد. این ادمین لازم نیست مالک پاسارگارد باشد.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextInput
              label="آدرس پنل (PG_BASE_URL)"
              value={pgBase}
              onChange={setPgBase}
              ltr
              required
              placeholder="https://panel.example.com:8443/base"
              help="با پورت و path وارد کنید — مثال: https://panel.example.com:8443/base. مسیرهایی مثل /dashboard فقط UI هستند و باعث خطای ۴۰۵ می‌شوند"
            />
          </div>
          <div className="sm:col-span-2">
            <TextInput
              label="مسیر سابسکریپشن"
              value={pgSub}
              onChange={setPgSub}
              ltr
              maxLength={128}
              placeholder="/sub/"
              help="مسیر لینک اشتراک در پاسارگارد؛ پیش‌فرض /sub/. اگر لینک شما با /apilog/ شروع می‌شود، همان مسیر را وارد کنید. آدرس دامنه و توکن را وارد نکنید."
            />
          </div>
          <TextInput label="نام کاربری" value={pgUser} onChange={setPgUser} ltr required help="یوزر همان ادمین متصل در پاسارگارد" />
          <TextInput label="رمز" type="password" ltr value={pgPass} onChange={setPgPass} placeholder="خالی بماند تا رمز فعلی حفظ شود" help="رمز یا کلید API — حداقل یکی لازم است" />
          <div className="sm:col-span-2">
            <TextInput
              label={
                <span className="flex items-center gap-2">
                  کلید API پاسارگارد
                  {extra.has_pg_api_key ? (
                    <Chip size="sm" color="success" variant="soft">
                      <Chip.Label>کلید API ذخیره‌شده</Chip.Label>
                    </Chip>
                  ) : null}
                </span>
              }
              type="password"
              ltr
              value={pgKey}
              onChange={setPgKey}
              placeholder={extra.has_pg_api_key ? "خالی بماند تا کلید فعلی حفظ شود" : "اختیاری — کلید API از پنل پاسارگارد"}
              help="ترجیح بر رمز برای فراخوانی API (هدر X-Api-Key). کلید را در پاسارگارد برای همین ادمین بسازید."
            />
          </div>
          {extra.has_pg_api_key ? (
            <div className="sm:col-span-2">
              <CheckInput label="حذف کلید API (بازگشت به احراز هویت با رمز)" checked={clearKey} onChange={setClearKey} />
            </div>
          ) : null}
        </div>
      </GlassSection>
      <SaveBar label="ذخیره تنظیمات" pending={pending} />
      <RestartDialog open={restart !== null} message={restart?.message ?? ""} error={restart?.error ?? ""} />
    </form>
  );
}
