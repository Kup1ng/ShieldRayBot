"use client";

import { Button, Checkbox, Table, type Selection, type SortDescriptor } from "@heroui/react";
import { useMemo, useState } from "react";

import { Icon } from "@/icons/Icon";

import { run, usePending } from "../../core/actions";
import { useUrlFlash } from "../../core/data";
import { fa } from "../../core/format";
import { PanelShell } from "../../layout/PanelShell";
import { BulkBar, Ltr, RowMenu, StatusChip, type BulkButton, type MenuAction } from "../../ui/Data";
import { GlassSection, PageHeader } from "../../ui/Page";
import { EmptyBlock, Loadable } from "../../ui/States";
import { usePgData } from "./data";
import { statusColor } from "./format";
import { NodeCreateModal } from "./NodeCreateModal";
import { allowedOps, NODE_OPS, operableIds, sortNodes, type NodeOp, type NodeSortColumn } from "./nodeOps";
import { ConnectionNoticeBar, ReadError } from "./PgNotice";
import type { NodeCan, NodeRow, NodesData } from "./types";

const SELECT_BOX = (
  <Checkbox.Content>
    <Checkbox.Control>
      <Checkbox.Indicator />
    </Checkbox.Control>
  </Checkbox.Content>
);

function SortHeader({ children, sortDirection }: { children: string; sortDirection?: "ascending" | "descending" }) {
  return <Table.SortableColumnHeader sortDirection={sortDirection}>{children}</Table.SortableColumnHeader>;
}

function Traffic({ text }: { text: string }) {
  return <Ltr className="text-foreground/80">{text}</Ltr>;
}

function rowKey(row: NodeRow, index: number): string {
  return row.id === null ? `row-${index}` : String(row.id);
}

type TableProps = {
  rows: NodeRow[];
  can: NodeCan;
  selected: ReadonlySet<number>;
  onSelect: (next: Set<number>) => void;
  onOp: (op: NodeOp, row: NodeRow) => void;
};

