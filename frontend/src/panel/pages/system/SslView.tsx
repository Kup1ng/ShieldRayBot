"use client";

import { Button, toast } from "@heroui/react";
import { useEffect, useState } from "react";

import { run } from "../../core/actions";
import { panelGet } from "../../core/api";
import { confirm } from "../../core/confirm";
import { useJson } from "../../core/data";
import { Ltr, StatusChip } from "../../ui/Data";
import { FormGrid, FormModal, SwitchInput, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Loadable, Notice } from "../../ui/States";
import { JobProgress } from "./JobProgress";
import { actionLabel, availableActions, safeHttpsBase, waitForHttps, type SslAction } from "./ssl";
import type { SslPayload, SslProgress } from "./types";
import { useServiceRestart } from "./useServiceRestart";

const SAVE_URL = "/settings?tab=ssl";
const PROGRESS_URL = "/settings/ssl/progress";
const POLL_MS = 800;
const START_PROGRESS: SslProgress = { pct: 6, message: "در حال دریافت گواهی…", done: false, ok: null, restarting: false, https_url: "" };
const DISABLE_ASK = { title: "غیرفعال‌سازی HTTPS", text: "HTTPS غیرفعال شود؟ پنل با HTTP ری‌استارت می‌شود.", confirmLabel: "غیرفعال‌سازی", tone: "warning" } as const;

function CertificateStatus({ ssl }: { ssl: SslPayload }) {
  return (
    <GlassSection title="وضعیت گواهی">
      {ssl.has_cert ? (
        <div className="flex flex-wrap items-center gap-2">
          {ssl.ssl_enabled && !ssl.expired ? <StatusChip color="success">فعال · HTTPS</StatusChip> : ssl.expired ? <StatusChip color="danger">منقضی</StatusChip> : <StatusChip color="warning">صادر شده · منتظر فعال‌سازی</StatusChip>}
          {ssl.self_signed ? <StatusChip color="warning">موقت · خودامضا (IP)</StatusChip> : null}
          {ssl.domain ? <Ltr>{ssl.domain}</Ltr> : null}
          {ssl.miniapp_domain ? <Ltr>{ssl.miniapp_domain}</Ltr> : null}
        </div>
      ) : (
        <p className="text-sm text-muted">هنوز گواهی صادر نشده.</p>
      )}
      {ssl.has_cert && safeHttpsBase(ssl.public_https) ? (
        <p className="text-sm text-muted">
          آدرس HTTPS:{" "}
          <a className="text-accent underline-offset-4 hover:underline" href={safeHttpsBase(ssl.public_https)} target="_blank" rel="noopener noreferrer" dir="ltr">
            {ssl.public_https}
          </a>
        </p>
      ) : null}
      {ssl.has_cert && ssl.expires_at ? (
        <p className="text-sm text-muted">
          اعتبار تا: <Ltr>{ssl.expires_at}</Ltr>
        </p>
      ) : null}
      {ssl.has_cert && ssl.issued_at ? (
        <p className="text-sm text-muted">
          صدور: <Ltr>{ssl.issued_at}</Ltr>
        </p>
      ) : null}
      <h4 className="text-sm font-semibold text-foreground">مسیر فایل‌ها</h4>
      <pre dir="ltr" className="inset-tile overflow-x-auto rounded-lg p-3 text-xs">
        {`fullchain: ${ssl.cert_path}\nprivkey:   ${ssl.key_path}${ssl.letsencrypt_live ? `\nletsencrypt live: ${ssl.letsencrypt_live}` : ""}`}
      </pre>
      {ssl.last_error ? (
        <>
          <h4 className="text-sm font-semibold text-foreground">آخرین خطا</h4>
          <pre dir="ltr" className="inset-tile overflow-x-auto whitespace-pre-wrap rounded-lg p-3 text-xs text-danger">
            {ssl.last_error}
          </pre>
        </>
      ) : null}
      <p className="text-sm text-muted">
        پورت پنل: <Ltr>{ssl.web_port}</Ltr>
        {ssl.mode ? (
          <>
            {" "}
            · حالت: <Ltr>{ssl.mode}</Ltr>
          </>
        ) : null}
      </p>
      <p className="text-xs leading-6 text-muted">
        ۱) DNS دامنه ← IP سرور · ۲) پورت <Ltr>80</Ltr> آزاد · ۳) دریافت گواهی (HTTPS خودکار فعال می‌شود) · ۴) ورود با آدرس HTTPS بالا (پورت <Ltr>{ssl.web_port}</Ltr>)
      </p>
    </GlassSection>
  );
}

