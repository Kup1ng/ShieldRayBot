"use client";

import { Button, Table } from "@heroui/react";
import { useState, type ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { run, type Ask } from "../../core/actions";
import { useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, RowMenu, StatusChip, type MenuAction } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable } from "../../ui/States";
import { CreateAdminModal, DeleteAdminModal, ResellerGrantModal, StaffAccessModal } from "./AdminModals";
import { adminPath } from "./adminForms";
import { usePgData } from "./data";
import { ConnectionNoticeBar, ReadError } from "./PgNotice";
import type { AdminRow, AdminsData } from "./types";

type Dialog = { kind: "create" } | { kind: "staff" | "reseller" | "convert" | "delete"; admin: AdminRow } | null;

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted">{children}</span>;
}

/** How this admin reaches the web panel: a reseller, a secondary admin, the owner, or not at all. */
function WebAccessCell({ admin }: { admin: AdminRow }) {
  const web = admin.web;
  if (web.source === "reseller") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip color="success">نماینده</StatusChip>
        {web.web_username ? <Ltr>{web.web_username}</Ltr> : <Muted>یوزر وب هنوز ساخته نشده</Muted>}
        {!web.is_active && web.web_username ? <StatusChip color="default">غیرفعال</StatusChip> : null}
        {web.staff_id ? <StatusChip color="warning">ردیف ادمین فرعی یتیم</StatusChip> : <Muted>دسترسی جداگانه ساخته نمی‌شود</Muted>}
      </div>
    );
  }
  if (web.source === "owner") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip color="success">ادمین اصلی</StatusChip>
        <Muted>{web.detail || "دسترسی کامل وب‌پنل"}</Muted>
      </div>
    );
  }
  if (web.source === "pg_staff") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip color={web.is_active ? "success" : "default"}>{web.is_active ? "فعال" : "غیرفعال"}</StatusChip>
        {web.web_username ? <Ltr>{web.web_username}</Ltr> : null}
        {web.credentials_ready ? (
          <>
            <StatusChip color="success">اعتبارنامه پاسارگارد ذخیره‌شده</StatusChip>
            {web.api_key_ready ? <StatusChip color="success">کلید API</StatusChip> : null}
          </>
        ) : (
          <StatusChip color="warning">نیاز به ذخیره رمز یا کلید API</StatusChip>
        )}
        {web.username_aligned === false ? <StatusChip color="danger">نام کاربری ناهماهنگ</StatusChip> : null}
      </div>
    );
  }
  return <span className="text-muted">—</span>;
}

function RoleCell({ admin }: { admin: AdminRow }) {
  const parts = [admin.role_name, admin.is_sudo ? "دسترسی کامل" : "", admin.status_label].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span dir="auto" className="text-muted">
        {parts.length ? parts.join(" · ") : "—"}
      </span>
      {admin.note ? (
        <span dir="auto" className="max-w-56 truncate text-xs text-muted" title={admin.note}>
          {admin.note}
        </span>
      ) : null}
    </div>
  );
}

type RowActions = { open: (dialog: Dialog) => void; reload: () => void };

/** The actions of one admin row: what the old row buttons offered, with the same confirmations. */
function rowActions(admin: AdminRow, { open, reload }: RowActions): MenuAction[] {
  const web = admin.web;
  if (web.source === "owner") return [];
  const name = admin.username;
  const post = (action: string, ask?: Ask) => () =>
    void run(adminPath(name, action), {}, { ask, refresh: reload });
  const items: MenuAction[] = [];
  if (web.source === "reseller" && web.reseller_user_id) {
    items.push({ id: "manage", label: "مدیریت نماینده", icon: "solar:user-id-bold", onAction: () => window.location.assign(`/resellers/${web.reseller_user_id}/edit`) });
    if (web.staff_id) {
      items.push({
        id: "orphan",
        label: "حذف ردیف ادمین فرعی",
        icon: "solar:user-cross-rounded-linear",
        danger: true,
        onAction: post("web-access/revoke", {
          title: "حذف ردیف یتیم",
          text: "ردیف ادمین فرعی یتیم حذف شود؟ (دسترسی نماینده باقی می‌ماند)",
          confirmLabel: "حذف ردیف",
          tone: "danger",
        }),
      });
    }
  } else if (web.source === "pg_staff") {
    items.push(
      { id: "staff", label: "ویرایش دسترسی ادمین فرعی", icon: "solar:pen-linear", onAction: () => open({ kind: "staff", admin }) },
      { id: "convert", label: "تبدیل به نماینده", icon: "solar:transfer-horizontal-linear", onAction: () => open({ kind: "convert", admin }) },
      { id: "toggle", label: web.is_active ? "غیرفعال کردن" : "فعال کردن", icon: "solar:power-bold", onAction: post("web-access/toggle") },
      {
        id: "revoke",
        label: "حذف دسترسی",
        icon: "solar:user-cross-rounded-linear",
        danger: true,
        onAction: post("web-access/revoke", {
          title: "حذف دسترسی وب",
          text: "دسترسی وب ادمین فرعی حذف شود؟ ادمین پاسارگارد باقی می‌ماند.",
          confirmLabel: "حذف دسترسی",
          tone: "danger",
        }),
      },
    );
  } else if (web.source === "none") {
    items.push(
      { id: "staff", label: "اعطای ادمین فرعی", icon: "solar:user-plus-linear", onAction: () => open({ kind: "staff", admin }) },
      { id: "reseller", label: "اعطای نماینده", icon: "solar:crown-bold", onAction: () => open({ kind: "reseller", admin }) },
    );
  }
  if (name) items.push({ id: "delete", label: "حذف ادمین", icon: "solar:trash-bin-trash-linear", danger: true, onAction: () => open({ kind: "delete", admin }) });
  return items;
}

