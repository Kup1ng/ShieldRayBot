"use client";

import { Button, Chip } from "@heroui/react";

import { IconTile } from "@/components/ui/IconTile";
import { Icon } from "@/icons/Icon";

import { num } from "../../core/format";
import { ActionButton } from "../../ui/ActionButton";
import { EmptyState } from "../../ui/ScreenState";
import { PriceText } from "../shop/PriceText";
import { Description, InsetBlock } from "../shop/parts";
import { planMetaText } from "../shop/planGroups";
import { categoryGroups, hasRenewablePlans, type CategoryGroup, type RenewPlan, type RenewRelation, type RenewalOptions } from "./renewalOptions";

const RELATIONS: Record<RenewRelation, { label: string; color: "success" | "accent" | "warning" }> = {
  current: { label: "پلن فعلی", color: "success" },
  upgrade: { label: "ارتقا", color: "accent" },
  downgrade: { label: "تنزل", color: "warning" },
};

/** One renewable plan: its name and terms, how it compares to the service's plan, and its price. */
function PlanRow({ plan, onPick }: { plan: RenewPlan; onPick: (plan: RenewPlan) => void }) {
  const relation = plan.relation ? RELATIONS[plan.relation] : undefined;
  return (
    <Button
      variant="secondary"
      onPress={() => onPick(plan)}
      className="inset-tile !h-auto min-h-14 !w-full !justify-start !gap-3 !rounded-lg !p-3 text-start"
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="flex w-full min-w-0 items-center gap-2">
          <span dir="auto" className="min-w-0 truncate text-sm font-medium text-foreground">
            {plan.name}
          </span>
          {relation ? (
            <Chip size="sm" variant="soft" color={relation.color}>
              <Chip.Label>{relation.label}</Chip.Label>
            </Chip>
          ) : null}
        </span>
        <span className="text-xs text-muted">{planMetaText(plan)}</span>
        <Description text={plan.description} />
      </span>
      <PriceText quote={plan} className="shrink-0 items-end text-sm text-foreground" />
    </Button>
  );
}

function PlanList({ plans, onPick }: { plans: RenewPlan[]; onPick: (plan: RenewPlan) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {plans.map((plan) => (
        <PlanRow key={plan.id} plan={plan} onPick={onPick} />
      ))}
    </div>
  );
}

function CategoryRow({ group, onOpen }: { group: CategoryGroup; onOpen: (key: string) => void }) {
  return (
    <Button
      variant="secondary"
      onPress={() => onOpen(group.key)}
      className="inset-tile !h-auto min-h-12 !w-full !justify-start !gap-2 !rounded-lg !p-2 !pe-3 text-start"
    >
      <IconTile icon="solar:folder-with-files-linear" tone="purple" />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span dir="auto" className="w-full min-w-0 truncate text-sm font-medium text-foreground">
          {group.name}
        </span>
        <span className="text-xs text-muted">{num(group.plans.length)} پلن</span>
        <Description text={group.description} />
      </span>
      <Icon name="solar:alt-arrow-left-linear" size={18} className="text-muted" />
    </Button>
  );
}

/** The service's own plan first, then the shop's categories (and «سایر»); without categories one list. */
export function RenewChoices({
  options,
  onPick,
  onOpenCategory,
}: {
  options: RenewalOptions;
  onPick: (plan: RenewPlan) => void;
  onOpenCategory: (key: string) => void;
}) {
  if (!hasRenewablePlans(options)) return <EmptyState title="پلنی برای تمدید فعال نیست." />;
  if (!options.grouped) {
    return (
      <InsetBlock title="انتخاب پلن تمدید" labelId="renew-plans" hint="پیش از پرداخت، نتیجهٔ تمدید را می‌بینید.">
        <PlanList plans={options.plans} onPick={onPick} />
      </InsetBlock>
    );
  }
  const groups = categoryGroups(options);
  return (
    <>
      {options.current ? (
        <InsetBlock title="تمدید پلن فعلی" labelId="renew-current" hint="پیش از پرداخت، نتیجهٔ تمدید را می‌بینید.">
          <PlanList plans={[options.current]} onPick={onPick} />
        </InsetBlock>
      ) : null}
      {groups.length ? (
        <InsetBlock title={options.current ? "یا پلن دیگری انتخاب کنید" : "انتخاب پلن تمدید"} labelId="renew-categories">
          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <CategoryRow key={group.key} group={group} onOpen={onOpenCategory} />
            ))}
          </div>
        </InsetBlock>
      ) : null}
    </>
  );
}

/** The plans of one category; «بازگشت به دسته‌ها» returns without a new request. */
export function RenewCategoryPlans({
  group,
  onPick,
  onBack,
}: {
  group: CategoryGroup;
  onPick: (plan: RenewPlan) => void;
  onBack: () => void;
}) {
  return (
    <>
      <InsetBlock title={group.name} labelId="renew-category">
        <Description text={group.description} className="text-center" />
        <PlanList plans={group.plans} onPick={onPick} />
      </InsetBlock>
      <ActionButton tone="neutral" icon="solar:arrow-right-linear" onPress={onBack}>
        بازگشت به دسته‌ها
      </ActionButton>
    </>
  );
}
