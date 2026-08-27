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
import { groupHealthRisk, GroupHealthRisk } from "@/lib/health-risk";
import { EXT80_SCALES, computeExt80, isExt80Complete } from "@/lib/questionnaire80";

export const MIN_GROUP = 10;

export type GroupResultInput = {
  dept: string;
  answers: unknown;
  answers_ext?: unknown; // 80項目版の追加23項目(ある場合のみ)
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
  ext80Count: number; // 80項目版の追加分に回答済みの人数
  ext80Means: Record<string, number | null>; // 追加尺度key → 平均得点(1〜4、高いほど良好)
  healthRisk: GroupHealthRisk; // 仕事のストレス判定図の健康リスク(男女計・全国平均=100)
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

  // 判定図・係数は男女別のため、健康リスク算出用に男女それぞれの平均を求める
  const genderJudgeMeans = (g: "male" | "female") => {
    const rows2 = detailed.filter((r) => r.gender === g);
    if (rows2.length === 0) return null;
    const js2 = rows2.map((r) => judgeScales(r.answers as Answers));
    const m = (f: (j: ReturnType<typeof judgeScales>) => number) =>
      js2.reduce((t, j) => t + f(j), 0) / js2.length;
    return {
      quant: m((j) => j.quant),
      control: m((j) => j.control),
      boss: m((j) => j.boss),
      coworker: m((j) => j.coworker),
      n: rows2.length,
    };
  };
  const healthRisk = groupHealthRisk({ male: genderJudgeMeans("male"), female: genderJudgeMeans("female") });

  // 80項目版の追加尺度(回答がある人だけで平均する)
  const extRows = rows.filter((r) => isExt80Complete(r.answers_ext));
  const ext80Means: Record<string, number | null> = {};
  if (extRows.length > 0) {
    const profiles = extRows.map((r) =>
      computeExt80(r.answers_ext as number[], r.gender === "male" || r.gender === "female" ? r.gender : null)
    );
    for (const sc of EXT80_SCALES) {
      const vals = profiles.map((p) => p.find((x) => x.key === sc.key)!.score);
      ext80Means[sc.key] = r1(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  } else {
    for (const sc of EXT80_SCALES) ext80Means[sc.key] = null;
  }

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
    ext80Count: extRows.length,
    ext80Means,
    healthRisk,
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
