"use client";

import { Button, Table } from "@heroui/react";
import { useState } from "react";

import { useLocation } from "@/lib/location";

import { panelGet } from "../../core/api";
import { useJson } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../ui/States";
import type { StaffActionRow, StaffActionsData } from "./types";

const ENDPOINT = "/api/panel/staff-actions";

function cursorFromAddress(search: string): string {
  const raw = new URLSearchParams(search).get("before") ?? "";
  return /^\d+$/.test(raw) ? raw : "";
}

function ActionsTable({ rows }: { rows: StaffActionRow[] }) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="گزارش کارکنان" className="min-w-[720px]">
          <Table.Header>
            <Table.Column isRowHeader>زمان</Table.Column>
            <Table.Column>انجام‌دهنده</Table.Column>
            <Table.Column>کار</Table.Column>
            <Table.Column>روی</Table.Column>
            <Table.Column>مبلغ</Table.Column>
            <Table.Column>علت</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id} id={row.id}>
                <Table.Cell>
                  <Ltr>{row.when}</Ltr>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col">
                    <span dir="auto">{row.actor}</span>
                    <span className="text-xs text-muted">{row.actor_kind}</span>
                  </div>
                </Table.Cell>
                <Table.Cell>{row.action}</Table.Cell>
                <Table.Cell>
                  <Ltr>{row.target}</Ltr>
                </Table.Cell>
                <Table.Cell>{row.amount === null ? "—" : <Ltr>{fa(row.amount)}</Ltr>}</Table.Cell>
                <Table.Cell>
                  <span dir="auto">{row.reason || "—"}</span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

type Older = { base: StaffActionsData | null; rows: StaffActionRow[]; next: number | null };

function StaffActionsContent() {
  const where = useLocation();
  const start = cursorFromAddress(where.search);
  const first = useJson<StaffActionsData>(where.path ? `${ENDPOINT}${start ? `?before=${start}` : ""}` : null, { keepPrevious: true });
  // Older pages belong to the first page they were read after; a reload starts the list again.
  const [loaded, setLoaded] = useState<Older>({ base: null, rows: [], next: null });
  const [more, setMore] = useState({ pending: false, error: "" });

  const older = loaded.base === first.data ? loaded : null;
  const cursor = older ? older.next : (first.data?.next_before ?? null);
  const rows = [...(first.data?.actions ?? []), ...(older?.rows ?? [])];

  const loadOlder = async () => {
    if (cursor === null || more.pending) return;
    setMore({ pending: true, error: "" });
    try {
      const page = await panelGet<StaffActionsData>(`${ENDPOINT}?before=${cursor}`);
      setLoaded({ base: first.data, rows: [...(older?.rows ?? []), ...page.actions], next: page.next_before });
      setMore({ pending: false, error: "" });
    } catch (err) {
      setMore({ pending: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <>
      <PageHeader icon="solar:users-group-rounded-bold" tone="teal" title="گزارش کارکنان" description="کارهای مهم کارکنان همین فروشگاه، تازه‌ترین در بالا. این فهرست قابل ویرایش یا حذف نیست." />
      {first.status === "error" && !first.data ? (
        <ErrorBlock message={first.message} onRetry={first.reload} />
      ) : !first.data ? (
        <GlassSection>
          <LoadingBlock rows={6} height="h-10" />
        </GlassSection>
      ) : rows.length === 0 ? (
        <GlassSection>
          <EmptyBlock icon="solar:notebook-bold" title="هنوز کاری ثبت نشده است" description="کارهای مهم کارکنان، مثل شارژ دستی کیف پول یا ساخت کد هدیه، اینجا ثبت می‌شود." />
        </GlassSection>
      ) : (
        <GlassSection>
          <ActionsTable rows={rows} />
          {more.error ? (
            <p role="alert" className="text-sm text-danger">
              {more.error}
            </p>
          ) : null}
          {cursor !== null ? (
            <div className="flex justify-center">
              <Button variant="outline" isPending={more.pending} onPress={() => void loadOlder()}>
                موارد قدیمی‌تر
              </Button>
            </div>
          ) : null}
        </GlassSection>
      )}
    </>
  );
}

export function StaffActionsPage() {
  return (
    <PanelShell title="گزارش کارکنان">
      <StaffActionsContent />
    </PanelShell>
  );
}
