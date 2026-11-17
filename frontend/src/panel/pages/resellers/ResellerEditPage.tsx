"use client";

import { Button, toast } from "@heroui/react";
import { useEffect, useState } from "react";

import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { followLocation, run, stashFlash, takeFlash, usePending } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { pathId, useJson, useUrlFlash } from "../../core/data";
import { toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { RiskTagChip } from "../users/RiskTagChip";
import { Ltr, StatusChip } from "../../ui/Data";
import { SelectInput, SubmitButton } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { Loadable, LoadingBlock } from "../../ui/States";
import { ColorTagPanel } from "./ColorTagDialog";
import { CapacitySection, PgLimitsSection } from "./EditCapacity";
import { CreditSection } from "./EditCredit";
import { nextStep } from "./editFields";
import { EditProfileForm } from "./EditProfileForm";
import { RotationRetry } from "./EditRotation";
import { FixedWalletSection, PaygSection } from "./EditWallet";
import { roleLabel } from "./labels";
import { ReasonDialog, type ReasonRequest } from "./ReasonDialog";
import type { ResellerEdit } from "./types";

const EDIT_PATH = /^\/resellers\/(\d+)\/edit$/;
const LIST = "/resellers";

const ROLE_OPTIONS = [
  { id: "user", label: "کاربر" },
  { id: "reseller", label: "نماینده" },
  { id: "admin", label: "مدیر" },
];

function RoleSection({ data, onSettled }: { data: ResellerEdit; onSettled: (result: ActionResult | null) => void }) {
  const [role, setRole] = useState(data.user.role);
  const { pending, track } = usePending();
  return (
    <GlassSection title="تغییر نقش کاربر" description={`نقش فعلی: ${roleLabel(data.user.role)}`}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void track(async () =>
            onSettled(await run(`/resellers/${data.user.id}/role`, { role }, { ask: { title: "تأیید تغییر نقش", text: "نقش این کاربر تغییر کند؟", confirmLabel: "اعمال نقش" } })),
          );
        }}
      >
        <SelectInput label="نقش جدید" value={role} onChange={setRole} options={ROLE_OPTIONS} className="w-full sm:w-64" />
        <SubmitButton pending={pending}>اعمال نقش</SubmitButton>
      </form>
    </GlassSection>
  );
}

function deleteShop(data: ResellerEdit, onSettled: (result: ActionResult | null) => void): ReasonRequest {
  return {
    title: "حذف نمایندگی (+ ادمین پاسارگارد)",
    text: "نمایندگی و ادمین پاسارگارد متصل حذف شوند؟ علت برای کاربر ارسال می‌شود.",
    reasonLabel: "علت حذف نمایندگی",
    confirmLabel: "حذف نمایندگی و ادمین",
    onConfirm: async (reason) => onSettled(await run(`/resellers/${data.user.id}/delete`, { reason })),
  };
}

function deleteUser(data: ResellerEdit, onSettled: (result: ActionResult | null) => void): ReasonRequest {
  const wallet = data.user.wallet_balance;
  const warning = wallet > 0 ? `هشدار: موجودی کیف پول ${toman(wallet)} از بین می‌رود. ` : "";
  return {
    title: "حذف کامل (+ ادمین پاسارگارد)",
    text: `${warning}کاربر کامل به‌همراه نمایندگی، ادمین پاسارگارد، سفارش‌ها و سرویس‌ها حذف شود؟ برگشت‌ناپذیر است. توجه: اگر دوباره به ربات پیام بدهد، حساب جدید (خالی) برای همان تلگرام ساخته می‌شود.`,
    reasonLabel: "علت حذف کامل کاربر",
    confirmLabel: "حذف کامل",
    onConfirm: async (reason) => onSettled(await run(`/resellers/${data.user.id}/delete-user`, { reason })),
  };
}

function DangerSections({ data, onSettled }: { data: ResellerEdit; onSettled: (result: ActionResult | null) => void }) {
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  const wallet = data.user.wallet_balance;
  return (
    <>
      <GlassSection title="حذف نمایندگی" description="پروفایل نماینده و ادمین پاسارگارد او حذف می‌شود و نقشش به «کاربر» برمی‌گردد. علت برای او در تلگرام فرستاده می‌شود.">
        <div>
          <Button variant="danger-soft" className="!h-12 !rounded-lg" onPress={() => setReason(deleteShop(data, onSettled))}>
            حذف نمایندگی
          </Button>
        </div>
      </GlassSection>
      <GlassSection title="حذف کامل کاربر" description="حساب، نمایندگی، ادمین پاسارگارد و همهٔ سفارش‌ها، سرویس‌ها، پرداخت‌ها و تیکت‌های او حذف می‌شود و برگشت ندارد. اگر دوباره به ربات پیام بدهد، حساب خالی جدیدی ساخته می‌شود.">
        {wallet > 0 ? (
          <p className="text-sm text-warning">
            موجودی کیف پول: {toman(wallet)} — با حذف کامل از بین می‌رود.
          </p>
        ) : null}
        <div>
          <Button variant="danger-soft" className="!h-12 !rounded-lg" onPress={() => setReason(deleteUser(data, onSettled))}>
            حذف کامل کاربر
          </Button>
        </div>
      </GlassSection>
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </>
  );
}

