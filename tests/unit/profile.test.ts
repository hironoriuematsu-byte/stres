import { describe, it, expect } from "vitest";
import { computeProfile, hasCompleteAnswers } from "@/lib/profile-report";
import { Answers } from "@/lib/questionnaire";

function answers(a: number, b: number, c: number, d: number): Answers {
  return {
    A: Array(17).fill(a),
    B: Array(29).fill(b),
    C: Array(9).fill(c),
    D: Array(2).fill(d),
  };
}

describe("素点換算(厚労省 素点換算表)", () => {
  it("負担が最大の回答 → 負担(量)は男女とも最高評価点(悪い)", () => {
    // A全て「そうだ」(1): 負担(量) = 15-(1+1+1) = 12
    const ans = answers(1, 1, 1, 1);
    const male = computeProfile(ans, "male");
    const female = computeProfile(ans, "female");
    const mq = male.find((s) => s.key === "quant")!;
    const fq = female.find((s) => s.key === "quant")!;
    expect(mq.raw).toBe(12);
    expect(mq.grade).toBe(5);
    expect(fq.grade).toBe(5);
    // negative尺度なのでレーダーは中心寄り(1)
    expect(mq.radar).toBe(1);
  });

  it("サポートが最良の回答 → 上司サポートは最高評価点(良い)", () => {
    // C全て「非常に」(1): 上司サポート = 15-3 = 12
    const ans = answers(1, 1, 1, 1);
    const p = computeProfile(ans, "male");
    const boss = p.find((s) => s.key === "boss")!;
    expect(boss.raw).toBe(12);
    expect(boss.grade).toBe(5);
    expect(boss.radar).toBe(5); // positive尺度は外側
  });

  it("疲労感の男女差: 素点4は男性=評価2、女性=評価2、素点5は男性3・女性2", () => {
    // B7,8,9(疲労)のみ調整するため個別に設定
    const base = answers(3, 1, 2, 2);
    // 疲労感 = B[6]+B[7]+B[8]
    base.B[6] = 2;
    base.B[7] = 1;
    base.B[8] = 1; // 合計4
    expect(computeProfile(base, "male").find((s) => s.key === "fatigue")!.grade).toBe(2);
    expect(computeProfile(base, "female").find((s) => s.key === "fatigue")!.grade).toBe(2);
    base.B[8] = 2; // 合計5
    expect(computeProfile(base, "male").find((s) => s.key === "fatigue")!.grade).toBe(3);
    expect(computeProfile(base, "female").find((s) => s.key === "fatigue")!.grade).toBe(2);
  });

  it("抑うつ感: 素点6(最低)は評価1、素点24(最高)は評価5", () => {
    const low = answers(3, 1, 2, 2); // B全て1 → 抑うつ 6項目×1=6
    expect(computeProfile(low, "male").find((s) => s.key === "depression")!.grade).toBe(1);
    const high = answers(3, 4, 2, 2); // B全て4 → 24
    expect(computeProfile(high, "male").find((s) => s.key === "depression")!.grade).toBe(5);
    expect(computeProfile(high, "female").find((s) => s.key === "depression")!.grade).toBe(5);
  });

  it("単一項目尺度(働きがい)は4段階", () => {
    const ans = answers(1, 2, 2, 2); // A17=1(そうだ=働きがいあり) → 5-1=4
    const p = computeProfile(ans, "male").find((s) => s.key === "meaning")!;
    expect(p.gradeMax).toBe(4);
    expect(p.grade).toBe(4);
    expect(p.radar).toBe(4);
  });

  it("全19尺度が計算される", () => {
    const p = computeProfile(answers(2, 2, 2, 2), "female");
    expect(p).toHaveLength(19); // 9 + 6 + 4
    expect(p.every((s) => s.grade >= 1 && s.grade <= s.gradeMax)).toBe(true);
  });
});

describe("回答データの検証", () => {
  it("完全な回答はtrue、空オブジェクトはfalse", () => {
    expect(hasCompleteAnswers(answers(1, 1, 1, 1))).toBe(true);
    expect(hasCompleteAnswers({})).toBe(false);
    expect(hasCompleteAnswers(null)).toBe(false);
    expect(hasCompleteAnswers({ A: [1], B: [], C: [], D: [] })).toBe(false);
  });
});
