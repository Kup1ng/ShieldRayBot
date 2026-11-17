"use client";

import { Button, Chip, Input, Label, ListBox, Select, TextField, toast, Tooltip } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/icons/Icon";

import { FALLBACK_ERROR, panelGet } from "../../core/api";
import { run } from "../../core/actions";
import { fa } from "../../core/format";
import { GlassSection } from "../../ui/Page";
import { EmptyBlock } from "../../ui/States";
import { money } from "./format";
import { ReasonDialog, type ReasonRequest } from "./ReasonDialog";
import type { EditService, UserEdit } from "./types";

type Props = { edit: UserEdit; reload: () => void };
/** Opens the reason dialog: the server refuses a service change without a reason (at least three characters). */
type AskReason = (request: ReasonRequest) => void;
type LinkAnswer = { ok: boolean; url?: string; error?: string };

const EXTEND_DAYS_LIMIT = 3650;
const EXTEND_GB_LIMIT = 10000;

/** The subscription link is read on demand (it is never part of the screen's data). */
async function fetchLink(userId: number, serviceId: number): Promise<string | null> {
  try {
    const answer = await panelGet<LinkAnswer>(`/users/${userId}/services/${serviceId}/link`);
    if (answer.ok && answer.url) return answer.url;
    toast.danger(answer.error || "لینک موجود نیست");
  } catch (err) {
    toast.danger(err instanceof Error ? err.message : FALLBACK_ERROR);
  }
  return null;
}

function LinkButtons({ userId, service }: { userId: number; service: EditService }) {
  const [busy, setBusy] = useState(false);
  if (!service.has_link) return null;
  const copy = async () => {
    setBusy(true);
    const url = await fetchLink(userId, service.id);
    setBusy(false);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("لینک کپی شد");
    } catch {
      toast.danger("کپی انجام نشد؛ دسترسی به کلیپ‌بورد ممکن نیست");
    }
  };
  const open = async () => {
    setBusy(true);
    const url = await fetchLink(userId, service.id);
    setBusy(false);
    if (url) window.open(url, "_blank", "noopener");
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Tooltip delay={600}>
        <Button variant="outline" size="sm" className="!rounded-lg" isDisabled={busy} onPress={() => void copy()}>
          <Icon name="solar:copy-linear" size={16} />
          کپی لینک
        </Button>
        <Tooltip.Content>
          <p>لینک اشتراک سرویس را کپی می‌کند</p>
        </Tooltip.Content>
      </Tooltip>
      <Button variant="outline" size="sm" className="!rounded-lg" isDisabled={busy} onPress={() => void open()}>
        <Icon name="solar:link-linear" size={16} />
        باز کردن
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="inset-tile flex min-w-32 flex-col gap-0.5 rounded-lg px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <strong className="text-sm text-foreground">{value}</strong>
    </div>
  );
}

function RenewForm({ userId, service, plans, reload, askReason }: { userId: number; service: EditService; plans: UserEdit["plans"]; reload: () => void; askReason: AskReason }) {
  const initial = service.plan_id !== null && plans.some((p) => p.id === service.plan_id) ? String(service.plan_id) : plans[0] ? String(plans[0].id) : "";
  const [plan, setPlan] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select aria-label="تمدید با پلن" value={plan || null} onChange={(key) => setPlan(key === null ? "" : String(key))} className="min-w-56 flex-1">
        <Label>تمدید با پلن</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {plans.map((item) => (
              <ListBox.Item key={item.id} id={String(item.id)} textValue={item.label}>
                {item.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Button
        size="sm"
        className="button--ink !h-10 !rounded-lg"
        isPending={pending}
        isDisabled={!plan}
        onPress={() =>
          askReason({
            title: "تمدید سرویس",
            message: "سرویس با پلن انتخابی تمدید شود؟ مصرف ریست می‌شود.",
            confirmLabel: "تمدید",
            reasonLabel: "علت تمدید",
            onConfirm: async (text) => {
              setPending(true);
              await run(`/users/${userId}/services/${service.id}/renew`, { plan_id: plan, reason: text }, { success: "سرویس تمدید شد" });
              setPending(false);
              reload();
            },
          })
        }
      >
        تمدید
      </Button>
    </div>
  );
}

function ExtendForm({ userId, service, reload, askReason }: { userId: number; service: EditService; reload: () => void; askReason: AskReason }) {
  const [days, setDays] = useState("0");
  const [gb, setGb] = useState("0");
  const [pending, setPending] = useState(false);
  const dayValue = Number(days.replace(/[٬,\s]/g, ""));
  const gbValue = Number(gb.replace(/[٬,\s]/g, ""));
  const valid = Number.isFinite(dayValue) && Number.isFinite(gbValue) && Math.abs(dayValue) <= EXTEND_DAYS_LIMIT && Math.abs(gbValue) <= EXTEND_GB_LIMIT && (dayValue !== 0 || gbValue !== 0);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <TextField value={days} onChange={setDays} className="w-32">
        <Label>روز</Label>
        <Input dir="ltr" type="number" step={1} min={-EXTEND_DAYS_LIMIT} max={EXTEND_DAYS_LIMIT} inputMode="numeric" className="text-start" />
      </TextField>
      <TextField value={gb} onChange={setGb} className="w-32">
        <Label>گیگ</Label>
        <Input dir="ltr" type="number" step={0.1} min={-EXTEND_GB_LIMIT} max={EXTEND_GB_LIMIT} inputMode="decimal" className="text-start" />
      </TextField>
      <Button
        size="sm"
        variant="outline"
        className="!h-10 !rounded-lg"
        isPending={pending}
        isDisabled={!valid}
        onPress={() =>
          askReason({
            title: "تغییر مانده سرویس",
            message: "روز/حجم سرویس فعلی تغییر کند؟ مثبت = افزایش، منفی = کاهش",
            confirmLabel: "اعمال",
            reasonLabel: "علت تغییر",
            tone: "warning",
            onConfirm: async (text) => {
              setPending(true);
              await run(
                `/users/${userId}/services/${service.id}/extend`,
                { extra_days: days.trim() || "0", extra_gb: gb.trim() || "0", reason: text },
                { success: "مانده سرویس به‌روز شد" },
              );
              setPending(false);
              reload();
            },
          })
        }
      >
        تغییر مانده
      </Button>
    </div>
  );
}

function DeleteButtons({ userId, service, reload, askReason }: { userId: number; service: EditService; reload: () => void; askReason: AskReason }) {
  const [pending, setPending] = useState(false);
  const label = `سرویس #${fa(service.id)}${service.pg_username ? ` (${service.pg_username})` : ""}`;
  const remove = (message: string, confirmLabel: string, fields: Record<string, string>, tone: "danger" | "warning", description?: string) =>
    askReason({
      title: "حذف سرویس",
      message: description ? `${message} ${description}` : message,
      confirmLabel,
      reasonLabel: "علت حذف",
      tone,
      onConfirm: async (text) => {
        setPending(true);
        await run(`/users/${userId}/services/${service.id}/delete`, { ...fields, reason: text }, { success: "سرویس حذف شد" });
        setPending(false);
        reload();
      },
    });
  if (service.is_external) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="!rounded-lg"
          isDisabled={pending}
          onPress={() => remove(`${label} فقط از لیست مشتری جدا شود؟`, "جدا شود", {}, "warning", "حساب VPN در پاسارگارد حفظ می‌شود و مشتری دیگر آن را در ربات نمی‌بیند.")}
        >
          جدا کردن از مشتری
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="!rounded-lg"
          isDisabled={pending}
          onPress={() => remove(`${label} از بیرون ربات اضافه شده است. حساب VPN آن در پاسارگارد هم برای همیشه حذف شود؟`, "حذف با حساب پاسارگارد", { delete_pg: "1" }, "danger", "این عمل برگشت‌ناپذیر است.")}
        >
          حذف همراه حساب پاسارگارد
        </Button>
      </div>
    );
  }
  return (
    <div>
      <Button
        size="sm"
        variant="danger"
        className="!rounded-lg"
        isDisabled={pending}
        onPress={() => remove(`${label} و کاربر پاسارگارد مرتبط برای همیشه حذف شوند؟`, "حذف سرویس", {}, "danger", "این عمل برگشت‌ناپذیر است.")}
      >
        حذف سرویس
      </Button>
    </div>
  );
}

