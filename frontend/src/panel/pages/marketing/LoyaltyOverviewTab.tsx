"use client";

import { Table } from "@heroui/react";

import { fa } from "../../core/format";
import { Ltr } from "../../ui/Data";
import { EmptyBlock } from "../../ui/States";
import { GlassSection, StatTile } from "../../ui/Page";
import type { LoyaltyOverview } from "./types";

export function LoyaltyOverviewTab({ overview }: { overview: LoyaltyOverview }) {
  const { metrics, wheel } = overview;
  const wheelText = wheel.wheel_enabled ? `${fa(wheel.active_prizes)} بخش · ${fa(wheel.total_spins)} چرخش` : "خاموش";
  return (
    <div className="flex flex-col gap-6">
      <GlassSection title="خلاصه باشگاه">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile icon="solar:users-group-rounded-bold" tone="blue" label="کل دعوت‌ها" value={fa(metrics.total_referrals)} />
          <StatTile icon="solar:shield-check-bold" tone="green" label="واجد شرایط" value={fa(metrics.qualified_referrals)} />
          <StatTile icon="solar:star-bold" tone="yellow" label="امتیاز صادرشده" value={fa(metrics.points_issued)} />
          <StatTile icon="solar:star-shine-bold" tone="orange" label="امتیاز مصرف‌شده" value={fa(metrics.points_redeemed)} />
          <StatTile icon="solar:wallet-bold" tone="purple" label="اعتبار کیف جوایز" value={<Ltr>{fa(metrics.wallet_credits_issued)}</Ltr>} />
          <StatTile icon="solar:gift-bold" tone="pink" label="جوایز فعال" value={fa(metrics.active_rewards)} />
          <StatTile icon="solar:clock-circle-bold" tone="teal" label="چرخ شانس" value={wheelText} />
        </div>
      </GlassSection>
      <GlassSection title="برترین معرف‌ها">
        {metrics.top_referrers.length ? (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="برترین معرف‌ها" className="min-w-[320px]">
                <Table.Header>
                  <Table.Column isRowHeader>کاربر</Table.Column>
                  <Table.Column className="w-32">تعداد دعوت</Table.Column>
                </Table.Header>
                <Table.Body>
                  {metrics.top_referrers.map((row, index) => (
                    <Table.Row key={`${index}:${row.label}`} id={index}>
                      <Table.Cell>
                        <span dir="auto">{row.label}</span>
                      </Table.Cell>
                      <Table.Cell>{fa(row.count)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        ) : (
          <EmptyBlock icon="solar:users-group-rounded-linear" title="هنوز دعوتی ثبت نشده" />
        )}
      </GlassSection>
    </div>
  );
}
