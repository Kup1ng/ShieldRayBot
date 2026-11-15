"use client";

/** Small pieces the four PasarGuard pages share: area tabs, selection cells, form footer and error line. */

import { Button, Checkbox, Table } from "@heroui/react";

import { usePanelSession } from "../../core/session";
import { Notice } from "../../ui/States";
import { SectionTabs } from "../../ui/SectionTabs";
import { SubmitButton } from "../../ui/Fields";

const PG_PAGE_ID = /^pg_/;

/** The links between the PasarGuard pages this staff member may open (the server sends only those). */
export function PgTabs({ active }: { active: string }) {
  const { session } = usePanelSession();
  const section = session.nav.find((item) => item.id === "pg");
  const items = (section?.items ?? []).filter((item) => PG_PAGE_ID.test(item.id)).map((item) => ({ key: item.id, href: item.href, label: item.label }));
  return <SectionTabs label="بخش‌های پاسارگارد" items={items} active={active} />;
}

function selectionBox(label: string, variant?: "secondary") {
  return (
    <Checkbox aria-label={label} slot="selection" variant={variant}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}

/** Header cell holding the «select all» box. Call it, do not render it: table collections need the cell itself. */
export function selectColumn(label: string) {
  return <Table.Column className="w-10 pe-0">{selectionBox(label)}</Table.Column>;
}

/** Row cell holding the row's selection box. */
export function selectCell(label: string) {
  return <Table.Cell className="pe-0">{selectionBox(label, "secondary")}</Table.Cell>;
}

/** The problem a form found or the server answered, kept inside the dialog until the next try. */
export function FormError({ message }: { message: string | null }) {
  return message ? (
    <div role="alert">
      <Notice tone="danger">{message}</Notice>
    </div>
  ) : null;
}

/** Cancel and the ink submit button at the end of a dialog form. */
export function FormFooter({ submitLabel, pending, disabled, onCancel }: { submitLabel: string; pending: boolean; disabled?: boolean; onCancel: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" className="!h-12 !rounded-lg px-6" onPress={onCancel}>
        انصراف
      </Button>
      <SubmitButton pending={pending} isDisabled={disabled}>
        {submitLabel}
      </SubmitButton>
    </div>
  );
}
