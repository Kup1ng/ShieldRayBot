"use client";

import { Button, Tabs } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { useJson, useUrlFlash } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { PageHeader } from "../../ui/Page";
import { Loadable, Notice } from "../../ui/States";
import { CategoriesDialog, type CategoriesRequest } from "./CategoriesDialog";
import { PackDialog, PlanDialog, type Audience, type PlanDialogState } from "./PlanDialog";
import { LimitBoard } from "./PlanParts";
import { groupAnchor } from "./planBoard";
import { type PackDraft } from "./PlanForms";
import { ResellerPlansSection } from "./ResellerPlansSection";
import type { PlansOverview } from "./types";
import { UserPlansSection, type SpecialKind } from "./UserPlansSection";

const RESELLER_HASHES: Record<string, string> = { "#reseller-plans": "fixed", "#reseller-plans-fixed": "fixed", "#reseller-plans-payg": "payg", "#reseller-plans-addons": "addon_volume" };

type Tab = "users" | "resellers";

const ARRIVED_RING = ["ring-2", "ring-accent", "rounded-lg"];
const ARRIVED_MS = 1800;

/** Bring a category's group into view and mark it for a moment (after saving it from the list). */
function landOnGroup(categoryId: number): void {
  const group = document.getElementById(groupAnchor(categoryId));
  if (!group) return;
  group.scrollIntoView({ block: "center" });
  group.classList.add(...ARRIVED_RING);
  window.setTimeout(() => group.classList.remove(...ARRIVED_RING), ARRIVED_MS);
}

function PlansBody({ data, reload }: { data: PlansOverview; reload: () => void }) {
  const { search } = useLocation();
  const urlTab: Tab = data.is_platform_admin && new URLSearchParams(search).get("tab") === "resellers" ? "resellers" : "users";
  // A link to #reseller-plans… opens the reseller tab (this body only mounts in the browser).
  const [chosen, setChosen] = useState<Tab | null>(() => (data.is_platform_admin && RESELLER_HASHES[window.location.hash] ? "resellers" : null));
  const tab: Tab = chosen ?? urlTab;
  const [dialog, setDialog] = useState<PlanDialogState>(null);
  const [pack, setPack] = useState<PackDraft | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(() => typeof window !== "undefined" && ["1", "true", "yes"].includes(new URLSearchParams(window.location.search).get("categories") ?? ""));
  const [categoriesRequest, setCategoriesRequest] = useState<CategoriesRequest>({ key: 0, back: "", editId: null });
  // The group to bring into view once the list has reloaded: a category id, or the last one for a new category.
  const landing = useRef<number | "last" | null>(null);

  // A message the server left in the address (after a redirect), shown once.
  useUrlFlash();

  useEffect(() => {
    const target = landing.current;
    if (target === null) return;
    landing.current = null;
    const categoryId = target === "last" ? data.plan_board.groups.at(-1)?.category_id : target;
    if (categoryId !== undefined) landOnGroup(categoryId);
  }, [data.plan_board]);

  useEffect(() => {
    if (!data.is_platform_admin || !RESELLER_HASHES[window.location.hash]) return;
    window.setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }, [data.is_platform_admin]);

  const selectTab = (key: Tab) => {
    setChosen(key);
    const url = new URL(window.location.href);
    if (key === "resellers") url.searchParams.set("tab", "resellers");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  const openAdd = () => {
    const hash = window.location.hash;
    const audience: Audience = data.is_platform_admin && (tab === "resellers" || RESELLER_HASHES[hash]) ? "resellers" : "users";
    setDialog({ audience, kind: audience === "resellers" ? (RESELLER_HASHES[hash] ?? "fixed") : "fixed" });
  };
  const openCategories = (back: CategoriesRequest["back"], editId: number | null) => {
    setCategoriesRequest((prev) => ({ key: prev.key + 1, back, editId }));
    setCategoriesOpen(true);
  };
  const categorySaved = (id: number | null) => {
    // From the list the dialog closes and the page lands on the group; from the header it stays open for the next one.
    if (categoriesRequest.back === "list") {
      landing.current = id ?? "last";
      setCategoriesOpen(false);
    }
    reload();
  };
  const done = () => {
    setDialog(null);
    setPack(null);
    reload();
  };

  return (
    <>
      <PageHeader
        icon="solar:tag-price-bold"
        title="پلن‌ها"
        description="پلن‌های فروش، تست، دلخواه و عمده، بسته‌های حجم و زمان و پلن‌های نمایندگی"
        actions={
          <>
            <Button variant="outline" className="!h-12 !rounded-lg" onPress={() => openCategories("", null)}>
              <Icon name="solar:tag-horizontal-bold" size={20} />
              برچسب دسته
            </Button>
            <Button className="button--ink !h-12 !rounded-lg" onPress={openAdd}>
              <Icon name="solar:add-circle-bold" size={20} />
              افزودن پلن
            </Button>
          </>
        }
      />
      {data.pg_error ? <Notice>پاسارگارد: {data.pg_error} — پلن‌ها را می‌توانید ذخیره کنید ولی تحویل نیاز به اتصال دارد.</Notice> : null}
      <LimitBoard limits={data.limits} />
      {data.is_platform_admin ? (
        <Tabs selectedKey={tab} onSelectionChange={(key) => selectTab(key === "resellers" ? "resellers" : "users")} className="mb-6">
          <Tabs.ListContainer>
            <Tabs.List aria-label="نوع پلن">
              <Tabs.Tab id="users">
                پلن کاربر
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="resellers">
                <Tabs.Separator />
                پلن نماینده
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      ) : null}
      {tab === "resellers" && data.is_platform_admin ? (
        <ResellerPlansSection plans={data.reseller_plans} error={data.reseller_plans_error} reload={reload} />
      ) : (
        <UserPlansSection
          data={data}
          reload={reload}
          onSetting={(kind: SpecialKind) => setDialog({ audience: "users", kind })}
          onEditPack={setPack}
          onAddPlan={(categoryId) => setDialog({ audience: "users", kind: "fixed", category: String(categoryId) })}
          onEditCategory={(categoryId) => openCategories("list", categoryId)}
        />
      )}
      <PlanDialog data={data} state={dialog} onChange={setDialog} onClose={() => setDialog(null)} onDone={done} onCategoryAdded={reload} />
      <PackDialog data={data} draft={pack} onClose={() => setPack(null)} onDone={done} />
      <CategoriesDialog isOpen={categoriesOpen} onOpenChange={setCategoriesOpen} request={categoriesRequest} categories={data.categories} isAdmin={data.is_platform_admin} styleOptions={data.category_style_options} reload={reload} onSaved={categorySaved} />
    </>
  );
}

export function PlansPage() {
  const overview = useJson<PlansOverview>("/api/panel/plans");
  return (
    <PanelShell title="پلن‌ها">
      {overview.data ? null : <PageHeader icon="solar:tag-price-bold" title="پلن‌ها" description="پلن‌های فروش، تست، دلخواه و عمده، بسته‌های حجم و زمان و پلن‌های نمایندگی" />}
      <Loadable state={overview} rows={4}>
        {(data) => <PlansBody data={data} reload={overview.reload} />}
      </Loadable>
    </PanelShell>
  );
}
