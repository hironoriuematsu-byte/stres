import { describe, it, expect } from "vitest";
import { getFiscalYear } from "@/lib/fiscal";

describe("年度判定(4月始まり)", () => {
  it("4月1日は新年度", () => {
    expect(getFiscalYear(new Date("2026-04-01"))).toBe(2026);
  });
  it("3月31日は前年度", () => {
    expect(getFiscalYear(new Date("2026-03-31"))).toBe(2025);
  });
  it("12月は当年度", () => {
    expect(getFiscalYear(new Date("2026-12-15"))).toBe(2026);
  });
  it("1月は前年度", () => {
    expect(getFiscalYear(new Date("2027-01-15"))).toBe(2026);
  });
});
