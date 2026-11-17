"use client";

import { Alert, Button } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../core/actions";
import { useJson } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader } from "../../ui/Page";
import { Loadable } from "../../ui/States";
import { DismissDialog, type DismissTarget } from "./DismissDialog";
import { QueueRow } from "./HomeParts";
import { hiddenCopy, inboxAlerts, type InboxAlert } from "./inboxAlerts";
import type { InboxData } from "./types";
import { LinkButton } from "./ui";

function AlertRow({ alert, onDismiss }: { alert: InboxAlert; onDismiss: (alert: InboxAlert) => void }) {
  return (
    <Alert status={alert.status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{alert.title}</Alert.Title>
        <Alert.Description>{alert.detail}</Alert.Description>
      </Alert.Content>
      <div className="flex shrink-0 items-center gap-2">
        <LinkButton href={alert.action.href} tone={alert.action.primary ? "ink" : "outline"}>
          {alert.action.label}
        </LinkButton>
        {alert.undismissable ? null : (
          <Button size="sm" variant="ghost" aria-label={`حذف اعلان: ${alert.title}`} onPress={() => onDismiss(alert)}>
            حذف
          </Button>
        )}
      </div>
    </Alert>
  );
}

function HiddenTools({ data, onReset, pending }: { data: InboxData; onReset: () => void; pending: boolean }) {
  const copy = hiddenCopy(data);
  return (
    <GlassSection>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-sm text-foreground">{copy.title}</strong>
          <span className="text-xs text-muted">{copy.hint}</span>
        </div>
        <Button variant="outline" isPending={pending} onPress={onReset}>
          <Icon name="solar:restart-linear" size={18} />
          بازنشانی اعلان‌های مخفی
        </Button>
      </div>
    </GlassSection>
  );
}

function InboxBody({ data, onDismiss, onReload }: { data: InboxData; onDismiss: (target: DismissTarget) => void; onReload: () => void }) {
  const { pending, track } = usePending();
  const reset = () => track(() => run("/inbox/dismiss/reset", { return_to: "/inbox" }, { refresh: onReload }));
  const alerts = inboxAlerts(data);
  const queue = data.action_center;
  return (
    <div className="flex flex-col gap-6">
      <HiddenTools data={data} onReset={() => void reset()} pending={pending} />
      {!data.has_items ? (
        <GlassSection>
          <p role="status" className="py-6 text-center text-sm text-muted">
            فعلاً اعلان قابل‌نمایشی ندارید.
          </p>
        </GlassSection>
      ) : (
        <>
          {alerts.length ? (
            <div className="flex flex-col gap-3">
              {alerts.map((alert) => (
                <AlertRow key={`${alert.key}:${alert.entity}`} alert={alert} onDismiss={(a) => onDismiss({ key: a.key, entity: a.entity })} />
              ))}
            </div>
          ) : null}
          {queue?.has_items ? (
            <GlassSection title="مرکز اقدام امروز">
              <ul className="flex flex-col gap-2" aria-label="مرکز اقدام امروز">
                {queue.entries.map((entry) => (
                  <QueueRow key={entry.key} entry={entry} onDismiss={(e) => onDismiss({ key: `ac:${e.key}`, entity: "" })} />
                ))}
              </ul>
            </GlassSection>
          ) : null}
        </>
      )}
    </div>
  );
}

function InboxContent() {
  const inbox = useJson<InboxData>("/api/panel/inbox");
  const [dismiss, setDismiss] = useState<DismissTarget | null>(null);
  return (
    <>
      <PageHeader icon="solar:bell-bold" tone="orange" title="اعلان‌ها و مرکز اقدام" description="هشدارهای فروشگاه و کارهایی که امروز منتظر شما هستند" />
      <Loadable state={inbox} rows={4} height="h-20">
        {(data) => <InboxBody data={data} onDismiss={setDismiss} onReload={inbox.reload} />}
      </Loadable>
      <DismissDialog target={dismiss} onClose={() => setDismiss(null)} onDone={inbox.reload} />
    </>
  );
}

export function InboxPage() {
  return (
    <PanelShell title="اعلان‌ها و مرکز اقدام">
      <InboxContent />
    </PanelShell>
  );
}
