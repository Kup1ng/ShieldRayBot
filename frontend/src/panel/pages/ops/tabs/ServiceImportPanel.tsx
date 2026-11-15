"use client";

/** «افزودن سرویس قبلی»: live panel status, a link test, pending requests and the recent tries. */

import { Button, Table, toast } from "@heroui/react";
import { useState } from "react";

import { safeMessage } from "../../../core/api";
import { useJson } from "../../../core/data";
import { formatDateTime } from "../../../core/format";
import { usePanelSession } from "../../../core/session";
import { Ltr, StatusChip } from "../../../ui/Data";
import { TextInput } from "../../../ui/Fields";
import { GlassSection } from "../../../ui/Page";
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice } from "../../../ui/States";
import { postJson } from "../rawPost";

const STATUS_PATH = "/service-import/status";
const TEST_PATH = "/service-import/test";
const REQUESTS_PATH = "/service-import/requests";
const LINK_MAX = 2048;
const OUTCOME_LABELS: Record<string, string> = {
  added: "اضافه شد",
  upgraded: "اضافه شد",
  already_yours: "از قبل در لیست",
  refused: "رد شد",
  invalid: "لینک نامعتبر",
  error: "خطای پنل",
  pending: "نیمه‌تمام",
};

type Attempt = { at: string | null; customer: string; name?: string; outcome: string; label?: string };
type StatusData = { ok: boolean; error?: string; identity_ok?: boolean; platform?: boolean; login?: string; signed_in_as?: string; admins?: string[]; paths?: string[]; attempts?: Attempt[] };
type PendingRequest = { id: number; customer: string; customer_name?: string; panel_username: string; expires_at: string };
type LinkVerdict = { ok: boolean; path?: string; panel_username?: string; already_attached?: boolean; label?: string; reason?: string; owner_admin?: string };

function StatusTiles({ data }: { data: StatusData }) {
  if (!data.ok) return <Notice tone="danger" title="اتصال به پنل">{data.error || "نامشخص"}</Notice>;
  const tone = data.identity_ok ? "success" : "danger";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {data.platform ? (
        <div className="inset-tile flex flex-col gap-1 rounded-lg p-3">
          <StatusChip color={tone}>ورود ربات به پنل</StatusChip>
          <span className="text-sm text-foreground">
            {data.login === "api_key" ? "کلید API" : "رمز عبور"} · <Ltr>{data.signed_in_as || "نامشخص"}</Ltr>
          </span>
        </div>
      ) : null}
      <div className="inset-tile flex flex-col gap-1 rounded-lg p-3">
        <StatusChip color={tone}>ادمین‌های مجاز</StatusChip>
        <span className="text-sm text-foreground">{data.admins?.length ? data.admins.map((admin) => <Ltr key={admin} className="block">{admin}</Ltr>) : "هیچ ادمینی مجاز نیست"}</span>
      </div>
      <div className="inset-tile flex flex-col gap-1 rounded-lg p-3">
        <StatusChip color="success">مسیرهای مجاز لینک</StatusChip>
        <span className="text-sm text-foreground">{data.paths?.length ? data.paths.map((path) => <Ltr key={path} className="block">{path}</Ltr>) : "—"}</span>
      </div>
    </div>
  );
}

function LinkTest() {
  const { session } = usePanelSession();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<LinkVerdict | null>(null);
  const check = async () => {
    const text = link.trim();
    if (!text || busy) return;
    setBusy(true);
    const answer = await postJson(TEST_PATH, { link: text.slice(0, LINK_MAX) }, session.csrf_token);
    setBusy(false);
    setLink("");
    setVerdict(answer.ok === undefined && !answer.error ? { ok: false, label: "بررسی ناموفق بود؛ دوباره تلاش کنید" } : (answer as LinkVerdict));
  };
  return (
    <GlassSection title="تست لینک" description="لینک اشتراک یک مشتری را بچسبانید تا ببینید پذیرفته می‌شود یا نه و دلیل رد را بدانید. چیزی اضافه یا ذخیره نمی‌شود.">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <TextInput label="لینک اشتراک" value={link} onChange={setLink} ltr maxLength={LINK_MAX} />
        <div>
          <Button type="submit" variant="outline" isPending={busy}>
            بررسی لینک
          </Button>
        </div>
      </form>
      {verdict ? (
        <div role="status" aria-live="polite">
          {verdict.ok ? (
            <Notice tone="success" title="این لینک پذیرفته می‌شود">
              مسیر <Ltr>{verdict.path}</Ltr>
              {verdict.panel_username ? <> — کاربر پنل: <Ltr>{verdict.panel_username}</Ltr></> : null}
              {verdict.already_attached ? " — این سرویس همین حالا به یک مشتری وصل است" : null}
            </Notice>
          ) : (
            <Notice tone="danger" title="رد می‌شود">
              {verdict.label || verdict.reason || "نامشخص"}
              {verdict.owner_admin ? <> — ادمین مالک سرویس: <Ltr>{verdict.owner_admin}</Ltr></> : null}
            </Notice>
          )}
        </div>
      ) : null}
    </GlassSection>
  );
}

