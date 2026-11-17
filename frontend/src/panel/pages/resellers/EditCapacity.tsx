"use client";

import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { Ltr } from "../../ui/Data";
import { FormGrid, TextInput } from "../../ui/Fields";
import { GlassSection } from "../../ui/Page";
import { Notice } from "../../ui/States";
import { SubmitButton } from "../../ui/Fields";
import { Button } from "@heroui/react";
import type { CapacityView, Meter, PgLimits } from "./types";

const DAYS_LIMIT = 3650;
const GB_LIMIT = 10000;

function MeterRow({ label, meter }: { label: string; meter: Meter }) {
  const percent = meter.has_limit ? Math.max(0, Math.min(100, meter.pct ?? 0)) : 0;
  const bar = meter.exhausted ? "bg-danger" : meter.tone === "warn" ? "bg-warning" : "bg-success";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        <Ltr className="text-sm font-semibold text-foreground">{meter.has_limit ? meter.ratio_text : meter.used_text}</Ltr>
      </div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="h-2 w-full overflow-hidden rounded-full bg-default">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-muted">{meter.has_limit ? `باقی‌مانده ${meter.remain_text}` : "بدون سقف"}</span>
    </div>
  );
}

/** The shop's panel admin: users and traffic against the role's limits. */
export function PgLimitsSection({ limits }: { limits: PgLimits }) {
  return (
    <GlassSection title="مصرف و محدودیت پاسارگارد" description="حجم و تعداد کاربران نماینده به‌همراه سقف‌های نقش/ادمین">
      {limits.username ? (
        <p className="text-sm text-muted">
          ادمین: <Ltr>{limits.username}</Ltr>
          {limits.status_label ? ` · ${limits.status_label}` : ""}
          {limits.role_name ? ` · ${limits.role_name}` : ""}
        </p>
      ) : null}
      {limits.users || limits.traffic ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {limits.users ? <MeterRow label="کاربران" meter={limits.users} /> : null}
          {limits.traffic ? <MeterRow label="حجم" meter={limits.traffic} /> : null}
        </div>
      ) : null}
      {limits.lifetime_text ? (
        <p className="text-sm text-muted">
          مصرف lifetime (مبنای صورتحساب PAYG): <Ltr>{limits.lifetime_text}</Ltr>
        </p>
      ) : null}
    </GlassSection>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="inset-tile flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{children}</span>
    </li>
  );
}

function Warnings({ sub }: { sub: CapacityView }) {
  return (
    <>
      {sub.alloc_is_oversold ? <Notice tone="warning">تخصیص حجم این نماینده از سقف بیشتر است. افزایش حجم تا کاهش یا حذف سرویس‌ها مسدود است.</Notice> : null}
      {sub.alloc_external_stale ? <Notice tone="warning">کاربرانی که مستقیم در پاسارگارد ساخته شده‌اند مدتی است شمرده نشده‌اند؛ آخرین مقدار شمرده‌شده حساب می‌شود. اتصال پنل را بررسی کنید.</Notice> : null}
      {sub.alloc_uncapped_children.length ? (
        <Notice tone="warning" title="زیرنماینده‌های بدون سقف حجم (از حجم این نماینده کم نمی‌کنند و محدود هم نمی‌شوند)">
          {sub.alloc_uncapped_children.map((child) => (
            <Ltr key={child.shop_id} className="me-3 inline-block">
              #{child.shop_id} {child.pg_username}
            </Ltr>
          ))}
        </Notice>
      ) : null}
      {sub.alloc_unlimited.length ? (
        <Notice tone="warning" title="سرویس‌های نامحدود یا همگام‌نشده (در تخصیص صفر حساب می‌شوند)">
          {sub.alloc_unlimited.map((service) => (
            <Ltr key={service.id} className="me-3 inline-block">
              #{service.id} {service.pg_username} ({service.kind})
            </Ltr>
          ))}
        </Notice>
      ) : null}
      {sub.can_sync && sub.differs ? <Notice tone="warning">ظرفیت ثبت‌شده با سقف فعلی ادمین در پاسارگارد یکی نیست. اگر سقف پاسارگارد درست است، «همگام‌سازی از پاسارگارد» را بزنید.</Notice> : null}
    </>
  );
}

