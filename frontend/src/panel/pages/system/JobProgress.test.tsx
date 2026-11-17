import { describe, expect, it } from "vitest";

import { stepStates } from "./JobProgress";

const STEPS = [
  { key: "a", label: "الف" },
  { key: "b", label: "ب" },
  { key: "c", label: "ج" },
];

describe("step states", () => {
  it("marks earlier steps done and the reported one current", () => {
    expect(stepStates(STEPS, "b")).toEqual(["done", "current", "pending"]);
  });

  it("leaves every step pending when the server reports none", () => {
    expect(stepStates(STEPS, "")).toEqual(["pending", "pending", "pending"]);
  });
});
