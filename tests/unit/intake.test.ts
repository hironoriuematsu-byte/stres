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

import { shouldRemind } from "@/lib/intake-invite";

describe("事前ヒアリング: 催促", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const base = { last_sent_at: "2026-10-16T00:00:00Z", sent_count: 1, declined_at: null };
  it("案内から3日たって未回答なら催促する", () => {
    expect(shouldRemind(base, null, "pending", now)).toBe(true);
    expect(shouldRemind(base, "in_progress", "scheduled", now)).toBe(true); // 途中でやめた人にも
  });
  it("3日たっていない・回数の上限・受けない・回答済み・面接終了なら催促しない", () => {
    expect(shouldRemind({ ...base, last_sent_at: "2026-10-18T00:00:00Z" }, null, "pending", now)).toBe(false);
    expect(shouldRemind({ ...base, sent_count: 3 }, null, "pending", now)).toBe(false);
    expect(shouldRemind({ ...base, declined_at: "2026-10-17T00:00:00Z" }, null, "pending", now)).toBe(false);
    expect(shouldRemind(base, "completed", "pending", now)).toBe(false);
    expect(shouldRemind(base, null, "done", now)).toBe(false);
    expect(shouldRemind({ ...base, last_sent_at: null, sent_count: 0 }, null, "pending", now)).toBe(false); // 最初の案内は実施者か申出時
  });
});
