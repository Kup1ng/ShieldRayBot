"use client";

import { Button, toast } from "@heroui/react";
import { useState } from "react";

import { PanelError, panelJson } from "../../core/api";
import { useJson } from "../../core/data";
import { usePanelSession } from "../../core/session";
import { Ltr } from "../../ui/Data";
import { SelectInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Loadable, Notice } from "../../ui/States";
import { JobProgress } from "./JobProgress";
import type { ChannelReply, StartReply, UpdatePayload } from "./types";
import { applyChannelReply, migrationBanner, startButton, stateLabel, versionBanner } from "./updateLogic";
import { isBusy, useJob } from "./useJob";
import { MetaItem } from "./ui";

const STATUS_URL = "/update/status";
const RESTART_PERCENT = 98;

function Changelog({ changelog }: { changelog: UpdatePayload["changelog"] }) {
  if (!changelog.has_notes || !changelog.blocks.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={changelog.title}>
      <h4 className="text-sm font-semibold text-foreground">{changelog.title}</h4>
      {changelog.blocks.map((block) => (
        <div key={block.version} className="inset-tile flex flex-col gap-2 rounded-lg p-3">
          <strong className="text-sm">
            <Ltr>v{block.version}</Ltr>
          </strong>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-foreground/80">
            {block.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof PanelError && err.message ? err.message : fallback;
}

function UpdateContent({ data, reload }: { data: UpdatePayload; reload: () => void }) {
  const { refresh } = usePanelSession();
  const [view, setView] = useState(data);
  const [seen, setSeen] = useState(data);
  const [starting, setStarting] = useState(false);
  const [switching, setSwitching] = useState(false);
  // A reloaded answer is the newest word of the server; a channel switch only layers on top of it.
  if (seen !== data) {
    setSeen(data);
    setView(data);
  }

  const job = useJob({
    statusUrl: STATUS_URL,
    initial: data.status,
    expectedVersion: () => view.remote_version || "",
    onRestarted: () => {
      // The new build ships new page scripts: load the page again, like the old full reload.
      const note = encodeURIComponent("آپدیت با موفقیت اعمال شد");
      window.location.assign(`/settings?tab=update&ok=${note}`);
    },
    onSettled: (phase, status) => {
      if (phase === "error") toast.danger(status.message || status.error || "آپدیت ناموفق بود");
      void refresh();
      reload();
    },
  });
  const busy = isBusy(job.phase) || starting;
  const restarting = job.phase === "restarting";
  const failed = job.phase === "error";
  const button = startButton(job.phase, view);

  const start = async () => {
    setStarting(true);
    try {
      const reply = await panelJson<StartReply>("/update/start", { target: view.remote_version, force: button.retry });
      if (!reply.ok) {
        toast.danger(reply.error || "شروع آپدیت ممکن نشد");
        reload();
        return;
      }
      job.follow();
    } catch (err) {
      // The request may have reached the server: read the job's state instead of posting again.
      toast.danger(errorText(err, "خطا در شروع آپدیت — اتصال یا نشست را بررسی کنید"));
      job.follow();
    } finally {
      setStarting(false);
    }
  };

  const switchChannel = async (channel: string) => {
    if (!channel || channel === view.channel) return;
    setSwitching(true);
    try {
      const reply = await panelJson<ChannelReply>("/update/channel", { channel });
      if (!reply.ok) toast.danger(reply.error || "تغییر کانال ممکن نشد");
      else setView((prev) => applyChannelReply(prev, reply));
    } catch (err) {
      toast.danger(errorText(err, "خطا در بررسی آپدیت کانال — اتصال یا نشست را بررسی کنید"));
    } finally {
      setSwitching(false);
    }
  };

  const status = job.status;
  const migration = migrationBanner(view.migration, busy);
  const version = versionBanner(view, busy);
  const stateText = stateLabel(view, busy || failed ? (restarting ? job.note : status?.message || "") : null);
  return (
    <GlassSection title="آپدیت پنل" description="کانال را انتخاب کنید، نسخه را با گیت‌هاب مقایسه کنید و در صورت نیاز آپدیت را از همین‌جا اعمال کنید.">
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <SelectInput
          label="کانال آپدیت"
          value={view.channel}
          onChange={(value) => void switchChannel(value)}
          options={view.channels.map((channel) => ({ id: channel.id, label: `${channel.label} (${channel.id})` }))}
          disabled={busy || switching}
          help="پایدار از شاخه main؛ توسعه از شاخه dev. برچسب هدر کانال نصب‌شدهٔ فعلی را نشان می‌دهد و فقط بعد از اعمال آپدیت عوض می‌شود."
        />
      </div>
      {switching ? <Notice tone="warning">در حال بررسی آپدیت این کانال…</Notice> : null}
      {migration ? <Notice tone={migration.tone}>{migration.text}</Notice> : null}
      {version && !switching ? <Notice tone={version.tone}>{version.text}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetaItem label="نسخه فعلی">
          <Ltr>v{view.local_version}</Ltr>
        </MetaItem>
        <MetaItem label="آخرین نسخه کانال">{view.remote_version ? <Ltr>v{view.remote_version}</Ltr> : "—"}</MetaItem>
        <MetaItem label="وضعیت">{stateText}</MetaItem>
      </div>
      <Changelog changelog={view.changelog} />
      {busy && status ? (
        <JobProgress
          label="پیشرفت آپدیت"
          percent={restarting ? RESTART_PERCENT : Number(status.percent ?? 0)}
          stepLabel={restarting ? "راه‌اندازی مجدد سرویس" : status.step || "در حال اعمال…"}
          message={restarting ? job.note : status.message || ""}
          steps={view.steps}
          currentKey={restarting ? "restart" : status.step_key}
          footer={
            <p className="text-xs text-muted">
              از <Ltr>{status.from_version || view.local_version}</Ltr> به <Ltr>{status.to_version || view.remote_version || "—"}</Ltr>
            </p>
          }
        />
      ) : null}
      {failed && status ? (
        <Notice tone="danger" title="آپدیت ناموفق">
          {status.message || status.error || "خطای ناشناخته — دوباره تلاش کنید."}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" className="button--ink !h-12 !rounded-lg px-6 text-sm" isDisabled={button.disabled || starting || switching} isPending={starting} onPress={() => void start()}>
          {button.label}
        </Button>
        <Button variant="outline" className="!h-12 !rounded-lg px-6 text-sm" isDisabled={busy || switching} onPress={reload}>
          بررسی دوباره
        </Button>
      </div>
    </GlassSection>
  );
}

/** «آپدیت»: version check against the channel, migration preflight, running the update and the restart wait. */
export function UpdateView() {
  const state = useJson<UpdatePayload>("/api/panel/system/update?force=1");
  return (
    <Loadable state={state} rows={4}>
      {(data) => <UpdateContent data={data} reload={state.reload} />}
    </Loadable>
  );
}
