"use client";

import { Button, toast } from "@heroui/react";
import { useEffect } from "react";

import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { followLocation, stashFlash, takeFlash } from "../../core/actions";
import type { ActionResult } from "../../core/api";
import { useJson, useUrlFlash } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader } from "../../ui/Page";
import { LoadingBlock, Loadable, Notice } from "../../ui/States";
import { PlanEditForm } from "./PlanForms";
import { LimitBoard } from "./PlanParts";
import { ResellerPlanForm } from "./ResellerPlanForm";
import type { PlanEdit, ResellerPlanEdit } from "./types";

/** The numeric id in `/plans/12/edit` (or `/resellers/plans/12/edit`), or null before the page knows its address. */
export function planIdFromPath(path: string, prefix: "plans" | "resellers/plans"): number | null {
  const match = new RegExp(`^/${prefix}/([0-9]+)/edit$`).exec(path);
  return match ? Number(match[1]) : null;
}

/** The message in the address, or the one the previous page kept across the redirect. */
function useEntryFlash() {
  useUrlFlash();
  useEffect(() => {
    const stashed = takeFlash();
    if (stashed) toast.success(stashed);
  }, []);
}

function BackButton({ href }: { href: string }) {
  return (
    <Button variant="outline" className="!h-12 !rounded-lg" onPress={() => window.location.assign(href)}>
      <Icon name="solar:arrow-right-linear" size={20} />
      بازگشت
    </Button>
  );
}

const saved = (result: ActionResult) => {
  stashFlash(result.message);
  followLocation(result.location || "/plans");
};

function MissingPlan({ back }: { back: string }) {
  return (
    <GlassSection>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-foreground/80">پلن یافت نشد.</p>
        <BackButton href={back} />
      </div>
    </GlassSection>
  );
}

function PlanEditBody({ id }: { id: number }) {
  const plan = useJson<PlanEdit>(`/api/panel/plans/${id}`);
  useEntryFlash();
  return (
    <>
      <PageHeader icon="solar:pen-bold" title={`ویرایش پلن #${id.toLocaleString("fa-IR")}`} description="نام، قیمت، مدت، حجم و اتصال این پلن به پاسارگارد" actions={<BackButton href="/plans" />} />
      {plan.status === "error" && plan.message.includes("یافت نشد") ? (
        <MissingPlan back="/plans" />
      ) : (
        <Loadable state={plan} rows={2}>
          {(data) => (
            <>
              {data.pg_error ? <Notice>پاسارگارد: {data.pg_error}</Notice> : null}
              <LimitBoard limits={data.limits} heading="سقف حساب پاسارگارد" />
              <GlassSection>
                <PlanEditForm data={data} onDone={saved} onCancel={() => window.location.assign("/plans")} />
              </GlassSection>
            </>
          )}
        </Loadable>
      )}
    </>
  );
}

export function PlanEditPage() {
  const { path } = useLocation();
  const id = planIdFromPath(path, "plans");
  return <PanelShell title="ویرایش پلن">{id === null ? <LoadingBlock rows={2} /> : <PlanEditBody id={id} />}</PanelShell>;
}

function ResellerPlanEditBody({ id }: { id: number }) {
  const plan = useJson<ResellerPlanEdit>(`/api/panel/plans/reseller/${id}`);
  useEntryFlash();
  const back = "/plans?tab=resellers#reseller-plans";
  return (
    <>
      <PageHeader icon="solar:pen-bold" title="ویرایش پلن نمایندگی" description="قیمت، ظرفیت، تمدید و دسترسی‌های این پلن نمایندگی" actions={<BackButton href={back} />} />
      {plan.status === "error" && plan.message.includes("یافت نشد") ? (
        <MissingPlan back={back} />
      ) : (
        <Loadable state={plan} rows={2}>
          {(data) => (
            <>
              <LimitBoard limits={data.limits} heading="سقف ادمین اصلی" caption="ظرفیت این پلن از سقف زنده ادمین اصلی بیشتر نمی‌شود" />
              <GlassSection>
                <ResellerPlanForm
                  mode="edit"
                  plan={data.plan}
                  groups={data.groups}
                  pgRoles={data.pg_roles}
                  featurePerms={data.feature_perms}
                  selectedPerms={data.selected_perms}
                  limits={data.limits}
                  categories={data.categories}
                  styleOptions={data.plan_style_options}
                  packStyleOptions={data.pack_style_options}
                  packConfig={data.pack_config.reseller}
                  packs={data.packs}
                  onDone={(result) => {
                    stashFlash(result.message);
                    followLocation(back);
                  }}
                  onCancel={() => window.location.assign(back)}
                />
              </GlassSection>
            </>
          )}
        </Loadable>
      )}
    </>
  );
}

export function ResellerPlanEditPage() {
  const { path } = useLocation();
  const id = planIdFromPath(path, "resellers/plans");
  return <PanelShell title="ویرایش پلن نمایندگی">{id === null ? <LoadingBlock rows={2} /> : <ResellerPlanEditBody id={id} />}</PanelShell>;
}
