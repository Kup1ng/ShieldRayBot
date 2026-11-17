"use client";

import { Table } from "@heroui/react";
import { useState } from "react";

import { run } from "../../core/actions";
import { useJson, useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { Ltr } from "../../ui/Data";
import { SelectInput, SubmitButton } from "../../ui/Fields";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable } from "../../ui/States";
import type { ShopReview } from "./types";

const PATH = "/api/panel/service-shop-review";
const PLATFORM = "platform";

const shopName = (id: number | null): string => (id === null ? "پلتفرم" : fa(id));

export const shopsText = (ids: (number | null)[]): string => (ids.length ? ids.map(shopName).join("، ") : "—");

function AssignForm({ serviceId, pgUsername, shops, reload }: { serviceId: number; pgUsername: string; shops: ShopReview["shops"]; reload: () => void }) {
  const [shop, setShop] = useState(PLATFORM);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      await run(
        `/service-shop-review/${serviceId}/assign`,
        { shop },
        { ask: { title: "تعیین فروشگاه سرویس", text: "این انتخاب قابل برگشت نیست. ادامه می‌دهید؟", confirmLabel: "تعیین فروشگاه" }, refresh: reload },
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex items-end gap-2">
      <SelectInput
        label={<span className="sr-only">{`فروشگاه سرویس ${pgUsername}`}</span>}
        value={shop}
        onChange={setShop}
        className="w-52"
        options={[{ id: PLATFORM, label: "پلتفرم" }, ...shops.map((s) => ({ id: String(s.id), label: `${s.label} (#${fa(s.id)})` }))]}
      />
      <SubmitButton type="button" pending={pending} onPress={() => void submit()}>
        تعیین
      </SubmitButton>
    </div>
  );
}

function Content({ data, reload }: { data: ShopReview; reload: () => void }) {
  if (!data.rows.length) return <EmptyBlock icon="solar:shop-linear" title="سرویسی در انتظار تعیین فروشگاه نیست." />;
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="سرویس‌های در انتظار تعیین فروشگاه" className="min-w-[640px]">
          <Table.Header>
            <Table.Column isRowHeader>سرویس</Table.Column>
            <Table.Column>مشتری</Table.Column>
            <Table.Column>منتسب به</Table.Column>
            <Table.Column>خرید از</Table.Column>
            <Table.Column>فروشگاه این سرویس</Table.Column>
          </Table.Header>
          <Table.Body>
            {data.rows.map((row) => (
              <Table.Row key={row.service_id} id={row.service_id}>
                <Table.Cell>
                  <Ltr>{row.pg_username}</Ltr> <span className="text-xs text-muted"><Ltr>#{row.service_id}</Ltr></span>
                </Table.Cell>
                <Table.Cell>
                  <Ltr>{row.customer_id}</Ltr>
                </Table.Cell>
                <Table.Cell>{shopName(row.attributed_shop)}</Table.Cell>
                <Table.Cell>{shopsText(row.order_shops)}</Table.Cell>
                <Table.Cell>
                  <AssignForm serviceId={row.service_id} pgUsername={row.pg_username} shops={data.shops} reload={reload} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function Body() {
  useUrlFlash();
  const state = useJson<ShopReview>(PATH);
  return (
    <>
      <PageHeader icon="solar:shop-bold" tone="orange" title="سرویس‌های در انتظار تعیین فروشگاه" description="سرویس‌هایی که فروشگاه فروشنده‌شان از روی سفارش معلوم نشد" />
      <GlassSection>
        <p className="text-sm text-muted">فروشندهٔ این سرویس‌ها از روی سفارش معلوم نشد: مشتری به یک فروشگاه منتسب است ولی از جای دیگر هم خرید کرده. تا فروشگاه تعیین نشود، سرویس به هیچ‌کس نشان داده نمی‌شود و عملی روی آن انجام نمی‌شود.</p>
      </GlassSection>
      <div className="mt-6">
        <GlassSection title="در انتظار تصمیم" description={state.data ? `${fa(state.data.rows.length)} سرویس` : undefined}>
          <Loadable state={state}>{(data) => <Content data={data} reload={state.reload} />}</Loadable>
        </GlassSection>
      </div>
    </>
  );
}

export function ShopReviewPage() {
  return (
    <PanelShell title="تعیین فروشگاه سرویس">
      <Body />
    </PanelShell>
  );
}
