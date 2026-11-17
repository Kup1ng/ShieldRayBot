import { describe, expect, it } from "vitest";

import { NAME_REQUIRED, NAME_RULES, cleanServiceName, randomServiceName, serviceNameProblem } from "./serviceName";

describe("service name rules", () => {
  it("accepts what the server accepts and cleans it the way the server does", () => {
    expect(serviceNameProblem("abc")).toBeNull();
    expect(serviceNameProblem(" @My_Name_1 ")).toBeNull();
    expect(cleanServiceName(" @My_Name_1 ")).toBe("my_name_1");
    expect(serviceNameProblem("a".repeat(20))).toBeNull();
  });

  it("asks for a name when empty and states the rules otherwise", () => {
    expect(serviceNameProblem("")).toBe(NAME_REQUIRED);
    expect(serviceNameProblem("   ")).toBe(NAME_REQUIRED);
    for (const bad of ["ab", "1abc", "_abc", "a".repeat(21), "نام", "a b c", "ab-c", "<b>x</b>"]) {
      expect(serviceNameProblem(bad)).toBe(NAME_RULES);
    }
  });

  it("makes random names that are always valid", () => {
    for (let i = 0; i < 200; i += 1) expect(serviceNameProblem(randomServiceName())).toBeNull();
    expect(randomServiceName(() => 0)).toBe("aaaaaaaa");
    expect(randomServiceName(() => 0.999999)).toBe("z9999999");
  });
});
