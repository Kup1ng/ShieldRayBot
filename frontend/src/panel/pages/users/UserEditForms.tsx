"use client";

import { Button, Input, Label, ListBox, Select, TextArea, TextField } from "@heroui/react";
import { useState } from "react";

import { confirm } from "../../core/confirm";
import { GlassSection } from "../../ui/Page";
import { run } from "../../core/actions";
import { money } from "./format";
import { ReasonDialog, type ReasonRequest } from "./ReasonDialog";
import { RiskTagPicker } from "./RiskTagChip";
import type { UserEdit } from "./types";
import { WalletAdjustForm } from "./WalletAdjustForm";

type SectionProps = { edit: UserEdit; reload: () => void };

/** Posts one of the screen's forms, then re-reads the screen (the figures may all have moved). */
function useSave(reload: () => void) {
  const [pending, setPending] = useState(false);
  const save = async (path: string, fields: Record<string, string>, successText: string) => {
    setPending(true);
    const result = await run(path, fields, { success: successText });
    setPending(false);
    reload();
    return result;
  };
  return { pending, save };
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; label: string }[] }) {
  return (
    <Select aria-label={label} value={value} onChange={(key) => key !== null && onChange(String(key))} fullWidth>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function DemoSection({ edit, reload }: SectionProps) {
  const [state, setState] = useState(edit.user.is_demo ? "1" : "0");
  const { pending, save } = useSave(reload);
  return (
    <GlassSection title="کاربر دمو" description="برای حساب‌های آزمایشی ادمین. سفارش‌ها و پرداخت‌های این کاربر در آمار و گزارش مالی حساب نمی‌شوند، ولی سوابق و موجودی کیف پول می‌ماند. با غیرفعال‌کردن دمو دوباره حساب می‌شوند.">
      <Choice
        label="وضعیت کاربر"
        value={state}
        onChange={setState}
        options={[
          { id: "0", label: "عادی — محاسبه در گزارش‌ها" },
          { id: "1", label: "دمو — حذف از محاسبات گزارش‌ها" },
        ]}
      />
      <div>
        <Button className="button--ink !h-12 !rounded-lg" isPending={pending} onPress={() => void save(`/users/${edit.user.id}/demo`, { is_demo: state }, "وضعیت کاربر دمو ذخیره شد")}>
          ذخیره وضعیت دمو
        </Button>
      </div>
    </GlassSection>
  );
}

export function TagSection({ edit, reload }: SectionProps) {
  const [tag, setTag] = useState(edit.tag.key);
  const { pending, save } = useSave(reload);
  return (
    <GlassSection title="تگ ریسک" description="چهار سطح ثابت — دیفالت «مطمئن». فقط کارکنان می‌بینند.">
      <RiskTagPicker tags={edit.color_tags} value={tag} onChange={(key) => setTag(key as typeof tag)} />
      <div>
        <Button className="button--ink !h-12 !rounded-lg" isPending={pending} onPress={() => void save(`/users/${edit.user.id}/color-tag`, { color_tag: tag }, "تگ ریسک ذخیره شد")}>
          ذخیره تگ ریسک
        </Button>
      </div>
    </GlassSection>
  );
}

export function NoteSection({ edit, reload }: SectionProps) {
  const [note, setNote] = useState(edit.note);
  const { pending, save } = useSave(reload);
  return (
    <GlassSection title="یادداشت داخلی" description="فقط کارکنان همین فروشگاه می‌بینند — برای پشتیبانی">
      <TextField value={note} onChange={setNote} fullWidth>
        <Label>یادداشت داخلی</Label>
        <TextArea rows={3} maxLength={2000} placeholder="مثلاً دیر کرد، کارت فلان…" />
      </TextField>
      <div>
        <Button className="button--ink !h-12 !rounded-lg" isPending={pending} onPress={() => void save(`/users/${edit.user.id}/staff-note`, { note }, "یادداشت ذخیره شد")}>
          ذخیره یادداشت
        </Button>
      </div>
    </GlassSection>
  );
}

const ROLE_OPTIONS = [
  { id: "user", label: "کاربر" },
  { id: "reseller", label: "نماینده" },
  { id: "admin", label: "مدیر" },
];

export function RoleSection({ edit, reload }: SectionProps) {
  const [role, setRole] = useState(edit.user.role);
  const { pending, save } = useSave(reload);
  const current = ROLE_OPTIONS.find((option) => option.id === edit.user.role)?.label ?? "کاربر";
  return (
    <GlassSection title="تغییر نقش" description={`نقش فعلی: ${current}`}>
      <Choice label="نقش جدید" value={role} onChange={setRole} options={ROLE_OPTIONS} />
      <div>
        <Button
          className="button--ink !h-12 !rounded-lg"
          isPending={pending}
          onPress={async () => {
            if (!(await confirm("نقش این کاربر تغییر کند؟", { confirmLabel: "اعمال نقش", tone: "warning" }))) return;
            await save(`/users/${edit.user.id}/role`, { role }, "نقش به‌روز شد");
          }}
        >
          اعمال نقش
        </Button>
      </div>
    </GlassSection>
  );
}

export function WalletSection({ edit, reload }: SectionProps) {
  return (
    <GlassSection title="تنظیم کیف پول" description="مبلغ را وارد کنید، سپس افزایش یا کاهش را بزنید. موجودی منفی مجاز نیست.">
      <WalletAdjustForm
        action={`/users/${edit.user.id}/wallet-credit`}
        nonce={edit.wallet.nonce}
        confirmMessage="موجودی کیف پول این کاربر مطابق مبلغ و نوع انتخاب‌شده تغییر کند؟"
        onDone={reload}
      />
    </GlassSection>
  );
}

export function ShopWalletSection({ edit, reload }: SectionProps) {
  const shop = edit.shop_wallet;
  if (!shop) return null;
  return (
    <GlassSection
      title="تنظیم کیف پول در این فروشگاه"
      description={`فقط کیف پول همین فروشگاه تغییر می‌کند. هر بار حداکثر ${money(shop.max)} تومان و روزانه برای کل فروشگاه ${money(shop.daily)} تومان. علت در گزارش کارکنان ثبت می‌شود.`}
    >
      <WalletAdjustForm
        action={`/users/${edit.user.id}/shop-wallet`}
        nonce={shop.nonce}
        confirmMessage="کیف پول این مشتری در فروشگاه شما مطابق مبلغ و نوع انتخاب‌شده تغییر کند؟"
        confirmDescription="این کار در گزارش کارکنان ثبت می‌شود."
        noteLabel="علت"
        noteRequired
        noteMax={200}
        onDone={reload}
      />
    </GlassSection>
  );
}

const POINTS_MODE_LABEL = "نوع تنظیم امتیاز";

export function PlatformPointsSection({ edit, reload }: SectionProps) {
  const platform = edit.platform_points;
  if (!platform) return null;
  return (
    <GlassSection title="تنظیم امتیاز" description="امتیاز پلتفرم این کاربر. علت الزامی است و فقط در دفترکل ثبت می‌شود؛ برای مشتری ارسال نمی‌شود.">
      <WalletAdjustForm
        action={`/users/${edit.user.id}/points-adjust`}
        nonce={platform.nonce}
        confirmMessage="امتیاز این کاربر مطابق مقدار و نوع انتخاب‌شده تغییر کند؟"
        amountLabel="امتیاز"
        amountField="points"
        noteField="reason"
        noteLabel="علت"
        noteRequired
        noteMax={200}
        minAmount={1}
        modeLabel={POINTS_MODE_LABEL}
        successText="امتیاز به‌روز شد"
        onDone={reload}
      />
    </GlassSection>
  );
}

export function ShopPointsSection({ edit, reload }: SectionProps) {
  const shop = edit.shop_points;
  if (!shop) return null;
  return (
    <GlassSection
      title="تغییر امتیاز در این فروشگاه"
      description={`فقط امتیاز همین فروشگاه تغییر می‌کند. هر بار حداکثر ${money(shop.max)} امتیاز و روزانه برای کل فروشگاه ${money(shop.daily)} امتیاز. علت در گزارش کارکنان ثبت می‌شود.`}
    >
      <WalletAdjustForm
        action={`/users/${edit.user.id}/shop-points`}
        nonce={shop.nonce}
        confirmMessage="امتیاز این مشتری در فروشگاه شما تغییر کند؟"
        confirmDescription="این کار در گزارش کارکنان ثبت می‌شود."
        amountLabel="امتیاز"
        amountField="points"
        noteField="reason"
        noteLabel="علت"
        noteRequired
        noteMax={200}
        minAmount={1}
        modeLabel={POINTS_MODE_LABEL}
        successText="امتیاز به‌روز شد"
        onDone={reload}
      />
    </GlassSection>
  );
}

export function ShopBlockSection({ edit, reload }: SectionProps) {
  const block = edit.shop_block;
  const [reason, setReason] = useState("");
  const { pending, save } = useSave(reload);
  if (!block) return null;
  const path = `/users/${edit.user.id}/shop-block`;
  return (
    <GlassSection
      title="مسدودسازی در این فروشگاه"
      description="فقط ربات و مینی‌اپ همین فروشگاه برای این مشتری بسته می‌شود؛ سرویس‌های فعلی‌اش قطع نمی‌شوند و در فروشگاه‌های دیگر اثری ندارد."
    >
      {block.blocked ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-danger">مسدود در این فروشگاه</span>
            {block.reason ? (
              <span className="text-muted" dir="auto">
                {block.reason}
              </span>
            ) : null}
          </p>
          <div>
            <Button
              className="button--ink !h-12 !rounded-lg"
              isPending={pending}
              onPress={async () => {
                if (!(await confirm("مسدودی این مشتری در فروشگاه شما برداشته شود؟", { confirmLabel: "رفع مسدودی" }))) return;
                await save(path, { action: "unblock" }, "مسدودی مشتری در این فروشگاه برداشته شد");
              }}
            >
              رفع مسدودی
            </Button>
          </div>
        </>
      ) : (
        <>
          <TextField value={reason} onChange={setReason} isRequired fullWidth>
            <Label>علت</Label>
            <Input maxLength={200} placeholder="الزامی" autoComplete="off" />
          </TextField>
          <div>
            <Button
              variant="danger"
              className="!h-12 !rounded-lg"
              isPending={pending}
              isDisabled={reason.trim().length < 3}
              onPress={async () => {
                const ok = await confirm("این مشتری در ربات و مینی‌اپ فروشگاه شما مسدود شود؟", {
                  description: "سرویس‌های فعلی‌اش قطع نمی‌شوند.",
                  confirmLabel: "مسدود کن",
                  tone: "danger",
                });
                if (!ok) return;
                const result = await save(path, { action: "block", reason: reason.trim() }, "مشتری در این فروشگاه مسدود شد");
                if (result?.ok) setReason("");
              }}
            >
              مسدود کردن در این فروشگاه
            </Button>
          </div>
        </>
      )}
    </GlassSection>
  );
}

export function AssignPlanSection({ edit, reload }: SectionProps) {
  const [plan, setPlan] = useState("");
  const { pending, save } = useSave(reload);
  return (
    <GlassSection title="اختصاص پلن جدید" description="ساخت سرویس پاسارگارد و لینک اشتراک — بدون سفارش و پرداخت">
      {edit.plans.length === 0 ? (
        <p className="text-sm text-muted">پلن فعالی در کاتالوگ این فروشگاه نیست.</p>
      ) : (
        <>
          <Select aria-label="پلن" placeholder="انتخاب پلن…" value={plan || null} onChange={(key) => setPlan(key === null ? "" : String(key))} fullWidth>
            <Label>پلن</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {edit.plans.map((item) => (
                  <ListBox.Item key={item.id} id={String(item.id)} textValue={item.label}>
                    {item.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <div>
            <Button
              className="button--ink !h-12 !rounded-lg"
              isPending={pending}
              isDisabled={!plan}
              onPress={async () => {
                const ok = await confirm("پلن انتخابی برای این کاربر فعال شود؟", { description: "کاربر پاسارگارد جدید ساخته می‌شود.", confirmLabel: "اختصاص پلن" });
                if (!ok) return;
                const result = await save(`/users/${edit.user.id}/services`, { plan_id: plan }, "پلن اختصاص داده شد");
                if (result?.ok) setPlan("");
              }}
            >
              اختصاص پلن
            </Button>
          </div>
        </>
      )}
    </GlassSection>
  );
}

export function DeleteUserSection({ edit }: { edit: UserEdit }) {
  const [request, setRequest] = useState<ReasonRequest | null>(null);
  const balance = edit.wallet.balance;
  const open = () => {
    const warn = balance > 0 ? `هشدار: موجودی کیف پول ${money(balance)} تومان از بین می‌رود. ` : "";
    setRequest({
      title: "تأیید حذف کاربر",
      message: `${warn}کاربر و تمام سفارش‌ها، سرویس‌ها، پرداخت‌ها و تیکت‌های مرتبط کامل حذف شوند؟ این عمل برگشت‌ناپذیر است. توجه: اگر دوباره به ربات پیام بدهد، حساب جدید (خالی) برای همان تلگرام ساخته می‌شود.`,
      confirmLabel: "حذف کاربر",
      reasonLabel: "علت حذف",
      tone: "danger",
      onConfirm: async (reason) => {
        const result = await run(`/users/${edit.user.id}/delete`, { reason, confirm_reason: reason }, { success: "کاربر حذف شد" });
        if (result?.ok) window.location.assign("/users");
      },
    });
  };
  return (
    <GlassSection title="حذف کاربر" description="حساب و همهٔ سفارش‌ها، سرویس‌ها، پرداخت‌ها و تیکت‌های او حذف می‌شود و برگشت ندارد. اگر دوباره به ربات پیام بدهد، حساب خالی جدیدی ساخته می‌شود.">
      {balance > 0 ? (
        <p role="note" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          <strong>
            موجودی کیف پول: <bdi dir="ltr">{money(balance)}</bdi> تومان
          </strong>{" "}
          — با حذف کاربر این موجودی از بین می‌رود.
        </p>
      ) : null}
      <div>
        <Button variant="danger" className="!h-12 !rounded-lg" onPress={open}>
          حذف کاربر
        </Button>
      </div>
      <ReasonDialog request={request} onClose={() => setRequest(null)} />
    </GlassSection>
  );
}
