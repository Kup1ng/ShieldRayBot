"use client";

import { Button, Table } from "@heroui/react";
import { useState } from "react";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa, formatDate, toman } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr, StatusChip } from "../../ui/Data";
import { FormGrid, SelectInput } from "../../ui/Fields";
import { GlassSection, PageHeader, StatTile } from "../../ui/Page";
import { Loadable, Notice } from "../../ui/States";
import { capacityText, RELATION_COLOR } from "./labels";
import type { PackageChoice, SubscriptionData, SubscriptionOverview } from "./types";

const PATH = "/api/panel/my-subscription";

/** The old page's confirmation: renewing the current package versus moving to another one. */
export function renewAsk(choice: PackageChoice): { title: string; text: string; confirmLabel: string } {
  const current = choice.relation === "current";
  return {
    title: current ? "تمدید بسته" : `${choice.label} بسته`,
    text: current
      ? `تمدید «${choice.name}» با ${toman(choice.price)} از کیف پول؟`
      : `تغییر به «${choice.name}» و پرداخت ${toman(choice.price)} از کیف پول؟ ظرفیت بستهٔ جدید همین حالا اعمال می‌شود.`,
    confirmLabel: "پرداخت و تمدید",
  };
}

function Summary({ overview, wallet, botUsername }: { overview: SubscriptionOverview; wallet: number; botUsername: string }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatTile icon="solar:box-bold" tone="purple" label="بستهٔ فعلی" value={overview.current_name || "—"} />
      <StatTile icon="solar:calendar-bold" tone="blue" label="انقضا" value={overview.expires_at ? formatDate(overview.expires_at) : "بدون انقضا"} />
      <StatTile
        icon="solar:users-group-rounded-bold"
        tone="teal"
        label="کاربران"
        value={
          <Ltr>
            {overview.users_used === null ? "—" : fa(overview.users_used)} / {overview.users_total ? fa(overview.users_total) : "∞"}
          </Ltr>
        }
      />
      <StatTile
        icon="solar:database-bold"
        tone="orange"
        label="حجم مصرف‌شده"
        value={
          <Ltr>
            {overview.traffic_used_text ?? "—"} / {overview.gb_total ? `${fa(overview.gb_total)} گیگ` : "∞"}
          </Ltr>
        }
      />
      <StatTile
        icon="solar:wallet-bold"
        tone="green"
        label="کیف پول"
        value={toman(wallet)}
        hint={
          botUsername ? (
            <a className="underline" href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">
              شارژ کیف پول در ربات
            </a>
          ) : undefined
        }
      />
    </div>
  );
}

