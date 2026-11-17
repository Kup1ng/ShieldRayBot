"use client";

import { Button, Chip, Input, Label, TextField, toast } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { useJson } from "../../core/data";
import { formatDate, formatDateTime } from "../../core/format";
import { usePanelSession } from "../../core/session";
import { Ltr } from "../../ui/Data";
import { GlassSection } from "../../ui/Page";
import { LoadingBlock, Notice } from "../../ui/States";
import { answerError, postForm } from "../../settings-ui/rawPost";

const STATUS_PATH = "/service-import/status";
const TEST_PATH = "/service-import/test";
const REQUESTS_PATH = "/service-import/requests";
const MAX_LINK_LENGTH = 2048;
const OUTCOME_LABELS: Record<string, string> = {
  added: "اضافه شد",
  upgraded: "اضافه شد",
  already_yours: "از قبل در لیست",
  refused: "رد شد",
  invalid: "لینک نامعتبر",
  error: "خطای پنل",
  pending: "نیمه‌تمام",
};

type Status = {
  ok: boolean;
  error?: string;
  platform?: boolean;
  login?: string;
  signed_in_as?: string;
  identity_ok?: boolean;
  admins?: string[];
  paths?: string[];
  attempts?: Array<{ at: string; customer: number; name: string; outcome: string; label: string }>;
};
type TestResult = { ok: boolean; path?: string; panel_username?: string; already_attached?: boolean; label?: string; reason?: string; owner_admin?: string; error?: string };
type PendingRequest = { id: number; customer: number; customer_name: string; panel_username: string; expires_at: string };

function ConnectionTile({ tone, title, lines }: { tone: "success" | "danger"; title: string; lines: string[] }) {
  return (
    <div className="inset-tile flex min-w-40 flex-1 flex-col gap-1 rounded-lg p-3" role="listitem">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Chip size="sm" color={tone} variant="soft">
          <Chip.Label>{tone === "success" ? "سالم" : "مشکل"}</Chip.Label>
        </Chip>
        {title}
      </span>
      {lines.map((line) => (
        <Ltr key={line} className="text-xs text-muted">
          {line}
        </Ltr>
      ))}
    </div>
  );
}

function StatusSection({ status, onRefresh, loading }: { status: Status; onRefresh: () => void; loading: boolean }) {
  const identityTone = status.identity_ok ? "success" : "danger";
  return (
    <GlassSection
      title="وضعیت اتصال"
      description="ربات با کدام ادمین پاسارگارد وارد پنل می‌شود و لینک با چه مسیر و ادمینی پذیرفته می‌شود."
      actions={
        <Button variant="outline" size="sm" onPress={onRefresh} isPending={loading}>
          <Icon name="solar:refresh-linear" size={16} />
          بررسی مجدد
        </Button>
      }
    >
      <div role="list" aria-live="polite" className="flex flex-wrap gap-3">
        {!status.ok ? (
          <ConnectionTile tone="danger" title="اتصال به پنل" lines={[status.error || "نامشخص"]} />
        ) : (
          <>
            {status.platform ? <ConnectionTile tone={identityTone} title="ورود ربات به پنل" lines={[`${status.login === "api_key" ? "کلید API" : "رمز عبور"} · ${status.signed_in_as || "نامشخص"}`]} /> : null}
            <ConnectionTile tone={identityTone} title="ادمین‌های مجاز" lines={status.admins?.length ? status.admins : ["هیچ ادمینی مجاز نیست"]} />
            <ConnectionTile tone="success" title="مسیرهای مجاز لینک" lines={status.paths?.length ? status.paths : ["—"]} />
          </>
        )}
      </div>
    </GlassSection>
  );
}

function LinkTest() {
  const { session } = usePanelSession();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const test = async () => {
    const value = link.trim();
    if (!value || busy) return;
    setBusy(true);
    const answer = await postForm<TestResult>(TEST_PATH, { link: value }, session.csrf_token);
    setBusy(false);
    setLink("");
    setResult(answer.body && "ok" in answer.body ? answer.body : { ok: false, label: "بررسی ناموفق بود؛ دوباره تلاش کنید" });
  };

  return (
    <GlassSection title="تست لینک" description="لینک اشتراک یک مشتری را بچسبانید تا ببینید پذیرفته می‌شود یا نه و دلیل رد را بدانید. چیزی اضافه یا ذخیره نمی‌شود.">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void test();
        }}
      >
        <TextField className="min-w-0 flex-1" value={link} onChange={setLink} autoComplete="off">
          <Label>لینک اشتراک</Label>
          <Input dir="ltr" className="text-start" maxLength={MAX_LINK_LENGTH} spellCheck={false} />
        </TextField>
        <Button type="submit" isPending={busy} className="button--ink !h-10">
          بررسی لینک
        </Button>
      </form>
      <div role="status" aria-live="polite">
        {result ? (
          result.ok ? (
            <Notice tone="success" title="این لینک پذیرفته می‌شود">
              {[`مسیر ${result.path ?? ""}`, result.panel_username ? `کاربر پنل: ${result.panel_username}` : "", result.already_attached ? "این سرویس همین حالا به یک مشتری وصل است" : ""].filter(Boolean).join(" — ")}
            </Notice>
          ) : (
            <Notice tone="danger" title="رد می‌شود">
              {[result.label || result.reason || "نامشخص", result.owner_admin ? `ادمین مالک سرویس: ${result.owner_admin}` : ""].filter(Boolean).join(" — ")}
            </Notice>
          )
        ) : null}
      </div>
    </GlassSection>
  );
}