function HttpsReadyDialog({ base, onClose }: { base: string | null; onClose: () => void }) {
  return (
    <FormModal isOpen={base !== null} onOpenChange={(open) => (open ? undefined : onClose())} title="گواهی SSL فعال شد" description="دریافت گواهی و فعال‌سازی HTTPS با موفقیت انجام شد. از این لحظه پنل روی آدرس امن دامنه در دسترس است." size="md">
      {base ? <p className="text-sm text-muted"><Ltr>{base}</Ltr></p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onPress={onClose}>
          بمان در تنظیمات
        </Button>
        <a href={`${base || ""}/home`} className="button button--ink inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium">
          ورود به پنل (HTTPS)
        </a>
      </div>
    </FormModal>
  );
}

function SslContent({ ssl, reload }: { ssl: SslPayload; reload: () => void }) {
  const [domain, setDomain] = useState(ssl.pending_domain || ssl.domain);
  const [email, setEmail] = useState(ssl.pending_email || ssl.email);
  const ownMiniapp = ssl.pending_miniapp_domain || ssl.miniapp_domain;
  const [sameDomain, setSameDomain] = useState(!ownMiniapp);
  const [miniappDomain, setMiniappDomain] = useState(ownMiniapp);
  const [tracking, setTracking] = useState(ssl.running || !ssl.progress.done);
  const [progress, setProgress] = useState<SslProgress>(ssl.progress);
  const [posting, setPosting] = useState(false);
  const [httpsTarget, setHttpsTarget] = useState<string | null>(null);
  const [readyBase, setReadyBase] = useState<string | null>(null);
  const restart = useServiceRestart(() => {
    toast.success("HTTPS غیرفعال شد و سرویس دوباره بالا آمد.");
    reload();
  });

  useEffect(() => {
    if (!tracking) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const next = await panelGet<SslProgress>(PROGRESS_URL);
        if (cancelled) return;
        setProgress(next);
        if (!next.done) return;
        setTracking(false);
        if (next.restarting) setHttpsTarget(safeHttpsBase(next.https_url));
        else if (next.ok) toast.success(next.message || "گواهی آماده شد");
        else toast.danger(next.message || "عملیات SSL ناموفق بود");
        if (!next.restarting) reload();
      } catch (err) {
        console.debug("ssl progress not read", err);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tracking, reload]);

  useEffect(() => {
    if (httpsTarget === null) return;
    const controller = new AbortController();
    void waitForHttps(httpsTarget, { signal: controller.signal }).then(() => {
      if (controller.signal.aborted) return;
      setHttpsTarget(null);
      setReadyBase(httpsTarget);
    });
    return () => controller.abort();
  }, [httpsTarget]);

  const waitingHttps = httpsTarget !== null;
  const busy = tracking || waitingHttps || posting || restart.waiting || ssl.running;

  const submit = async (action: SslAction) => {
    if (action !== "disable" && (!domain.trim() || !email.trim())) {
      toast.danger("دامنه و ایمیل را وارد کنید.");
      return;
    }
    if (action === "disable" && !(await confirm(DISABLE_ASK.title, { description: DISABLE_ASK.text, confirmLabel: DISABLE_ASK.confirmLabel, tone: DISABLE_ASK.tone }))) return;
    setPosting(true);
    const boot = action === "disable" ? await restart.baseline() : null;
    const result = await run(SAVE_URL, { action, domain, acme_email: email, miniapp_same_domain: sameDomain, miniapp_domain: miniappDomain }, { success: "انجام شد." });
    setPosting(false);
    if (!result?.ok) {
      reload();
      return;
    }
    if (action === "issue" || action === "renew") {
      setProgress({ ...START_PROGRESS, message: action === "renew" ? "در حال تمدید…" : START_PROGRESS.message });
      setTracking(true);
    } else if (action === "enable") setTracking(true);
    else restart.begin(boot);
  };

  const shownProgress = tracking || waitingHttps ? progress : null;
  return (
    <div className="flex flex-col gap-5">
      <GlassSection title="دامنهٔ پنل وب" description="دامنهٔ پنل را وارد کنید. پس از دریافت موفق گواهی SSL، HTTPS به‌صورت خودکار فعال می‌شود. تا قبل از آن همه آدرس‌ها با http باز می‌شوند.">
        <Notice tone={ssl.certbot ? "success" : "warning"}>
          {ssl.certbot ? (
            <>certbot آماده است{ssl.certbot_path ? <>: <Ltr>{ssl.certbot_path}</Ltr></> : null}</>
          ) : (
            "certbot نصب نیست — با «دریافت گواهی» خودکار نصب می‌شود."
          )}
          {ssl.port80_busy ? <> <strong>هشدار:</strong> پورت ۸۰ الان اشغال است — قبل از دریافت، آن را آزاد کنید.</> : null}
        </Notice>
        {shownProgress ? (
          <JobProgress
            label="پیشرفت دریافت گواهی"
            percent={shownProgress.pct}
            stepLabel={shownProgress.message || "در حال آماده‌سازی…"}
            message={waitingHttps ? "HTTPS فعال شد — در انتظار راه‌اندازی مجدد سرویس…" : undefined}
            tone={shownProgress.ok === false ? "danger" : "accent"}
            stay={false}
          />
        ) : null}
        {restart.waiting ? <Notice tone="warning">{restart.note}</Notice> : null}
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void submit("issue");
          }}
          aria-label="دامنه و گواهی SSL"
        >
          <FormGrid>
            <TextInput
              className="sm:col-span-2"
              label="دامنهٔ پنل"
              value={domain}
              onChange={setDomain}
              ltr
              required
              placeholder="bot.example.com"
              disabled={busy}
              help={
                <>
                  DNS باید به IP همین سرور اشاره کند
                  {ssl.pending_domain && ssl.domain && ssl.pending_domain !== ssl.domain ? (
                    <>
                      {" "}
                      — در حال دریافت برای <Ltr>{ssl.pending_domain}</Ltr>؛ تا موفقیت، دامنهٔ فعال همان <Ltr>{ssl.domain}</Ltr> می‌ماند.
                    </>
                  ) : null}
                </>
              }
            />
            <TextInput className="sm:col-span-2" label="ایمیل Let's Encrypt" type="text" value={email} onChange={setEmail} ltr required placeholder="admin@example.com" disabled={busy} help="برای اعلان انقضا — عمومی نمی‌شود." />
          </FormGrid>
          <section className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-label="مینی‌اپ">
            <h4 className="text-sm font-semibold text-foreground">مینی‌اپ</h4>
            <p className="text-xs leading-5 text-muted">
              مینی‌اپ تلگرام می‌تواند روی دامنهٔ جدای خودش باز شود (مثلاً <Ltr>app.example.com</Ltr>). هر دو دامنه روی یک گواهی SSL قرار می‌گیرند و با همان دکمهٔ پایین صادر می‌شوند؛ دکمهٔ «Open» ربات و ربات‌های فروشگاه نمایندگان خودکار به آدرس جدید می‌روند.
            </p>
            <SwitchInput label="همان دامنهٔ پنل" help="روشن = مینی‌اپ روی دامنهٔ پنل باز می‌شود و فیلد زیر نادیده گرفته می‌شود." checked={sameDomain} onChange={setSameDomain} disabled={busy} />
            <TextInput
              label="دامنهٔ مینی‌اپ"
              value={miniappDomain}
              onChange={setMiniappDomain}
              ltr
              placeholder="app.example.com"
              disabled={busy}
              help={
                <>
                  DNS این دامنه هم باید به IP همین سرور اشاره کند. پس از تغییر، «صدور مجدد گواهی» را بزنید.
                  {ssl.pending_miniapp_domain && ssl.pending_miniapp_domain !== ssl.miniapp_domain ? (
                    <>
                      {" "}
                      در حال دریافت برای <Ltr>{ssl.pending_miniapp_domain}</Ltr> — تا موفقیت، آدرس فعلی مینی‌اپ می‌ماند.
                    </>
                  ) : null}
                </>
              }
            />
            {ssl.public_miniapp ? (
              <p className="text-sm text-muted">
                آدرس فعلی مینی‌اپ: <Ltr>{ssl.public_miniapp}</Ltr>
              </p>
            ) : null}
          </section>
          <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="عملیات گواهی">
            {availableActions(ssl).map((action) => (
              <Button
                key={action}
                type="button"
                isDisabled={busy}
                variant={action === "issue" || action === "enable" ? "primary" : action === "disable" ? "danger-soft" : "outline"}
                className={action === "issue" || action === "enable" ? "button--ink !h-12 !rounded-lg px-6 text-sm" : "!h-12 !rounded-lg px-6 text-sm"}
                onPress={() => void submit(action)}
              >
                {actionLabel(action, ssl)}
              </Button>
            ))}
          </div>
        </form>
      </GlassSection>
      <CertificateStatus ssl={ssl} />
      <HttpsReadyDialog base={readyBase} onClose={() => setReadyBase(null)} />
    </div>
  );
}

/** «دامنه و SSL»: panel and Mini App domains, Let's Encrypt issue/renew and HTTPS switch. */
export function SslView() {
  const state = useJson<SslPayload>("/api/panel/system/ssl");
  return (
    <Loadable state={state}>
      {(ssl) => <SslContent key={`${ssl.domain}|${ssl.pending_domain}|${ssl.miniapp_domain}|${ssl.ssl_enabled}|${ssl.has_cert}`} ssl={ssl} reload={state.reload} />}
    </Loadable>
  );
}