function ChoicesTable({ overview, reload }: { overview: SubscriptionOverview; reload: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const renew = async (choice: PackageChoice) => {
    setBusy(choice.plan_id);
    try {
      await run("/my-subscription/renew", { plan_id: choice.plan_id, generation: overview.generation }, { ask: renewAsk(choice), refresh: reload });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="بسته‌ها" className="min-w-[560px]">
          <Table.Header>
            <Table.Column isRowHeader>بسته</Table.Column>
            <Table.Column>ظرفیت</Table.Column>
            <Table.Column>مدت</Table.Column>
            <Table.Column>مبلغ</Table.Column>
            <Table.Column className="w-40">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {overview.choices.map((choice) => (
              <Table.Row key={choice.plan_id} id={choice.plan_id}>
                <Table.Cell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="auto">{choice.name}</span>
                    <StatusChip color={RELATION_COLOR[choice.relation] ?? "default"}>{choice.label}</StatusChip>
                  </div>
                </Table.Cell>
                <Table.Cell>{capacityText(choice.users, choice.gb)}</Table.Cell>
                <Table.Cell>{choice.duration_days ? `${fa(choice.duration_days)} روز` : "بدون انقضا"}</Table.Cell>
                <Table.Cell>{toman(choice.price)}</Table.Cell>
                <Table.Cell>
                  {choice.blocked ? (
                    <span className="text-xs text-muted">{choice.blocked}</span>
                  ) : (
                    <Button size="sm" variant={choice.relation === "current" || choice.relation === "upgrade" ? "primary" : "outline"} isPending={busy === choice.plan_id} isDisabled={busy !== null} onPress={() => void renew(choice)}>
                      {choice.relation === "current" ? "تمدید" : choice.label}
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function ExtraForm({ kind, unit, options, reload }: { kind: "gb" | "users"; unit: number; options: number[]; reload: () => void }) {
  const [amount, setAmount] = useState(String(options[0] ?? ""));
  const [pending, setPending] = useState(false);
  const gb = kind === "gb";
  const noun = gb ? "گیگ" : "کاربر";
  const submit = async () => {
    setPending(true);
    try {
      await run(
        "/my-subscription/extra",
        { kind, amount },
        {
          ask: {
            title: gb ? "خرید حجم اضافه" : "خرید کاربر اضافه",
            text: gb ? `حجم اضافه با گیگی ${toman(unit)} از کیف پول خریده شود؟` : `کاربر اضافه با هر نفر ${toman(unit)} از کیف پول خریده شود؟`,
            confirmLabel: "خرید",
          },
          refresh: reload,
        },
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <SelectInput
        label={gb ? `حجم اضافه (گیگی ${toman(unit)})` : `کاربر اضافه (هر نفر ${toman(unit)})`}
        value={amount}
        onChange={setAmount}
        options={options.map((n) => ({ id: String(n), label: `${fa(n)} ${noun} — ${toman(n * unit)}` }))}
      />
      <div>
        <Button variant="outline" className="!h-12 !rounded-lg" isPending={pending} onPress={() => void submit()}>
          {gb ? "خرید حجم" : "خرید کاربر"}
        </Button>
      </div>
    </div>
  );
}

function Content({ data, reload }: { data: SubscriptionData; reload: () => void }) {
  if (data.unavailable || !data.overview) {
    return (
      <GlassSection>
        <p className="text-sm text-muted">{data.unavailable || "اشتراک این فروشگاه در دسترس نیست"}</p>
      </GlassSection>
    );
  }
  const { overview, extras } = data;
  return (
    <>
      <Summary overview={overview} wallet={data.wallet} botUsername={data.bot_username} />
      {overview.users_used === null ? <div className="mb-6"><Notice tone="warning">مصرف فعلی از پنل خوانده نشد؛ بسته‌های کوچک‌تر هنگام خرید دوباره بررسی می‌شوند.</Notice></div> : null}
      <div className="flex flex-col gap-6">
        <GlassSection title="تمدید یا تغییر بسته" description="با تمدید، مدت بسته از تاریخ انقضای فعلی اضافه می‌شود و ظرفیت بستهٔ انتخابی همین حالا اعمال می‌شود. مصرف کاربران صفر می‌شود و هزینه از کیف پول کسر می‌شود.">
          <ChoicesTable overview={overview} reload={reload} />
        </GlassSection>
        {extras && (extras.gb_price || extras.user_price) ? (
          <GlassSection title="خرید ظرفیت اضافه" description="ظرفیت اضافه تا پایان دوره می‌ماند و در تمدید بعدی هم حساب می‌شود.">
            <FormGrid>
              {extras.gb_price ? <ExtraForm kind="gb" unit={extras.gb_price} options={extras.gb_options} reload={reload} /> : null}
              {extras.user_price ? <ExtraForm kind="users" unit={extras.user_price} options={extras.user_options} reload={reload} /> : null}
            </FormGrid>
          </GlassSection>
        ) : null}
      </div>
    </>
  );
}

function Body() {
  useUrlFlash();
  const state = useJson<SubscriptionData>(PATH);
  return (
    <>
      <PageHeader icon="solar:card-bold" tone="green" title="اشتراک من" description="بستهٔ فروشگاه شما، تمدید و خرید ظرفیت اضافه از کیف پول" />
      <Loadable state={state}>{(data) => <Content data={data} reload={state.reload} />}</Loadable>
    </>
  );
}

export function MySubscriptionPage() {
  return (
    <PanelShell title="اشتراک من">
      <Body />
    </PanelShell>
  );
}
