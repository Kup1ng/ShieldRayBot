"use client";

import { Button, Checkbox, Table } from "@heroui/react";

import { Icon } from "@/icons/Icon";

import { run } from "../../../core/actions";
import { useJson, useQuery, useUrlFlash } from "../../../core/data";
import { fa, formatDateTime } from "../../../core/format";
import { PanelShell } from "../../../layout/PanelShell";
import { BulkBar, Ltr, StatusChip } from "../../../ui/Data";
import { GlassSection, PageHeader } from "../../../ui/Page";
import { EmptyBlock, Loadable } from "../../../ui/States";
import type { BotTicketRow, PanelTicketRow, TicketsOverview } from "../types";
import { BotTicketDialog, NewTicketDialog, PanelTicketDialog } from "./TicketDialogs";
import { SupportsDialog } from "./SupportsDialog";
import { useSelection } from "./useSelection";

const PANEL_BULK = "/tickets/panel/bulk-action";
const BOT_BULK = "/tickets/bot/bulk-action";
const RETURN_TO = "/tickets";

function positiveId(raw: string): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function SelectBox({ label }: { label: string }) {
  return (
    <Checkbox aria-label={label} slot="selection" variant="secondary">
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}

function CloseAction({ label, ids, path, ask, onDone }: { label: string; ids: number[]; path: string; ask: string; onDone: () => void }) {
  return (
    <BulkBar
      selected={ids.length}
      label={label}
      onClear={onDone}
      buttons={[
        {
          op: "close",
          label: "بستن",
          count: ids.length,
          danger: true,
          onPress: () => {
            void run(path, { action: "close", ids, return_to: RETURN_TO }, { ask: { title: "بستن گروهی", text: ask.replace("{n}", fa(ids.length)), confirmLabel: "بستن", tone: "warning" }, success: "تیکت‌ها بسته شدند.", refresh: onDone });
          },
        },
      ]}
    />
  );
}

function OpenButton({ id, onOpen }: { id: number; onOpen: (id: number) => void }) {
  return (
    <Button size="sm" variant="ghost" aria-label={`مشاهده تیکت ${fa(id)}`} onPress={() => onOpen(id)}>
      مشاهده
    </Button>
  );
}

function PanelTickets({ rows, owner, limit, onOpen, reload }: { rows: PanelTicketRow[]; owner: boolean; limit: number; onOpen: (id: number) => void; reload: () => void }) {
  const { keys, setKeys, ids, clear } = useSelection(rows);
  // Only open tickets can be closed in bulk.
  const closable = rows.filter((row) => ids.has(row.id) && row.status !== "closed").map((row) => row.id);
  if (!rows.length) return <EmptyBlock title="هنوز تیکت پنلی ثبت نشده" />;
  return (
    <>
      <p className="text-xs text-muted">
        {fa(rows.length)} تیکت{rows.length >= limit ? ` (جدیدترین ${fa(limit)} مورد)` : ""}
      </p>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="تیکت‌های پنل" className="min-w-[640px]" selectionMode="multiple" selectedKeys={keys} onSelectionChange={setKeys}>
            <Table.Header>
              <Table.Column className="w-10 pe-0">
                <SelectBox label="انتخاب همهٔ تیکت‌ها" />
              </Table.Column>
              <Table.Column isRowHeader>#</Table.Column>
              {owner ? <Table.Column>از</Table.Column> : null}
              <Table.Column>موضوع</Table.Column>
              <Table.Column>اولویت</Table.Column>
              <Table.Column>وضعیت</Table.Column>
              <Table.Column className="hidden md:table-cell">به‌روزرسانی</Table.Column>
              <Table.Column className="w-24">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="pe-0">
                    <SelectBox label={`انتخاب تیکت ${fa(row.id)}`} />
                  </Table.Cell>
                  <Table.Cell>
                    <Ltr>{fa(row.id)}</Ltr>
                  </Table.Cell>
                  {owner ? (
                    <Table.Cell>
                      <span dir="auto" className="text-muted">
                        {row.opener_label || "—"}
                      </span>
                      {row.opener_role === "reseller" ? <StatusChip color="accent">نماینده</StatusChip> : row.opener_role === "pg_staff" ? <StatusChip color="default">ادمین فرعی</StatusChip> : null}
                    </Table.Cell>
                  ) : null}
                  <Table.Cell>
                    <span dir="auto" className={row.unread ? "font-semibold text-foreground" : undefined}>
                      {row.subject}
                    </span>{" "}
                    {row.unread ? <StatusChip color={owner ? "warning" : "success"}>{owner ? "جدید" : "پاسخ جدید"}</StatusChip> : null}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusChip color={row.priority_color}>{row.priority_label}</StatusChip>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusChip color={row.status_color}>{row.status_label}</StatusChip>
                  </Table.Cell>
                  <Table.Cell className="hidden text-muted md:table-cell">
                    <Ltr>{formatDateTime(row.updated_at)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    <OpenButton id={row.id} onOpen={onOpen} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <CloseAction
        label="بستن گروهی تیکت‌های پنل"
        ids={closable}
        path={PANEL_BULK}
        ask="{n} تیکت پنلی بسته شوند؟"
        onDone={() => {
          clear();
          reload();
        }}
      />
    </>
  );
}

function BotTickets({ rows, onOpen, reload }: { rows: BotTicketRow[]; onOpen: (id: number) => void; reload: () => void }) {
  const { keys, setKeys, ids, clear } = useSelection(rows);
  const closable = rows.filter((row) => ids.has(row.id) && row.status !== "closed").map((row) => row.id);
  if (!rows.length) return <EmptyBlock title="تیکت کاربری نیست" />;
  return (
    <>
      <p className="text-xs text-muted">{fa(rows.length)} تیکت</p>
      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label="تیکت‌های کاربران ربات" className="min-w-[560px]" selectionMode="multiple" selectedKeys={keys} onSelectionChange={setKeys}>
            <Table.Header>
              <Table.Column className="w-10 pe-0">
                <SelectBox label="انتخاب همهٔ تیکت‌های ربات" />
              </Table.Column>
              <Table.Column isRowHeader>#</Table.Column>
              <Table.Column>کاربر</Table.Column>
              <Table.Column>موضوع</Table.Column>
              <Table.Column>وضعیت</Table.Column>
              <Table.Column className="hidden md:table-cell">زمان</Table.Column>
              <Table.Column className="w-24">
                <span className="sr-only">عملیات</span>
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="pe-0">
                    <SelectBox label={`انتخاب تیکت ${fa(row.id)}`} />
                  </Table.Cell>
                  <Table.Cell>
                    <Ltr>{fa(row.id)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    {row.user_id ? (
                      <a href={`/users?uid=${row.user_id}`} dir="auto" className="text-accent">
                        {row.user_label}
                      </a>
                    ) : (
                      <span dir="auto">{row.user_label}</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <span dir="auto">{row.subject}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusChip color={row.status_color}>{row.status_label}</StatusChip>
                  </Table.Cell>
                  <Table.Cell className="hidden text-muted md:table-cell">
                    <Ltr>{formatDateTime(row.updated_at)}</Ltr>
                  </Table.Cell>
                  <Table.Cell>
                    <OpenButton id={row.id} onOpen={onOpen} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      <CloseAction
        label="بستن گروهی تیکت‌های ربات"
        ids={closable}
        path={BOT_BULK}
        ask="{n} تیکت بسته شوند؟"
        onDone={() => {
          clear();
          reload();
        }}
      />
    </>
  );
}

function Content() {
  const query = useQuery();
  useUrlFlash();
  const state = useJson<TicketsOverview>("/api/panel/tickets");
  const { reload } = state;
  const viewId = positiveId(query.get("view"));
  const botId = positiveId(query.get("tg"));
  const creating = query.get("new") === "1";
  const overview = state.data;
  const supportsOpen = Boolean(overview?.can_manage_supports) && ["1", "true", "yes"].includes(query.get("supports"));
  return (
    <>
      <PageHeader
        icon="solar:chat-round-dots-linear"
        tone="blue"
        title="پشتیبانی"
        description="تیکت‌های پنل و گفتگو با کاربران ربات"
        actions={
          <>
            {overview?.can_manage_supports ? (
              <Button variant="outline" onPress={() => query.set({ supports: "1" })}>
                <Icon name="solar:users-group-rounded-linear" size={20} />
                پشتیبان‌ها
              </Button>
            ) : null}
            {overview?.can_create ? (
              <Button className="button--ink !h-10 !rounded-lg" onPress={() => query.set({ new: "1" })}>
                <Icon name="solar:add-circle-linear" size={20} />
                تیکت جدید
              </Button>
            ) : null}
          </>
        }
      />
      <Loadable state={state} rows={6}>
        {(data) => (
          <div className="flex flex-col gap-6">
            <GlassSection title="تیکت‌های پنل" description={data.is_owner ? "پیام‌های نمایندگان و ادمین‌های فرعی" : "گفتگوی شما با ادمین اصلی"}>
              <PanelTickets rows={data.panel_tickets} owner={data.is_owner} limit={data.limit} onOpen={(id) => query.set({ view: String(id), tg: null })} reload={reload} />
            </GlassSection>
            {data.show_bot_tickets ? (
              <GlassSection title="تیکت‌های کاربران ربات" description="پشتیبانی کاربران تلگرام — پاسخ از همین‌جا مثل تلگرام برای کاربر ارسال می‌شود">
                <BotTickets rows={data.bot_tickets} onOpen={(id) => query.set({ tg: String(id), view: null })} reload={reload} />
              </GlassSection>
            ) : null}
          </div>
        )}
      </Loadable>
      <NewTicketDialog
        open={Boolean(overview?.can_create) && creating}
        priorities={overview?.priorities ?? []}
        onClose={() => query.set({ new: null })}
        onCreated={(id) => {
          query.set({ new: null, view: id ? String(id) : null });
          reload();
        }}
      />
      <PanelTicketDialog ticketId={viewId} onClose={() => query.set({ view: null })} onChanged={reload} />
      <BotTicketDialog ticketId={overview?.show_bot_tickets ? botId : null} onClose={() => query.set({ tg: null })} onChanged={reload} />
      <SupportsDialog open={supportsOpen} tab={query.get("stab") || "contacts"} onTab={(next) => query.set({ stab: next }, { replace: true })} onClose={() => query.set({ supports: null, stab: null })} />
    </>
  );
}

export function TicketsPage() {
  return (
    <PanelShell title="پشتیبانی">
      <Content />
    </PanelShell>
  );
}
