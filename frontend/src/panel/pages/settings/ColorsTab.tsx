"use client";

import { Accordion, Tabs } from "@heroui/react";
import { useState, type FormEvent } from "react";

import { run, usePending } from "../../core/actions";
import { GlassSection } from "../../ui/Page";
import { SelectInput } from "../../ui/Fields";
import { ResetButton, SaveBar } from "../../settings-ui/GroupSections";
import type { TabProps } from "./GenericTab";
import type { ColorSection, ColorsExtra } from "./types";

const PATH = "/settings?tab=colors";
const TONE_DOT: Record<string, string> = {
  default: "bg-foreground/30",
  primary: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
};

function SectionView({ section, values, options, onChange }: { section: ColorSection; values: Record<string, string>; options: Array<{ id: string; label: string }>; onChange: (key: string, value: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {section.caption ? <p className="text-sm text-muted">{section.caption}</p> : null}
      <Accordion variant="surface" allowsMultipleExpanded defaultExpandedKeys={section.groups.length ? [section.groups[0].name] : []} className="w-full">
        {section.groups.map((group) => (
          <Accordion.Item key={group.name} id={group.name}>
            <Accordion.Heading>
              <Accordion.Trigger>
                {group.name}
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <SelectInput key={item.key} label={item.label} value={values[item.key] ?? ""} onChange={(next) => onChange(item.key, next)} options={options} />
                  ))}
                </div>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {section.dynamic.length ? (
        <GlassSection title="رنگ‌های تعریف‌شده در بخش‌های دیگر" description="این موارد در فرم خودشان ویرایش می‌شوند — اینجا فقط خلاصه نمایش داده می‌شود.">
          <ul className="flex flex-col gap-2">
            {section.dynamic.map((row) => (
              <li key={`${row.title}-${row.edit_url}`} className="inset-tile flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
                <span className="font-medium">{row.title}</span>
                <span className="text-muted">{row.color_label}</span>
                <a href={row.edit_url} className="text-accent underline-offset-2 hover:underline">
                  {`ویرایش در ${row.edit_hint}`}
                </a>
              </li>
            ))}
          </ul>
        </GlassSection>
      ) : null}
    </div>
  );
}

/** The Telegram button colors of the fixed buttons, by area; plan, support and payment colors live in their own screens. */
export function ColorsTab({ data, reload }: TabProps<ColorsExtra>) {
  const extra = data.extra as ColorsExtra;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const section of extra.sections) for (const group of section.groups) for (const item of group.items) initial[item.key] = item.value;
    return initial;
  });
  const [sectionId, setSectionId] = useState(extra.sections[0]?.id ?? "");
  const { pending, track } = usePending();
  const options = extra.style_options.map((option) => ({ id: option.value, label: option.label }));
  const section = extra.sections.find((item) => item.id === sectionId) ?? extra.sections[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    void track(async () => {
      const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [`s_${key}`, value]));
      const result = await run(PATH, fields, { success: "ذخیره شد." });
      if (!result || result.ok) reload();
    });
  };

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-6">
      <GlassSection
        title="رنگبندی دکمه‌ها"
        description="تلگرام فقط سفید، آبی، سبز و قرمز را پشتیبانی می‌کند. رنگ دکمه‌های ثابت را اینجا تنظیم کنید؛ رنگ پلن‌ها، پشتیبان‌ها و مقاصد پرداخت در همان بخش مربوطه (ساخت/ویرایش) تعیین می‌شود."
      >
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted" aria-label="راهنمای رنگ‌ها">
          {extra.style_options.map((option) => (
            <span key={option.value || "default"} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-3 rounded-full ${TONE_DOT[option.tone] ?? TONE_DOT.default}`} />
              {option.label}
            </span>
          ))}
        </div>
        {extra.sections.length > 1 ? (
          <div className="overflow-x-auto">
            <Tabs selectedKey={section?.id} onSelectionChange={(key) => setSectionId(String(key))}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="بخش‌های رنگبندی">
                  {extra.sections.map((item) => (
                    <Tabs.Tab key={item.id} id={item.id}>
                      {item.label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          </div>
        ) : null}
      </GlassSection>
      {section ? (
        <GlassSection>
          <SectionView key={section.id} section={section} values={values} options={options} onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} />
        </GlassSection>
      ) : null}
      <SaveBar label="ذخیره رنگبندی" pending={pending} />
      <div>
        <ResetButton path={PATH} confirmText={data.reset_confirm ?? ""} refresh={reload} />
      </div>
    </form>
  );
}
