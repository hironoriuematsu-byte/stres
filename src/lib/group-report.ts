// ============================================================
// 集団分析報告書用の集計
//
// - 部署単位で集計し、受検者10名未満の部署は個人特定防止のため除外
//   (DBのgroup_analysis RPCと同じ基準をクライアント集計にも適用)
// - 仕事のストレス判定図で用いる4尺度(量的負担・コントロール・
//   上司支援・同僚支援)の素点平均と、19尺度の平均評価点を算出
// ============================================================

import { computeProfile, hasCompleteAnswers, Gender, SCALES } from "@/lib/profile-report";
import { Answers } from "@/lib/questionnaire";

export const MIN_GROUP = 10;

export type GroupResultInput = {
  dept: string;
  answers: unknown;
  gender: string | null;
  high_stress: boolean;
  score_a: number;
  score_b: number;
  score_c: number;
};

export type DeptAggregate = {
  dept: string;
  n: number;
  highN: number;
  highRate: number; // %
  avgA: number;
  avgB: number;
  avgC: number;
  detailCount: number; // 回答詳細+性別のあるデータ件数
  quant: number | null; // 量的負担 平均(3-12)
  control: number | null; // コントロール 平均(3-12)
  boss: number | null; // 上司支援 平均(3-12)
  coworker: number | null; // 同僚支援 平均(3-12)
  meanGrades: Record<string, number | null>; // 尺度key → 平均評価点
};

const r1 = (v: number) => Math.round(v * 10) / 10;

function judgeScales(a: Answers) {
  const s = (arr: (number | null)[], idxs: number[]) => idxs.reduce((t, i) => t + (arr[i] ?? 0), 0);
  return {
    quant: 15 - s(a.A, [0, 1, 2]),
    control: 15 - s(a.A, [7, 8, 9]),
    boss: 15 - s(a.C, [0, 3, 6]),
    coworker: 15 - s(a.C, [1, 4, 7]),
  };
}

function aggregate(dept: string, rows: GroupResultInput[]): DeptAggregate {
  const n = rows.length;
  const highN = rows.filter((r) => r.high_stress).length;

  const detailed = rows.filter(
    (r) => hasCompleteAnswers(r.answers) && (r.gender === "male" || r.gender === "female")
  );

  const js = detailed.map((r) => judgeScales(r.answers as Answers));
  const mean = (vals: number[]) => (vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null);

  const meanGrades: Record<string, number | null> = {};
  if (detailed.length > 0) {
    const profiles = detailed.map((r) => computeProfile(r.answers as Answers, r.gender as Gender));
    for (const scale of SCALES) {
      const grades = profiles.map((p) => p.find((s) => s.key === scale.key)!.grade);
      meanGrades[scale.key] = mean(grades);
    }
  } else {
    for (const scale of SCALES) meanGrades[scale.key] = null;
  }

  return {
    dept,
    n,
    highN,
    highRate: n ? r1((highN / n) * 100) : 0,
    avgA: r1(rows.reduce((a, b) => a + b.score_a, 0) / n),
    avgB: r1(rows.reduce((a, b) => a + b.score_b, 0) / n),
    avgC: r1(rows.reduce((a, b) => a + b.score_c, 0) / n),
    detailCount: detailed.length,
    quant: mean(js.map((j) => j.quant)),
    control: mean(js.map((j) => j.control)),
    boss: mean(js.map((j) => j.boss)),
    coworker: mean(js.map((j) => j.coworker)),
    meanGrades,
  };
}

// 部署ごと(10名以上のみ)+ 全体(10名以上のとき)を返す
export function aggregateByDept(rows: GroupResultInput[]): {
  total: DeptAggregate | null;
  depts: DeptAggregate[];
  excludedDepts: number; // 10名未満で除外された部署数
} {
  const byDept = new Map<string, GroupResultInput[]>();
  for (const r of rows) {
    const key = r.dept || "未記入";
    if (!byDept.has(key)) byDept.set(key, []);
    byDept.get(key)!.push(r);
  }

  const depts: DeptAggregate[] = [];
  let excludedDepts = 0;
  for (const [dept, list] of byDept) {
    if (list.length >= MIN_GROUP) {
      depts.push(aggregate(dept, list));
    } else {
      excludedDepts++;
    }
  }
  depts.sort((a, b) => b.highRate - a.highRate);

  const total = rows.length >= MIN_GROUP ? aggregate("全体", rows) : null;
  return { total, depts, excludedDepts };
}
