import { describe, expect, it } from "vitest";
import {
  combineByCount,
  groupHealthRisk,
  riskQuantControl,
  riskSupport,
  riskTone,
  riskTotal,
} from "@/lib/health-risk";

describe("仕事のストレス判定図の健康リスク", () => {
  it("全国平均と同じ平均点なら健康リスクは100になる", () => {
    expect(riskQuantControl(8.7, 7.9, "male")).toBeCloseTo(100, 8);
    expect(riskSupport(7.5, 8.1, "male")).toBeCloseTo(100, 8);
    expect(riskQuantControl(7.9, 7.2, "female")).toBeCloseTo(100, 8);
    expect(riskSupport(6.6, 8.2, "female")).toBeCloseTo(100, 8);
    expect(riskTotal(100, 100)).toBeCloseTo(100, 8);
  });

  it("男性: 量的負担+1点・コントロール-1点で 100×exp(0.076+0.089) ≒ 118", () => {
    const a = riskQuantControl(9.7, 6.9, "male");
    expect(a).toBeCloseTo(100 * Math.exp(0.076 + 0.089), 8);
    expect(Math.round(a)).toBe(118);
  });

  it("男性: 上司支援-1点・同僚支援-1点で 100×exp(0.097+0.097) ≒ 121", () => {
    const b = riskSupport(6.5, 7.1, "male");
    expect(b).toBeCloseTo(100 * Math.exp(0.097 + 0.097), 8);
    expect(Math.round(b)).toBe(121);
  });

  it("女性: 量的負担+1点・コントロール-1点で 100×exp(0.048+0.056) ≒ 111", () => {
    const a = riskQuantControl(8.9, 6.2, "female");
    expect(a).toBeCloseTo(100 * Math.exp(0.048 + 0.056), 8);
    expect(Math.round(a)).toBe(111);
  });

  it("負担が軽い方向ではリスクが100未満になる", () => {
    expect(riskQuantControl(7.7, 8.9, "male")).toBeLessThan(100);
    expect(riskSupport(8.5, 9.1, "male")).toBeLessThan(100);
  });

  it("総合健康リスク = A×B/100", () => {
    expect(riskTotal(120, 110)).toBeCloseTo(132, 8);
  });

  it("男女計は人数による加重平均", () => {
    expect(combineByCount(110, 10, 90, 10)).toBeCloseTo(100, 8);
    expect(combineByCount(110, 30, 90, 10)).toBeCloseTo(105, 8);
    expect(combineByCount(110, 10, null, 0)).toBe(110);
    expect(combineByCount(null, 0, null, 0)).toBeNull();
  });

  it("groupHealthRisk: 男女とも全国平均なら100", () => {
    const r = groupHealthRisk({
      male: { quant: 8.7, control: 7.9, boss: 7.5, coworker: 8.1, n: 10 },
      female: { quant: 7.9, control: 7.2, boss: 6.6, coworker: 8.2, n: 10 },
    });
    expect(r.a).toBeCloseTo(100, 8);
    expect(r.b).toBeCloseTo(100, 8);
    expect(r.total).toBeCloseTo(100, 8);
  });

  it("groupHealthRisk: 片方の性別しかいなくても算出できる", () => {
    const r = groupHealthRisk({
      male: { quant: 9.7, control: 6.9, boss: 7.5, coworker: 8.1, n: 12 },
      female: null,
    });
    expect(Math.round(r.a!)).toBe(118);
    expect(Math.round(r.b!)).toBe(100);
    expect(Math.round(r.total!)).toBe(118);
  });

  it("riskTone: 100未満teal / 100以上yellow / 120以上orange / 150以上red", () => {
    expect(riskTone(95)).toBe("teal");
    expect(riskTone(110)).toBe("yellow");
    expect(riskTone(125)).toBe("orange");
    expect(riskTone(155)).toBe("red");
    expect(riskTone(null)).toBe("gray");
  });
});
