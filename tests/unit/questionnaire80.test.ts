import { describe, expect, it } from "vitest";
import {
  EXT80_COUNT,
  EXT80_ITEMS,
  EXT80_SCALES,
  computeExt80,
  emptyExt80,
  isExt80Complete,
  itemScore,
} from "@/lib/questionnaire80";

describe("80項目版の追加23項目(新職業性ストレス簡易調査票 推奨尺度セット短縮版)", () => {
  it("設問は23問で、番号は58〜80の連番", () => {
    expect(EXT80_COUNT).toBe(23);
    expect(EXT80_ITEMS.map((i) => i.no)).toEqual(
      Array.from({ length: 23 }, (_, i) => 58 + i)
    );
  });

  it("尺度は22(ワーク・エンゲイジメントのみ2項目、他は1項目)", () => {
    expect(EXT80_SCALES).toHaveLength(22);
    const multi = EXT80_SCALES.filter((s) => s.items.length > 1);
    expect(multi.map((s) => s.key)).toEqual(["engagement"]);
    // 全23項目がいずれかの尺度で使われている
    const used = new Set(EXT80_SCALES.flatMap((s) => s.items));
    expect(used.size).toBe(23);
  });

  it("肯定文の設問は反転して採点する(高得点=良好に統一)", () => {
    // 「職を失う恐れがある」(否定的な内容)はそのまま: 回答4(ちがう)=4点で良好
    expect(itemScore(4, false)).toBe(4);
    expect(itemScore(1, false)).toBe(1);
    // 「上司は誠実な態度で対応してくれる」(肯定文)は反転: 回答1(そうだ)=4点で良好
    expect(itemScore(1, true)).toBe(4);
    expect(itemScore(4, true)).toBe(1);
  });

  it("すべて最も良好な回答なら、全尺度が満点(4.0)になる", () => {
    const best = EXT80_ITEMS.map((it) => (it.r ? 1 : 4));
    const res = computeExt80(best, "male");
    expect(res.every((s) => s.score === 4)).toBe(true);
    expect(res.every((s) => s.diff > 0)).toBe(true);
  });

  it("すべて最も不良な回答なら、全尺度が1.0になる", () => {
    const worst = EXT80_ITEMS.map((it) => (it.r ? 4 : 1));
    const res = computeExt80(worst, "female");
    expect(res.every((s) => s.score === 1)).toBe(true);
    expect(res.every((s) => s.diff < 0)).toBe(true);
  });

  it("全国平均は性別で切り替わる(役割葛藤: 男2.73 / 女3.01)", () => {
    const a = EXT80_ITEMS.map(() => 2);
    const m = computeExt80(a, "male").find((s) => s.key === "roleConflict")!;
    const f = computeExt80(a, "female").find((s) => s.key === "roleConflict")!;
    const n = computeExt80(a, null).find((s) => s.key === "roleConflict")!;
    expect(m.norm).toBe(2.73);
    expect(f.norm).toBe(3.01);
    expect(n.norm).toBe(2.87); // 性別不明時は男女計
  });

  it("ワーク・エンゲイジメントは2項目の平均", () => {
    const a = EXT80_ITEMS.map(() => 4);
    // 設問79・80(肯定文)に 1(そうだ) と 3 を与える → (4 + 2) / 2 = 3
    a[EXT80_ITEMS.findIndex((i) => i.no === 79)] = 1;
    a[EXT80_ITEMS.findIndex((i) => i.no === 80)] = 3;
    const r = computeExt80(a, "male").find((s) => s.key === "engagement")!;
    expect(r.score).toBe(3);
  });

  it("未回答・件数不足のデータは不完全と判定する", () => {
    expect(isExt80Complete(emptyExt80())).toBe(false);
    expect(isExt80Complete(null)).toBe(false);
    expect(isExt80Complete(Array(22).fill(2))).toBe(false);
    expect(isExt80Complete(Array(23).fill(2))).toBe(true);
    expect(isExt80Complete(Array(23).fill(5))).toBe(false); // 範囲外
  });
});
