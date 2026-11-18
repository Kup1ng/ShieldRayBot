"use client";

/** «درخواست‌های ورود»: customers waiting for the admin's approval before they can use the bot. */

import { Button, Tabs } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

import { run } from "../core/actions";
import { PanelError, panelGet } from "../core/api";
import { fa, formatDateTime } from "../core/format";
import { Ltr, StatusChip } from "../ui/Data";
import { GlassSection } from "../ui/Page";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../ui/States";
import {
  ACTION_LABELS,
  ACTION_SUCCESS,
  CONFIRMS,
  EMPTY_TITLES,
  ENTRY_APPROVALS_PATH,
  VIEWS,
  decisionPath,
  rowModel,
  type RowModel,
} from "./entryApproval";
import type { EntryApprovalAction, EntryApprovalRow, EntryApprovalView } from "./types";

const FORBIDDEN = 403;

type Load =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: EntryApprovalRow[] };

/** The list of one view; a refusal (no permission) is its own state so the card can stay out of the page. */
function useRequests(view: EntryApprovalView): { load: Load; reload: () => void } {
  const [answer, setAnswer] = useState<{ view: EntryApprovalView; load: Load }>({ view, load: { status: "loading" } });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const settle = (load: Load) => setAnswer({ view, load });
    panelGet<{ ok: boolean; requests: EntryApprovalRow[] }>(`${ENTRY_APPROVALS_PATH}?view=${view}`, { signal: controller.signal })
      .then((data) => settle({ status: "ready", rows: data.requests ?? [] }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof PanelError && err.status === FORBIDDEN) settle({ status: "forbidden" });
        else settle({ status: "error", message: err instanceof Error ? err.message : "" });
      });
    return () => controller.abort();
  }, [view, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  // Rows of the other view never show under this view's tab while its own list loads.
  return { load: answer.view === view ? answer.load : { status: "loading" }, reload };
}

function DecisionButtons({ model, busy, onDecide }: { model: RowModel; busy: boolean; onDecide: (id: number, action: EntryApprovalAction) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {model.actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === "approve" ? "primary" : action === "block" ? "danger-soft" : "outline"}
          isDisabled={busy}
          aria-label={`${ACTION_LABELS[action]} ${model.name}`}
          onPress={() => onDecide(model.id, action)}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
    </div>
  );
}

function RequestsTable({ models, busy, onDecide }: { models: RowModel[]; busy: boolean; onDecide: (id: number, action: EntryApprovalAction) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="pb-2 pe-3 text-start font-medium">کاربر</th>
            <th className="hidden pb-2 pe-3 text-start font-medium sm:table-cell">آیدی عددی</th>
            <th className="pb-2 pe-3 text-start font-medium">زمان</th>
            <th className="pb-2 pe-3 text-start font-medium">وضعیت</th>
            <th className="pb-2 text-start font-medium">
              <span className="sr-only">عملیات</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id} className="border-t border-border">
              <td className="py-2 pe-3">
                <span dir="auto">{model.name}</span>
                {model.username ? <Ltr className="block text-xs text-muted">{model.username}</Ltr> : null}
              </td>
              <td className="hidden py-2 pe-3 sm:table-cell">
                <Ltr>{model.customer}</Ltr>
              </td>
              <td className="py-2 pe-3 text-muted">{formatDateTime(model.when)}</td>
              <td className="py-2 pe-3">
                <StatusChip color={model.status.color}>{model.status.label}</StatusChip>
              </td>
              <td className="py-2">
                <DecisionButtons model={model} busy={busy} onDecide={onDecide} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ViewTabs({ view, onChange }: { view: EntryApprovalView; onChange: (view: EntryApprovalView) => void }) {
  return (
    <Tabs selectedKey={view} onSelectionChange={(key) => onChange(String(key) as EntryApprovalView)}>
      <Tabs.ListContainer>
        <Tabs.List aria-label="نمای درخواست‌ها">
          {VIEWS.map((item) => (
            <Tabs.Tab key={item.id} id={item.id} className="whitespace-nowrap">
              {item.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}

/** Staff without the approval permission get a refusal from the list, and then see no card at all. */
export function EntryApprovalRequests() {
  const [view, setView] = useState<EntryApprovalView>("pending");
  const [busy, setBusy] = useState(false);
  const { load, reload } = useRequests(view);
  if (load.status === "forbidden") return null;

  const decide = async (id: number, action: EntryApprovalAction) => {
    if (busy) return;
    setBusy(true);
    try {
      await run(decisionPath(id, action), {}, { ask: CONFIRMS[action], success: ACTION_SUCCESS[action], refresh: reload });
    } finally {
      setBusy(false);
    }
  };
  const count = load.status === "ready" ? `${fa(load.rows.length)} درخواست` : undefined;
  return (
    <GlassSection title="درخواست‌های ورود" description={count} actions={<ViewTabs view={view} onChange={setView} />}>
      <div aria-live="polite">
        {load.status === "loading" ? <LoadingBlock rows={2} /> : null}
        {load.status === "error" ? <ErrorBlock message={load.message} onRetry={reload} /> : null}
        {load.status === "ready" && !load.rows.length ? <EmptyBlock icon="solar:users-group-rounded-linear" title={EMPTY_TITLES[view]} /> : null}
        {load.status === "ready" && load.rows.length ? <RequestsTable models={load.rows.map(rowModel)} busy={busy} onDecide={(id, action) => void decide(id, action)} /> : null}
      </div>
    </GlassSection>
  );
}