function AdminsTable({ rows, actions }: { rows: AdminRow[]; actions: RowActions }) {
  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content aria-label="ادمین‌های پاسارگارد" className="min-w-[860px]">
          <Table.Header>
            <Table.Column className="hidden md:table-cell">شناسه</Table.Column>
            <Table.Column isRowHeader>نام کاربری</Table.Column>
            <Table.Column className="hidden sm:table-cell">نقش / جزئیات</Table.Column>
            <Table.Column>کاربران</Table.Column>
            <Table.Column>حجم</Table.Column>
            <Table.Column>دسترسی وب‌پنل</Table.Column>
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body renderEmptyState={() => <p className="py-6 text-center text-sm text-muted">ادمینی یافت نشد یا دسترسی کافی نیست.</p>}>
            {rows.map((admin) => (
              <Table.Row key={admin.username} id={admin.username}>
                <Table.Cell className="hidden md:table-cell">{admin.id === null ? "—" : <Ltr className="text-muted">{admin.id}</Ltr>}</Table.Cell>
                <Table.Cell>
                  <Ltr className="font-medium text-foreground">{admin.username || "—"}</Ltr>
                </Table.Cell>
                <Table.Cell className="hidden sm:table-cell">
                  <RoleCell admin={admin} />
                </Table.Cell>
                <Table.Cell>
                  <span title="مصرف / سقف کاربران">
                    <Ltr>{admin.users_text}</Ltr>
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col gap-0.5" title="مصرف / سقف حجم">
                    <Ltr>{admin.traffic_text}</Ltr>
                    {admin.lifetime_text ? (
                      <span className="text-xs text-muted">
                        Σ <Ltr>{admin.lifetime_text}</Ltr>
                      </span>
                    ) : null}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <WebAccessCell admin={admin} />
                </Table.Cell>
                <Table.Cell>
                  <RowMenu label={`عملیات ${admin.username}`} actions={rowActions(admin, actions)} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

export function AdminsContent() {
  const admins = usePgData<AdminsData>("/api/panel/pg/admins");
  const [dialog, setDialog] = useState<Dialog>(null);
  useUrlFlash();
  const close = () => setDialog(null);
  const actions: RowActions = { open: setDialog, reload: admins.reload };

  return (
    <>
      <PageHeader
        icon="solar:shield-user-bold"
        tone="purple"
        title="ادمین"
        description="ادمین‌های پاسارگارد، سقف مصرف و دسترسی هر کدام به وب‌پنل"
        actions={
          <Button className="button--ink" isDisabled={!admins.data} onPress={() => setDialog({ kind: "create" })}>
            <Icon name="solar:add-circle-bold" size={20} />
            ساخت ادمین
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Loadable state={admins} rows={5}>
          {(data) => (
            <>
              <ConnectionNoticeBar notice={data.notice} onRetry={admins.reload} />
              <ReadError message={data.error} />
              <GlassSection title="لیست ادمین‌ها" description={`${fa(data.admins.length)} ادمین`}>
                {data.admins.length ? (
                  <AdminsTable rows={data.admins} actions={actions} />
                ) : (
                  <EmptyBlock icon="solar:shield-user-bold" title="ادمینی یافت نشد یا دسترسی کافی نیست." />
                )}
              </GlassSection>
              <CreateAdminModal open={dialog?.kind === "create"} data={data} onClose={close} onReload={admins.reload} />
              <StaffAccessModal admin={dialog?.kind === "staff" ? dialog.admin : null} data={data} onClose={close} onReload={admins.reload} />
              <ResellerGrantModal admin={dialog?.kind === "reseller" ? dialog.admin : null} data={data} convert={false} onClose={close} onReload={admins.reload} />
              <ResellerGrantModal admin={dialog?.kind === "convert" ? dialog.admin : null} data={data} convert onClose={close} onReload={admins.reload} />
              <DeleteAdminModal admin={dialog?.kind === "delete" ? dialog.admin : null} onClose={close} onReload={admins.reload} />
            </>
          )}
        </Loadable>
      </div>
    </>
  );
}

export function AdminsPage() {
  return (
    <PanelShell title="ادمین‌های پاسارگارد">
      <AdminsContent />
    </PanelShell>
  );
}
