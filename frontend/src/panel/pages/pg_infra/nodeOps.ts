/** The operations of the nodes page: who may run which, the confirmations, and the sorting of rows. */

import type { Ask } from "../../core/actions";
import { fa } from "../../core/format";
import type { NodeCan, NodeRow, StatusKind } from "./types";

export type NodeOp = "reconnect" | "sync" | "reset" | "toggle" | "delete";

type OpSpec = {
  label: string;
  /** The grant the handler checks for it. */
  need: keyof NodeCan;
  path: (id: number) => string;
  /** The question asked before a single node. */
  askOne?: Ask;
  /** The question asked before a selection of `n` nodes. */
  askMany: (n: number) => Ask;
  danger?: boolean;
  icon: string;
};

export const NODE_OPS: Record<NodeOp, OpSpec> = {
  reconnect: {
    label: "اتصال مجدد",
    need: "reconnect",
    path: (id) => `/pg/nodes/${id}/reconnect`,
    askMany: (n) => ({ title: "اتصال مجدد گروهی", text: `اتصال مجدد ${fa(n)} نود؟`, confirmLabel: "اتصال" }),
    icon: "solar:restart-bold",
  },
  sync: {
    label: "همگام‌سازی",
    need: "update",
    path: (id) => `/pg/nodes/${id}/sync`,
    askMany: (n) => ({ title: "همگام‌سازی گروهی", text: `همگام‌سازی ${fa(n)} نود؟`, confirmLabel: "همگام‌سازی" }),
    icon: "solar:refresh-circle-linear",
  },
  reset: {
    label: "ریست مصرف",
    need: "update",
    path: (id) => `/pg/nodes/${id}/reset`,
    askOne: { title: "ریست مصرف نود", text: "مصرف این نود ریست شود؟", confirmLabel: "ریست", tone: "warning" },
    askMany: (n) => ({ title: "ریست گروهی", text: `مصرف ${fa(n)} نود ریست شود؟`, confirmLabel: "ریست", tone: "warning" }),
    icon: "solar:eraser-linear",
  },
  toggle: {
    label: "تغییر وضعیت",
    need: "update",
    path: (id) => `/pg/nodes/${id}/toggle`,
    askMany: (n) => ({ title: "تغییر وضعیت گروهی", text: `وضعیت ${fa(n)} نود تغییر کند؟`, confirmLabel: "اعمال" }),
    icon: "solar:power-bold",
  },
  delete: {
    label: "حذف",
    need: "delete",
    path: (id) => `/pg/nodes/${id}/delete`,
    askOne: { title: "حذف نود", text: "این نود حذف شود؟", confirmLabel: "حذف", tone: "danger" },
    askMany: (n) => ({ title: "حذف گروهی", text: `${fa(n)} نود حذف شوند؟`, confirmLabel: "حذف", tone: "danger" }),
    danger: true,
    icon: "solar:trash-bin-trash-linear",
  },
};

export const NODE_OP_ORDER: NodeOp[] = ["reconnect", "sync", "reset", "toggle", "delete"];

/** The operations this staff member may run on a node, in menu order. */
export function allowedOps(can: NodeCan): NodeOp[] {
  return NODE_OP_ORDER.filter((op) => can[NODE_OPS[op].need]);
}

/** A node without an id (the panel did not send one) cannot be operated on. */
export function operableIds(rows: NodeRow[]): number[] {
  return rows.flatMap((row) => (row.id === null ? [] : [row.id]));
}

export type NodeSortColumn = "id" | "name" | "address" | "status" | "up" | "down" | "total";
export type NodeSort = { column: NodeSortColumn; direction: "ascending" | "descending" };

const STATUS_ORDER: Record<StatusKind, number> = { err: 0, warn: 1, neutral: 2, ok: 3 };

function sortKey(row: NodeRow, column: NodeSortColumn): number | string {
  switch (column) {
    case "id":
      return row.id ?? -1;
    case "name":
      return row.name.toLowerCase();
    case "address":
      return row.address.toLowerCase();
    case "status":
      return STATUS_ORDER[row.status_kind] ?? STATUS_ORDER.neutral;
    case "up":
      return row.traffic_up ?? -1;
    case "down":
      return row.traffic_down ?? -1;
    case "total":
      return row.traffic_total ?? -1;
  }
}

/** Rows ordered by one column; a missing figure sorts before every real one. */
export function sortNodes(rows: NodeRow[], sort: NodeSort | null): NodeRow[] {
  if (!sort) return rows;
  const sign = sort.direction === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortKey(a, sort.column);
    const y = sortKey(b, sort.column);
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fa");
    return order * sign;
  });
}
