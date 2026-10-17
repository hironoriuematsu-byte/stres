import { describe, expect, it } from "vitest";
import { detectCrisis, higherRisk, SUMMARY_SCHEMA, TURN_SCHEMA } from "@/lib/intake";

describe("事前ヒアリング: 命に関わるサインの言葉", () => {
  it("はっきりした言葉は拾う(全角・半角の違いも)", () => {
    expect(detectCrisis("もう死にたいと思うことがある")).toBe(true);
    expect(detectCrisis("消えたい気持ちになる")).toBe(true);
    expect(detectCrisis("自殺を考えたことがある")).toBe(true);
    expect(detectCrisis("生きていたくない")).toBe(true);
    expect(detectCrisis("リストカットをしてしまった")).toBe(true);
  });
  it("ふつうの困りごとでは反応しない", () => {
    expect(detectCrisis("残業が多くて眠れない")).toBe(false);
    expect(detectCrisis("上司との関係がつらい")).toBe(false);
    expect(detectCrisis("死ぬほど忙しい")).toBe(false);
  });
});

describe("事前ヒアリング: 緊急度", () => {
  it("高いほうを残す", () => {
    expect(higherRisk("low", "high")).toBe("high");
    expect(higherRisk("moderate", "low")).toBe("moderate");
    expect(higherRisk("none", "none")).toBe("none");
  });
  it("AIの返答の形は必須項目がそろっている", () => {
    expect(TURN_SCHEMA.required).toEqual(["reply", "done", "risk_level"]);
    expect(SUMMARY_SCHEMA.required).toContain("reply_draft");
    expect(SUMMARY_SCHEMA.additionalProperties).toBe(false);
  });
});
