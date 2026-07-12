import { describe, it, expect } from "vitest";
import { aggregateByDept, GroupResultInput } from "@/lib/group-report";
import { Answers } from "@/lib/questionnaire";

function fullAnswers(v: number): Answers {
  return { A: Array(17).fill(v), B: Array(29).fill(v), C: Array(9).fill(v), D: Array(2).fill(v) };
}

function row(dept: string, high = false, withAnswers = true): GroupResultInput {
  return {
    dept,
    answers: withAnswers ? fullAnswers(2) : {},
    gender: withAnswers ? "male" : null,
    high_stress: high,
    score_a: 40,
    score_b: high ? 80 : 50,
    score_c: 20,
  };
}

describe("集団分析の集計", () => {
  it("9名の部署は除外され、10名の部署は集計される(受け入れテスト5と同基準)", () => {
    const rows = [
      ...Array.from({ length: 9 }, () => row("九名部署")),
      ...Array.from({ length: 10 }, () => row("十名部署")),
    ];
    const { depts, excludedDepts, total } = aggregateByDept(rows);
    expect(depts.map((d) => d.dept)).toEqual(["十名部署"]);
    expect(excludedDepts).toBe(1);
    expect(total?.n).toBe(19); // 全体は合計10名以上なので出る
  });

  it("全体が10名未満なら全体も出さない", () => {
    const rows = Array.from({ length: 5 }, () => row("小部署"));
    const { depts, total } = aggregateByDept(rows);
    expect(depts).toHaveLength(0);
    expect(total).toBeNull();
  });

  it("高ストレス率と判定図尺度平均が計算される", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => row("部署X", true)),
      ...Array.from({ length: 5 }, () => row("部署X", false)),
    ];
    const { depts } = aggregateByDept(rows);
    const x = depts[0];
    expect(x.highRate).toBe(50);
    // 全回答2: 量的負担 = 15-6 = 9, コントロール = 15-6 = 9, 上司/同僚 = 15-6 = 9
    expect(x.quant).toBe(9);
    expect(x.control).toBe(9);
    expect(x.boss).toBe(9);
    expect(x.coworker).toBe(9);
    expect(x.detailCount).toBe(10);
    // 尺度別平均評価点も入る
    expect(x.meanGrades.quant).not.toBeNull();
  });

  it("回答詳細のない旧データは尺度集計から除外されるが人数には含まれる", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => row("部署Y", false, true)),
      ...Array.from({ length: 2 }, () => row("部署Y", false, false)),
    ];
    const { depts } = aggregateByDept(rows);
    expect(depts[0].n).toBe(10);
    expect(depts[0].detailCount).toBe(8);
  });
});
