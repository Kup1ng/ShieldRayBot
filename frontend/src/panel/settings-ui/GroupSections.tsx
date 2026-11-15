"use client";

import { Accordion, Button } from "@heroui/react";
import type { ReactNode } from "react";

import { Icon } from "@/icons/Icon";

import { run } from "../core/actions";
import { GlassSection } from "../ui/Page";
import { SubmitButton } from "../ui/Fields";
import { Notice } from "../ui/States";
import { GroupFields, type FieldEnv } from "./FieldView";
import type { SettingGroup } from "./types";

/** More groups than this fold into an accordion: the button-label tabs have eighteen. */
const ACCORDION_FROM = 4;

function GroupNoticeBox({ group }: { group: SettingGroup }) {
  if (!group.notice) return null;
  return (
    <Notice tone="warning" title={group.notice.title}>
      {group.notice.text}
      {group.notice.items.length ? (
        <ul className="mt-1 list-disc ps-5">
          {group.notice.items.map((item) => (
            <li key={item} dir="auto">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
}

function GroupBody({ group, env }: { group: SettingGroup; env: FieldEnv }) {
  return (
    <div className="flex flex-col gap-4">
      <GroupNoticeBox group={group} />
      <GroupFields group={group} env={env} />
    </div>
  );
}

/** The groups of one tab: a glass section each, or a folding list when there are many. */
export function GroupSections({ groups, env }: { groups: SettingGroup[]; env: FieldEnv }) {
  if (groups.length >= ACCORDION_FROM) {
    return (
      <GlassSection>
        <Accordion variant="surface" className="w-full" defaultExpandedKeys={[groups[0].name]}>
          {groups.map((group) => (
            <Accordion.Item key={group.name} id={group.name}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  {group.name}
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  {group.caption ? <p className="mb-3 text-sm text-muted">{group.caption}</p> : null}
                  <GroupBody group={group} env={env} />
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </GlassSection>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <GlassSection key={group.name} title={group.name} description={group.caption || undefined}>
          <GroupBody group={group} env={env} />
        </GlassSection>
      ))}
    </>
  );
}

/** The save row that stays in reach while a long form scrolls. */
export function SaveBar({ label, pending, children }: { label: string; pending: boolean; children?: ReactNode }) {
  return (
    <div className="glass sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl p-3">
      {children}
      <SubmitButton pending={pending}>{label}</SubmitButton>
    </div>
  );
}

/** «Back to defaults» for one tab: the handler resets the tab's texts and colors after this confirmation. */
export function ResetButton({ path, confirmText, refresh }: { path: string; confirmText: string; refresh: () => void }) {
  return (
    <Button
      variant="ghost"
      onPress={() =>
        void run(
          path,
          { reset_defaults: "1" },
          { ask: { title: "بازگردانی به پیش‌فرض", text: confirmText, confirmLabel: "بازگردانی", tone: "danger" }, success: "به پیش‌فرض برگشت.", refresh },
        )
      }
    >
      <Icon name="solar:restart-linear" size={18} />
      بازگردانی همه به پیش‌فرض
    </Button>
  );
}