function NodesTable({ rows, can, selected, onSelect, onOp }: TableProps) {
  const [sort, setSort] = useState<SortDescriptor | undefined>(undefined);
  const ops = allowedOps(can);
  const selectable = ops.length > 0;
  const sorted = useMemo(() => sortNodes(rows, sort ? { column: sort.column as NodeSortColumn, direction: sort.direction } : null), [rows, sort]);
  const disabled = useMemo(() => sorted.flatMap((row, i) => (row.id === null ? [rowKey(row, i)] : [])), [sorted]);

  const onSelectionChange = (keys: Selection) => {
    const ids = keys === "all" ? operableIds(sorted) : [...keys].map(Number).filter((id) => Number.isSafeInteger(id));
    onSelect(new Set(ids));
  };

  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label="نودهای پاسارگارد"
          className="min-w-[820px]"
          selectionMode={selectable ? "multiple" : "none"}
          selectedKeys={new Set([...selected].map(String))}
          disabledKeys={disabled}
          onSelectionChange={onSelectionChange}
          sortDescriptor={sort}
          onSortChange={setSort}
        >
          <Table.Header>
            {selectable ? (
              <Table.Column className="w-10 pe-0">
                <Checkbox aria-label="انتخاب همه" slot="selection">
                  {SELECT_BOX}
                </Checkbox>
              </Table.Column>
            ) : null}
            <Table.Column allowsSorting id="id" className="hidden md:table-cell">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>شناسه</SortHeader>}
            </Table.Column>
            <Table.Column allowsSorting isRowHeader id="name">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>نام</SortHeader>}
            </Table.Column>
            <Table.Column allowsSorting id="address" className="hidden sm:table-cell">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>آدرس</SortHeader>}
            </Table.Column>
            <Table.Column allowsSorting id="status">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>وضعیت</SortHeader>}
            </Table.Column>
            <Table.Column allowsSorting id="up" className="hidden lg:table-cell">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>آپلود</SortHeader>}
            </Table.Column>
            <Table.Column allowsSorting id="down" className="hidden lg:table-cell">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>دانلود</SortHeader>}
            </Table.Column>
            <Table.Column allowsSorting id="total">
              {({ sortDirection }) => <SortHeader sortDirection={sortDirection}>مجموع ترافیک</SortHeader>}
            </Table.Column>
            <Table.Column className="w-12">
              <span className="sr-only">عملیات</span>
            </Table.Column>
          </Table.Header>
          <Table.Body renderEmptyState={() => <p className="py-6 text-center text-sm text-muted">نودی یافت نشد.</p>}>
            {sorted.map((row, index) => {
              const menu: MenuAction[] =
                row.id === null
                  ? []
                  : ops.map((op) => ({ id: op, label: NODE_OPS[op].label, icon: NODE_OPS[op].icon, danger: NODE_OPS[op].danger, onAction: () => onOp(op, row) }));
              return (
                <Table.Row key={rowKey(row, index)} id={rowKey(row, index)}>
                  {selectable ? (
                    <Table.Cell className="pe-0">
                      <Checkbox aria-label={`انتخاب ${row.name || "نود"}`} slot="selection" variant="secondary">
                        {SELECT_BOX}
                      </Checkbox>
                    </Table.Cell>
                  ) : null}
                  <Table.Cell className="hidden md:table-cell">{row.id === null ? "—" : <Ltr className="text-muted">{row.id}</Ltr>}</Table.Cell>
                  <Table.Cell>
                    <span dir="auto" className="font-medium text-foreground">
                      {row.name || "—"}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="hidden sm:table-cell">
                    {row.address ? (
                      <Ltr>
                        {row.address}
                        {row.port !== null ? `:${row.port}` : ""}
                      </Ltr>
                    ) : (
                      "—"
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusChip color={statusColor(row.status_kind)}>{row.status_label || row.status || "—"}</StatusChip>
                  </Table.Cell>
                  <Table.Cell className="hidden lg:table-cell">
                    <Traffic text={row.traffic_up_text} />
                  </Table.Cell>
                  <Table.Cell className="hidden lg:table-cell">
                    <Traffic text={row.traffic_down_text} />
                  </Table.Cell>
                  <Table.Cell>
                    <Traffic text={row.traffic_total_text} />
                  </Table.Cell>
                  <Table.Cell>
                    <RowMenu label={`عملیات ${row.name || "نود"}`} actions={menu} />
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

export function NodesContent() {
  const nodes = usePgData<NodesData>("/api/panel/pg/nodes");
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const { pending: reconnecting, track } = usePending();
  useUrlFlash();

  const reload = () => {
    setSelection(new Set());
    nodes.reload();
  };

  const runOne = (op: NodeOp, row: NodeRow) => {
    if (row.id === null) return;
    const spec = NODE_OPS[op];
    void run(spec.path(row.id), {}, { ask: spec.askOne, refresh: reload });
  };

  const runMany = (op: NodeOp, ids: number[]) => {
    void run("/pg/nodes/bulk-action", { action: op, ids, return_to: "/pg/nodes" }, { ask: NODE_OPS[op].askMany(ids.length), refresh: reload });
  };

  const reconnectAll = () => track(() => run("/pg/nodes/reconnect-all", {}, { refresh: reload }));

  const data = nodes.data;
  const can = data?.can;
  // A selection only holds nodes still listed after a reload.
  const present = new Set(operableIds(data?.nodes ?? []));
  const selected = new Set([...selection].filter((id) => present.has(id)));
  const bulk: BulkButton[] = can
    ? allowedOps(can).map((op) => ({ op, label: NODE_OPS[op].label, count: selected.size, danger: NODE_OPS[op].danger, onPress: () => runMany(op, [...selected]) }))
    : [];

  return (
    <>
      <PageHeader
        icon="solar:server-bold"
        tone="teal"
        title="نودها"
        description="نودهای متصل به پاسارگارد، وضعیت اتصال و ترافیک هر نود"
        actions={
          <>
            {can?.reconnect ? (
              <Button variant="outline" isPending={reconnecting} onPress={() => void reconnectAll()}>
                <Icon name="solar:restart-bold" size={20} />
                اتصال مجدد همه
              </Button>
            ) : null}
            {can?.create ? (
              <Button className="button--ink" onPress={() => setCreating(true)}>
                <Icon name="solar:add-circle-bold" size={20} />
                ساخت نود
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Loadable state={nodes} rows={5}>
          {(loaded) => (
            <>
              <ConnectionNoticeBar notice={loaded.notice} onRetry={nodes.reload} />
              <ReadError message={loaded.error} />
              <GlassSection title="لیست نودها" description={`${fa(loaded.nodes.length)} نود`}>
                {loaded.nodes.length ? (
                  <NodesTable rows={loaded.nodes} can={loaded.can} selected={selected} onSelect={setSelection} onOp={runOne} />
                ) : (
                  <EmptyBlock icon="solar:server-bold" title="نودی یافت نشد.">
                    {loaded.can.create ? (
                      <Button variant="outline" onPress={() => setCreating(true)}>
                        ساخت نود
                      </Button>
                    ) : null}
                  </EmptyBlock>
                )}
              </GlassSection>
            </>
          )}
        </Loadable>
      </div>
      <BulkBar selected={selected.size} buttons={bulk} onClear={() => setSelection(new Set())} label="عملیات گروهی نودها" />
      <NodeCreateModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </>
  );
}

export function NodesPage() {
  return (
    <PanelShell title="نودهای پاسارگارد">
      <NodesContent />
    </PanelShell>
  );
}