function Requests() {
  const { session } = usePanelSession();
  const state = useJson<{ ok: boolean; requests: PendingRequest[] }>(REQUESTS_PATH);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Without the approval permission the endpoint refuses and the card stays hidden.
  if (state.status === "error" || !state.data) return null;
  const decide = async (id: number, action: "approve" | "reject") => {
    setBusyId(id);
    const answer = await postJson(`${REQUESTS_PATH}/${id}/${action}`, {}, session.csrf_token);
    setBusyId(null);
    if (!answer.ok) toast.danger(safeMessage(answer.error, "انجام نشد؛ دوباره تلاش کنید"));
    state.reload();
  };
  const rows = state.data.requests;
  return (
    <GlassSection title="درخواست‌های در انتظار">
      {rows.length ? (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="درخواست‌های در انتظار" className="min-w-[520px]">
              <Table.Header>
                <Table.Column isRowHeader>مشتری</Table.Column>
                <Table.Column>کاربر پنل</Table.Column>
                <Table.Column>انقضا</Table.Column>
                <Table.Column>تصمیم</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={row.id} id={row.id}>
                    <Table.Cell>
                      <span dir="auto">{row.customer_name ? `${row.customer_name} · ${row.customer}` : row.customer}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <Ltr>{row.panel_username}</Ltr>
                    </Table.Cell>
                    <Table.Cell>{formatDateTime(row.expires_at)}</Table.Cell>
                    <Table.Cell>
                      <span className="flex gap-2">
                        <Button size="sm" isDisabled={busyId === row.id} onPress={() => void decide(row.id, "approve")}>
                          تأیید
                        </Button>
                        <Button size="sm" variant="outline" isDisabled={busyId === row.id} onPress={() => void decide(row.id, "reject")}>
                          رد
                        </Button>
                      </span>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      ) : (
        <p className="text-sm text-muted">درخواستی در انتظار نیست</p>
      )}
    </GlassSection>
  );
}

export function ServiceImportPanel() {
  const [refreshes, setRefreshes] = useState(0);
  const state = useJson<StatusData>(refreshes ? `${STATUS_PATH}?refresh=1&_=${refreshes}` : STATUS_PATH);
  const data = state.data;
  return (
    <div className="flex flex-col gap-4">
      <GlassSection
        title="وضعیت اتصال"
        description="ربات با کدام ادمین پاسارگارد وارد پنل می‌شود و لینک با چه مسیر و ادمینی پذیرفته می‌شود."
        actions={
          <Button size="sm" variant="outline" onPress={() => setRefreshes((n) => n + 1)}>
            بررسی مجدد
          </Button>
        }
      >
        {data ? <StatusTiles data={data} /> : state.status === "error" ? <ErrorBlock message={state.message} onRetry={state.reload} /> : <LoadingBlock rows={1} height="h-16" />}
      </GlassSection>
      <LinkTest />
      <Requests />
      <GlassSection title="آخرین تلاش‌های مشتریان">
        {!data ? (
          <LoadingBlock rows={2} />
        ) : data.attempts?.length ? (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="آخرین تلاش‌های مشتریان" className="min-w-[520px]">
                <Table.Header>
                  <Table.Column isRowHeader>زمان</Table.Column>
                  <Table.Column>مشتری</Table.Column>
                  <Table.Column>نتیجه</Table.Column>
                  <Table.Column>علت</Table.Column>
                </Table.Header>
                <Table.Body>
                  {data.attempts.map((item, index) => (
                    <Table.Row key={`${item.at}-${index}`} id={`${item.at}-${index}`}>
                      <Table.Cell>{formatDateTime(item.at)}</Table.Cell>
                      <Table.Cell>
                        <span dir="auto">{item.name ? `${item.name} · ${item.customer}` : item.customer}</span>
                      </Table.Cell>
                      <Table.Cell>{OUTCOME_LABELS[item.outcome] ?? item.outcome}</Table.Cell>
                      <Table.Cell>
                        <span className="text-muted">{item.label || "—"}</span>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        ) : (
          <EmptyBlock title="هنوز تلاشی ثبت نشده" />
        )}
      </GlassSection>
    </div>
  );
}