function RequestRow({ row, onDecide, busy }: { row: PendingRequest; onDecide: (id: number, action: "approve" | "reject") => void; busy: boolean }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2 pe-3">
        {row.customer_name ? `${row.customer_name} · ` : ""}
        <Ltr>{row.customer}</Ltr>
      </td>
      <td className="py-2 pe-3">
        <Ltr>{row.panel_username}</Ltr>
      </td>
      <td className="py-2 pe-3 text-muted">{formatDate(row.expires_at)}</td>
      <td className="flex gap-2 py-2">
        <Button size="sm" className="button--ink" isDisabled={busy} onPress={() => onDecide(row.id, "approve")}>
          تأیید
        </Button>
        <Button size="sm" variant="outline" isDisabled={busy} onPress={() => onDecide(row.id, "reject")}>
          رد
        </Button>
      </td>
    </tr>
  );
}

function PendingRequests() {
  const { session } = usePanelSession();
  const requests = useJson<{ ok: boolean; requests: PendingRequest[] }>(REQUESTS_PATH);
  const [busy, setBusy] = useState(false);
  // Staff without the approval permission get a refusal: the card then stays out of the page.
  if (!requests.data) return null;
  const decide = async (id: number, action: "approve" | "reject") => {
    setBusy(true);
    const answer = await postForm<{ ok?: boolean; error?: string }>(`${REQUESTS_PATH}/${id}/${action}`, {}, session.csrf_token);
    setBusy(false);
    if (!answer.body?.ok) toast.danger(answerError(answer));
    requests.reload();
  };
  const rows = requests.data.requests;
  return (
    <GlassSection title="درخواست‌های در انتظار">
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 pe-3 text-start font-medium">مشتری</th>
                <th className="pb-2 pe-3 text-start font-medium">کاربر پنل</th>
                <th className="pb-2 pe-3 text-start font-medium">انقضا</th>
                <th className="pb-2 text-start font-medium">تصمیم</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RequestRow key={row.id} row={row} onDecide={(rowId, action) => void decide(rowId, action)} busy={busy} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">درخواستی در انتظار نیست</p>
      )}
    </GlassSection>
  );
}

function Attempts({ attempts }: { attempts: NonNullable<Status["attempts"]> }) {
  return (
    <GlassSection title="آخرین تلاش‌های مشتریان">
      {attempts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 pe-3 text-start font-medium">زمان</th>
                <th className="pb-2 pe-3 text-start font-medium">مشتری</th>
                <th className="pb-2 pe-3 text-start font-medium">نتیجه</th>
                <th className="pb-2 text-start font-medium">علت</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((item, index) => (
                <tr key={`${item.at}-${index}`} className="border-t border-border">
                  <td className="py-2 pe-3">{formatDateTime(item.at)}</td>
                  <td className="py-2 pe-3">
                    {item.name ? `${item.name} · ` : ""}
                    <Ltr>{item.customer}</Ltr>
                  </td>
                  <td className="py-2 pe-3">{OUTCOME_LABELS[item.outcome] ?? item.outcome}</td>
                  <td className="py-2 text-muted">{item.label || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">هنوز تلاشی ثبت نشده</p>
      )}
    </GlassSection>
  );
}

/** Live status, a link test, pending approvals and recent tries of «افزودن سرویس قبلی» (existing JSON endpoints). */
export function ServiceImportPanel() {
  const [refresh, setRefresh] = useState(0);
  const status = useJson<Status>(`${STATUS_PATH}${refresh ? "?refresh=1" : ""}`, { keepPrevious: true });
  return (
    <>
      {status.data ? (
        <StatusSection status={status.data} onRefresh={() => (refresh ? status.reload() : setRefresh(1))} loading={status.status === "loading"} />
      ) : status.status === "error" ? (
        <Notice tone="danger" title="بارگذاری وضعیت ناموفق بود">
          {status.message}
        </Notice>
      ) : (
        <LoadingBlock rows={2} />
      )}
      <LinkTest />
      <PendingRequests />
      {status.data?.attempts ? <Attempts attempts={status.data.attempts} /> : null}
    </>
  );
}