function ServiceItem({ edit, service, reload, askReason }: { edit: UserEdit; service: EditService; reload: () => void; askReason: AskReason }) {
  const userId = edit.user.id;
  return (
    <li className="inset-tile flex flex-col gap-4 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm text-foreground">{service.title}</strong>
        <Chip size="sm" variant="soft" color={service.is_active ? "success" : "default"}>
          {service.status_text}
        </Chip>
        <bdi dir="ltr" className="num text-xs text-muted">
          #{service.id}
          {service.pg_username ? ` · ${service.pg_username}` : ""}
        </bdi>
      </div>
      {service.error ? <p className="text-xs text-warning">{service.error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Stat label="حجم / مانده" value={`${service.volume_text} · ${service.remain_text}`} />
        <Stat label="مانده زمان" value={service.time_label} />
      </div>
      <LinkButtons userId={userId} service={service} />
      {edit.can.pg_update ? <RenewForm userId={userId} service={service} plans={edit.plans} reload={reload} askReason={askReason} /> : null}
      {edit.can.pg_update ? <ExtendForm userId={userId} service={service} reload={reload} askReason={askReason} /> : null}
      {edit.can.pg_delete ? <DeleteButtons userId={userId} service={service} reload={reload} askReason={askReason} /> : null}
    </li>
  );
}

export function ServicesSection({ edit, reload }: Props) {
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  return (
    <GlassSection title="سرویس‌ها" description={edit.services.length ? `${fa(edit.services.length)} سرویس` : undefined}>
      {!edit.can.view_services ? (
        <EmptyBlock icon="solar:lock-keyhole-minimalistic-linear" title="دسترسی به سرویس‌های مشتری ندارید." />
      ) : edit.services.length === 0 ? (
        <EmptyBlock icon="solar:shield-network-linear" title="سرویسی برای این کاربر ثبت نشده است." />
      ) : (
        <ul className="flex flex-col gap-3">
          {edit.services.map((service) => (
            <ServiceItem key={service.id} edit={edit} service={service} reload={reload} askReason={setReason} />
          ))}
        </ul>
      )}
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </GlassSection>
  );
}

export function LedgerSection({ edit }: { edit: UserEdit }) {
  const txs = edit.wallet.transactions;
  if (txs.length === 0) return null;
  return (
    <GlassSection title="تراکنش‌های کیف پول" description={`آخرین ${fa(txs.length)} مورد`}>
      <ul className="flex flex-col gap-2">
        {txs.map((tx) => (
          <li key={tx.id} className="inset-tile flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <bdi dir="ltr" className={`num text-sm font-semibold ${tx.amount < 0 ? "text-danger" : "text-success"}`}>
                {money(tx.amount)}
              </bdi>
              <span className="min-w-0 truncate text-sm text-muted">{tx.reason || "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <bdi dir="ltr" className="num">
                #{tx.id}
              </bdi>
              <span>
                <bdi dir="ltr" className="num">
                  {money(tx.balance_after)}
                </bdi>{" "}
                تومان
              </span>
            </div>
          </li>
        ))}
      </ul>
    </GlassSection>
  );
}