function Identity({ data }: { data: ResellerEdit }) {
  return (
    <GlassSection>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="truncate text-lg font-bold text-foreground" dir="auto">
            {data.user.name || "نماینده"}
          </h3>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Ltr>{data.user.telegram_id}</Ltr>
            <StatusChip color={data.user.role === "reseller" ? "success" : "default"}>{roleLabel(data.user.role)}</StatusChip>
            <RiskTagChip tag={{ key: data.user.color_tag as "green", title: data.color_tags.find((t) => t.key === data.user.color_tag)?.title ?? "" }} />
          </p>
        </div>
        <div className="inset-tile flex min-w-44 flex-col gap-0.5 rounded-lg px-4 py-3">
          <span className="text-xs text-muted">کیف پول</span>
          <strong className="num text-lg">{toman(data.user.wallet_balance)}</strong>
        </div>
      </div>
    </GlassSection>
  );
}

function EditBody({ id }: { id: number }) {
  const state = useJson<ResellerEdit>(`/api/panel/resellers/${id}/edit`);
  const { reload } = state;
  useUrlFlash();
  useEffect(() => {
    const message = takeFlash();
    if (message) toast.success(message);
  }, []);

  /** Reload when the handler stayed on this shop; otherwise carry its message to the page it went to. */
  const settled = (result: ActionResult | null) => {
    if (result && nextStep(result.location, id) === "leave") {
      stashFlash(result.message);
      followLocation(result.location);
      return;
    }
    reload();
  };

  return (
    <>
      <PageHeader
        icon="solar:pen-bold"
        tone="blue"
        title="ویرایش نماینده"
        description="سقف، دسترسی و اتصال پاسارگارد"
        actions={
          <Button variant="outline" className="!h-12 !rounded-lg" onPress={() => window.location.assign(LIST)}>
            <Icon name="solar:arrow-right-linear" size={20} />
            بازگشت
          </Button>
        }
      />
      <Loadable state={state} rows={6}>
        {(data) => (
          <div className="flex flex-col gap-6">
            <Identity data={data} />
            <GlassSection title="تگ ریسک" description="چهار سطح ثابت برای نماینده — دیفالت «مطمئن». فقط کارکنان می‌بینند.">
              <ColorTagPanel userId={data.user.id} current={data.user.color_tag} tags={data.color_tags} onDone={reload} />
            </GlassSection>
            <RoleSection key={data.user.role} data={data} onSettled={settled} />
            <EditProfileForm key={JSON.stringify(data.profile) + data.selected_perms.join()} data={data} onSettled={settled} />
            <RotationRetry shopId={data.user.id} pending={data.profile.pg_password_rotation_pending} onSettled={settled} />
            {data.pg_limits ? <PgLimitsSection limits={data.pg_limits} /> : null}
            {data.pg_subscription ? <CapacitySection key={data.topup_nonce} shopId={data.user.id} sub={data.pg_subscription} onSettled={settled} /> : null}
            {data.is_payg && data.payg ? (
              <PaygSection key={data.topup_nonce} shopId={data.user.id} payg={data.payg} suspended={data.profile.billing_suspended} watermark={data.profile.watermark_text} nonce={data.topup_nonce} onSettled={settled} />
            ) : (
              <FixedWalletSection key={data.topup_nonce} shopId={data.user.id} balance={data.user.wallet_balance} nonce={data.topup_nonce} onSettled={settled} />
            )}
            {data.is_payg && data.credit ? <CreditSection shopId={data.user.id} credit={data.credit} onSettled={settled} /> : null}
            <DangerSections data={data} onSettled={settled} />
          </div>
        )}
      </Loadable>
    </>
  );
}

export function ResellerEditPage() {
  const { path } = useLocation();
  const id = pathId(path, EDIT_PATH);
  return <PanelShell title="ویرایش نماینده">{id === null ? <LoadingBlock rows={4} /> : <EditBody id={id} />}</PanelShell>;
}
