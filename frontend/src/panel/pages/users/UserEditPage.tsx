"use client";

import { Button, Chip } from "@heroui/react";
import { useEffect } from "react";

import { Icon } from "@/icons/Icon";
import { useLocation } from "@/lib/location";

import { useJson, useUrlFlash } from "../../core/data";
import { PanelShell } from "../../layout/PanelShell";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../ui/States";
import { money, userIdFromPath } from "./format";
import { RiskTagChip } from "./RiskTagChip";
import type { UserEdit } from "./types";
import {
  AssignPlanSection,
  DeleteUserSection,
  DemoSection,
  NoteSection,
  PlatformPointsSection,
  RoleSection,
  ShopBlockSection,
  ShopPointsSection,
  ShopWalletSection,
  TagSection,
  WalletSection,
} from "./UserEditForms";
import { ImportServiceSection } from "./UserEditImport";
import { LedgerSection, ServicesSection } from "./UserEditServices";
import { UserIdentity } from "./UserIdentity";

function Identity({ edit }: { edit: UserEdit }) {
  const { user, wallet } = edit;
  const tone = wallet.balance > 0 ? "text-success" : wallet.balance < 0 ? "text-danger" : "text-foreground";
  const badges = (
    <>
      <Chip size="sm" variant="soft" color={user.is_blocked ? "danger" : "success"}>
        {user.is_blocked ? "مسدود" : "فعال"}
      </Chip>
      {user.is_demo ? (
        <Chip size="sm" variant="soft">
          دمو
        </Chip>
      ) : null}
      <RiskTagChip tag={edit.tag} />
    </>
  );
  return (
    <GlassSection>
      <UserIdentity person={user} badges={badges}>
        <div className="flex flex-wrap gap-3">
          <div className="inset-tile flex min-w-44 flex-col gap-0.5 rounded-lg px-4 py-3">
            <span className="text-xs text-muted">کیف پول</span>
            <strong className={`num text-lg ${tone}`}>
              <bdi dir="ltr">{money(wallet.balance)}</bdi> تومان
            </strong>
          </div>
          <div className="inset-tile flex min-w-32 flex-col gap-0.5 rounded-lg px-4 py-3">
            <span className="text-xs text-muted">امتیاز</span>
            <strong className="num text-lg text-foreground">
              <bdi dir="ltr">{money(edit.points.balance)}</bdi>
            </strong>
          </div>
        </div>
      </UserIdentity>
    </GlassSection>
  );
}

/** Anchor targets other screens link to (`/users/7/edit#user-wallet`). */
function Anchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      {children}
    </div>
  );
}

export function EditBody({ edit, reload }: { edit: UserEdit; reload: () => void }) {
  const props = { edit, reload };
  const forms = [
    edit.can.demo ? <DemoSection key="demo" {...props} /> : null,
    edit.can.private_marks ? <TagSection key="tag" {...props} /> : null,
    edit.can.private_marks ? <NoteSection key="note" {...props} /> : null,
    edit.can.manage ? <RoleSection key="role" {...props} /> : null,
    edit.can.manage ? (
      <Anchor key="wallet" id="user-wallet">
        <WalletSection {...props} />
      </Anchor>
    ) : null,
    edit.platform_points ? (
      <Anchor key="points" id="user-points">
        <PlatformPointsSection {...props} />
      </Anchor>
    ) : null,
    edit.shop_block ? (
      <Anchor key="block" id="user-shop-block">
        <ShopBlockSection {...props} />
      </Anchor>
    ) : null,
    edit.shop_wallet ? (
      <Anchor key="shop-wallet" id="user-shop-wallet">
        <ShopWalletSection {...props} />
      </Anchor>
    ) : null,
    edit.shop_points ? (
      <Anchor key="shop-points" id="user-shop-points">
        <ShopPointsSection {...props} />
      </Anchor>
    ) : null,
    edit.can.pg_create ? <AssignPlanSection key="plan" {...props} /> : null,
    edit.can.assign_existing_service ? (
      <Anchor key="import" id="user-import-service">
        <ImportServiceSection {...props} />
      </Anchor>
    ) : null,
  ].filter(Boolean);

  // The page arrives empty, so the browser cannot scroll to the address's #anchor itself.
  useEffect(() => {
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    target?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Identity edit={edit} />
      {forms.length ? <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{forms}</div> : null}
      <Anchor id="user-services">
        <ServicesSection {...props} />
      </Anchor>
      <LedgerSection edit={edit} />
      {edit.can.delete_user ? <DeleteUserSection edit={edit} /> : null}
    </div>
  );
}

function EditContent() {
  const { path } = useLocation();
  const userId = userIdFromPath(path);
  const edit = useJson<UserEdit>(userId ? `/api/panel/users/${userId}/edit` : null);
  const { data, reload } = edit;

  // A message the server left in the address (after a create or a redirect) is shown once.
  useUrlFlash();

  const back = (
    <Button variant="outline" className="!h-12 !rounded-lg" onPress={() => window.location.assign("/users")}>
      <Icon name="solar:arrow-right-linear" size={20} />
      بازگشت به لیست
    </Button>
  );

  return (
    <>
      <PageHeader icon="solar:user-id-bold" title="ویرایش کاربر بات" description="کیف پول، سرویس‌ها و دسترسی‌های این مشتری" actions={back} />
      {!userId ? (
        <EmptyBlock icon="solar:user-cross-linear" title="کاربر یافت نشد" description="نشانی این صفحه شناسهٔ معتبر ندارد." />
      ) : edit.status === "error" && !data ? (
        <ErrorBlock message={edit.message} onRetry={reload} />
      ) : !data ? (
        <GlassSection>
          <LoadingBlock rows={5} />
        </GlassSection>
      ) : (
        <EditBody edit={data} reload={reload} />
      )}
    </>
  );
}

export function UserEditPage() {
  return (
    <PanelShell title="ویرایش کاربر">
      <EditContent />
    </PanelShell>
  );
}
