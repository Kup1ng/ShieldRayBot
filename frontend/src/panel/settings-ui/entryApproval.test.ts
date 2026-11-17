import { describe, expect, it } from "vitest";

import { ACTIONS_BY_STATUS, decisionPath, rowModel, statusInfo } from "./entryApproval";
import type { EntryApprovalRow } from "./types";

const ROW: EntryApprovalRow = { id: 4, customer: 777, customer_name: "علی", username: "ali", status: "pending", requested_at: "2026-01-01T10:00:00+00:00", decided_at: "", expired: false };

describe("entry approval rows", () => {
  it("names the customer by name, then by handle, then by id", () => {
    expect(rowModel(ROW)).toMatchObject({ name: "علی", username: "@ali", customer: "777" });
    expect(rowModel({ ...ROW, customer_name: "" })).toMatchObject({ name: "@ali", username: "" });
    expect(rowModel({ ...ROW, customer_name: "", username: "" }).name).toBe("777");
  });

  it("shows when it was asked while pending and when it was decided afterwards", () => {
    const decided = { ...ROW, status: "rejected", decided_at: "2026-01-02T10:00:00+00:00" };
    expect(rowModel(ROW).when).toBe(ROW.requested_at);
    expect(rowModel(decided).when).toBe(decided.decided_at);
    expect(rowModel({ ...decided, decided_at: "" }).when).toBe(ROW.requested_at);
  });

  it("offers only the decisions the server allows from each status", () => {
    expect(rowModel(ROW).actions).toEqual(["approve", "reject", "block"]);
    expect(rowModel({ ...ROW, status: "rejected" }).actions).toEqual(["approve", "block"]);
    expect(rowModel({ ...ROW, status: "blocked" }).actions).toEqual(["approve"]);
    expect(rowModel({ ...ROW, status: "approved" }).actions).toEqual([]);
    expect(Object.keys(ACTIONS_BY_STATUS).sort()).toEqual(["blocked", "pending", "rejected"]);
  });

  it("tells an expired request from a rejected one and keeps an unknown status readable", () => {
    expect(statusInfo({ status: "rejected", expired: true }).label).toBe("منقضی");
    expect(statusInfo({ status: "rejected", expired: false }).label).toBe("رد شده");
    expect(statusInfo({ status: "blocked", expired: false }).color).toBe("danger");
    expect(statusInfo({ status: "weird", expired: false })).toEqual({ label: "weird", color: "default" });
  });

  it("builds the decision address from a numeric id only", () => {
    expect(decisionPath(12, "approve")).toBe("/entry-approvals/12/approve");
  });
});
