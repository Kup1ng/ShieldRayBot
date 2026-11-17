"use client";

/** «فروش حجم و زمان اضافه» of a customer plan: unit prices plus the plan's own volume / month packs. */

import { useState } from "react";

import { FormGrid, FormSection, MoneyInput, SwitchInput } from "../../ui/Fields";
import { PackEditor, packFields, usePackLines, type PackKindSpec } from "./PackEditor";
import type { StyleOption, UserPackConfig, UserPackLines } from "./types";

export type UserExtraInitial = { allow: boolean; gbPrice: number; monthPrice: number; packs: UserPackLines };

const priceText = (value: number | undefined) => String(value ?? 0);

function specsFor(config: UserPackConfig, gbPrice: string, monthPrice: string): PackKindSpec[] {
  return [
    {
      id: "volume",
      tab: "حجم",
      unit: "گیگ",
      rate: Number(gbPrice),
      max: config.volume.max,
      defaults: config.volume.defaults,
      amountName: "plan_vol_amount",
      styleName: "plan_vol_style",
      amountLabel: "مقدار حجم بسته",
      styleLabel: "رنگ دکمه بسته حجم",
      removeLabel: "حذف بسته حجم",
      addLabel: "افزودن بستهٔ حجم",
    },
    {
      id: "duration",
      tab: "زمان",
      unit: "ماه",
      rate: Number(monthPrice),
      max: config.duration.max,
      defaults: config.duration.defaults,
      amountName: "plan_dur_amount",
      styleName: "plan_dur_style",
      amountLabel: "مقدار ماه بسته",
      styleLabel: "رنگ دکمه بسته زمان",
      removeLabel: "حذف بسته زمان",
      addLabel: "افزودن بستهٔ زمان",
    },
  ];
}

/** State of the section and the fields the plan create / edit handlers read from it. */
export function useUserExtraSales(config: UserPackConfig, initial?: UserExtraInitial) {
  const [allow, setAllow] = useState(initial?.allow ?? false);
  const [gbPrice, setGbPrice] = useState(priceText(initial?.gbPrice));
  const [monthPrice, setMonthPrice] = useState(priceText(initial?.monthPrice));
  const specs = specsFor(config, gbPrice, monthPrice);
  const packs = usePackLines(specs, initial?.packs, initial?.allow ?? false);

  const toggle = (on: boolean) => {
    setAllow(on);
    if (on) packs.seedEmpty();
  };
  // Switched off, the handler clears the plan's packs and prices, so nothing else is sent.
  const fields = (): Record<string, string | boolean | string[]> =>
    allow ? { allow_buy_extra: true, extra_gb_price: gbPrice, extra_month_price: monthPrice, ...packFields(specs, packs.lines) } : { allow_buy_extra: false };

  return { allow, toggle, gbPrice, setGbPrice, monthPrice, setMonthPrice, specs, packs, fields };
}

export type UserExtraSales = ReturnType<typeof useUserExtraSales>;

export function UserExtraSalesSection({ sales, styleOptions, maxPerKind }: { sales: UserExtraSales; styleOptions: StyleOption[]; maxPerKind: number }) {
  return (
    <FormSection title="فروش حجم و زمان اضافه">
      <SwitchInput label="کاربر بتواند حجم و زمان اضافه بخرد" help="بسته‌های همین پلن در ربات و مینی‌اپ دیده می‌شوند؛ قیمت هر پله = نرخ واحد × مقدار" checked={sales.allow} onChange={sales.toggle} />
      {sales.allow ? (
        <>
          <FormGrid>
            <MoneyInput label="قیمت هر گیگ (تومان)" value={sales.gbPrice} onChange={sales.setGbPrice} />
            <MoneyInput label="قیمت هر ماه (تومان)" value={sales.monthPrice} onChange={sales.setMonthPrice} />
          </FormGrid>
          <PackEditor specs={sales.specs} lines={sales.packs.lines} onChange={sales.packs.setLines} styleOptions={styleOptions} maxPerKind={maxPerKind} />
        </>
      ) : null}
    </FormSection>
  );
}