/** Free days/GB adjustment of the panel subscription and the owner's re-sync from the panel. */
export function CapacitySection({ shopId, sub, onSettled }: { shopId: number; sub: CapacityView; onSettled: (result: ActionResult | null) => void }) {
  const [days, setDays] = useState("0");
  const [gb, setGb] = useState("0");
  const { pending, track } = usePending();

  const sync = () =>
    track(async () =>
      onSettled(
        await run(
          `/resellers/${shopId}/subscription/sync`,
          {},
          { ask: { title: "همگام‌سازی ظرفیت", text: "ظرفیت ثبت‌شده این نماینده برابر سقف فعلی ادمین در پاسارگارد شود؟ چیزی در پاسارگارد تغییر نمی‌کند.", confirmLabel: "همگام‌سازی" } },
        ),
      ),
    );

  const adjust = (event: FormEvent) => {
    event.preventDefault();
    void track(async () =>
      onSettled(
        await run(
          `/resellers/${shopId}/subscription/adjust`,
          { extra_days: days.trim() || "0", extra_gb: gb.trim() || "0" },
          { ask: { title: "تغییر ظرفیت اشتراک", text: "ظرفیت اشتراک نماینده تغییر کند؟ (مثبت = افزایش، منفی = کاهش)", confirmLabel: "اعمال" } },
        ),
      ),
    );
  };

  return (
    <GlassSection title="تغییر ظرفیت اشتراک" description="تنظیم رایگان روز/حجم اشتراک پاسارگارد (مثبت = افزایش، منفی = کاهش)">
      <ul className="grid gap-2 sm:grid-cols-2">
        <Meta label="انقضا">{sub.expires_at ?? "نامحدود"}</Meta>
        <Meta label="حجم کل">{sub.total_gb_text}</Meta>
        <Meta label="حجم اضافه">{sub.extra_gb_text}</Meta>
        {sub.alloc_ratio_text ? (
          <>
            <Meta label="تخصیص / سقف">
              <Ltr>{sub.alloc_ratio_text}</Ltr>
            </Meta>
            <Meta label="ساخته‌شده مستقیم در پاسارگارد">{sub.alloc_external_text}</Meta>
            <Meta label="واگذارشده به زیرنماینده‌ها">{sub.alloc_children_text}</Meta>
            <Meta label="حجم در اختیار منقضی‌ها">{sub.alloc_expired_held_text}</Meta>
          </>
        ) : null}
        <Meta label="کاربران کل">{sub.total_users_text}</Meta>
        <Meta label="کاربران اضافه">{sub.extra_users_text}</Meta>
        {sub.can_sync ? (
          <Meta label="سقف فعلی در پاسارگارد">
            {sub.live_gb_text} · {sub.live_users_text}
          </Meta>
        ) : null}
      </ul>
      <Warnings sub={sub} />
      {sub.can_sync ? (
        <div>
          <Button variant="outline" size="sm" isPending={pending} onPress={() => void sync()}>
            همگام‌سازی از پاسارگارد
          </Button>
        </div>
      ) : null}
      <form className="flex flex-col gap-4" onSubmit={adjust}>
        <FormGrid>
          <TextInput label="روز" type="number" value={days} onChange={setDays} min={-DAYS_LIMIT} max={DAYS_LIMIT} step={1} ltr />
          <TextInput label="گیگ" type="number" value={gb} onChange={setGb} min={-GB_LIMIT} max={GB_LIMIT} step={1} ltr />
        </FormGrid>
        <div>
          <SubmitButton pending={pending}>تغییر ظرفیت</SubmitButton>
        </div>
      </form>
    </GlassSection>
  );
}
