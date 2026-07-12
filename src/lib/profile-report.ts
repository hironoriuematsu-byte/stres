// ============================================================
// 個人結果票: 素点換算(厚労省「職業性ストレス簡易調査票(57項目)」素点換算表)
//
// 各尺度の素点を男女別の換算表で1〜5段階(単一項目尺度は1〜4段階)の
// 評価点に変換する。評価点の意味は尺度により異なる:
//   direction = "negative": 評価点が高いほどストレス状況が悪い(負担・症状が多い)
//   direction = "positive": 評価点が高いほど良好(コントロール・サポート・満足が多い)
// レーダーチャートは「外側ほど良好」で統一して描画する(厚労省プログラム準拠)。
// ============================================================

import { Answers } from "@/lib/questionnaire";

export type Gender = "male" | "female";

type Range = [number, number];

export type ScaleDef = {
  key: string;
  label: string;
  short: string; // レーダーチャート用の短縮名(重複しないこと)
  category: "stressor" | "reaction" | "support";
  direction: "negative" | "positive";
  compute: (a: Answers) => number;
  male: Range[]; // 評価点1..n の素点範囲
  female: Range[];
};

const sum = (arr: (number | null)[], idxs: number[]) =>
  idxs.reduce((s, i) => s + (arr[i] ?? 0), 0);

export const SCALES: ScaleDef[] = [
  // ---- ストレスの原因と考えられる因子(A: 9尺度) ----
  {
    key: "quant",
    short: "負担(量)",
    label: "心理的な仕事の負担(量)",
    category: "stressor",
    direction: "negative",
    compute: (a) => 15 - sum(a.A, [0, 1, 2]),
    male: [[3, 5], [6, 7], [8, 9], [10, 11], [12, 12]],
    female: [[3, 4], [5, 6], [7, 9], [10, 11], [12, 12]],
  },
  {
    key: "qual",
    short: "負担(質)",
    label: "心理的な仕事の負担(質)",
    category: "stressor",
    direction: "negative",
    compute: (a) => 15 - sum(a.A, [3, 4, 5]),
    male: [[3, 5], [6, 7], [8, 9], [10, 11], [12, 12]],
    female: [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12]],
  },
  {
    key: "physical",
    short: "身体的負担",
    label: "自覚的な身体的負担度",
    category: "stressor",
    direction: "negative",
    compute: (a) => 5 - (a.A[6] ?? 0),
    male: [[1, 1], [2, 2], [3, 3], [4, 4]],
    female: [[1, 1], [2, 2], [3, 3], [4, 4]],
  },
  {
    key: "interpersonal",
    short: "対人関係",
    label: "職場の対人関係でのストレス",
    category: "stressor",
    direction: "negative",
    compute: (a) => 10 - sum(a.A, [11, 12]) + (a.A[13] ?? 0),
    male: [[3, 3], [4, 5], [6, 7], [8, 9], [10, 12]],
    female: [[3, 3], [4, 5], [6, 7], [8, 9], [10, 12]],
  },
  {
    key: "environment",
    short: "職場環境",
    label: "職場環境によるストレス",
    category: "stressor",
    direction: "negative",
    compute: (a) => 5 - (a.A[14] ?? 0),
    male: [[1, 1], [2, 2], [3, 3], [4, 4]],
    female: [[1, 1], [2, 2], [3, 3], [4, 4]],
  },
  {
    key: "control",
    short: "コントロール",
    label: "仕事のコントロール度",
    category: "stressor",
    direction: "positive",
    compute: (a) => 15 - sum(a.A, [7, 8, 9]),
    male: [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12]],
    female: [[3, 3], [4, 5], [6, 8], [9, 10], [11, 12]],
  },
  {
    key: "skill",
    short: "技能活用",
    label: "技能の活用度",
    category: "stressor",
    direction: "positive",
    compute: (a) => a.A[10] ?? 0,
    male: [[1, 1], [2, 2], [3, 3], [4, 4]],
    female: [[1, 1], [2, 2], [3, 3], [4, 4]],
  },
  {
    key: "aptitude",
    short: "適性度",
    label: "仕事の適性度",
    category: "stressor",
    direction: "positive",
    compute: (a) => 5 - (a.A[15] ?? 0),
    male: [[1, 1], [2, 2], [3, 3], [4, 4]],
    female: [[1, 1], [2, 2], [3, 3], [4, 4]],
  },
  {
    key: "meaning",
    short: "働きがい",
    label: "働きがい",
    category: "stressor",
    direction: "positive",
    compute: (a) => 5 - (a.A[16] ?? 0),
    male: [[1, 1], [2, 2], [3, 3], [4, 4]],
    female: [[1, 1], [2, 2], [3, 3], [4, 4]],
  },

  // ---- ストレスによっておこる心身の反応(B: 6尺度) ----
  {
    key: "vigor",
    short: "活気",
    label: "活気",
    category: "reaction",
    direction: "positive",
    compute: (a) => sum(a.B, [0, 1, 2]),
    male: [[3, 3], [4, 5], [6, 7], [8, 9], [10, 12]],
    female: [[3, 3], [4, 5], [6, 7], [8, 9], [10, 12]],
  },
  {
    key: "irritability",
    short: "イライラ感",
    label: "イライラ感",
    category: "reaction",
    direction: "negative",
    compute: (a) => sum(a.B, [3, 4, 5]),
    male: [[3, 3], [4, 5], [6, 7], [8, 9], [10, 12]],
    female: [[3, 3], [4, 5], [6, 8], [9, 10], [11, 12]],
  },
  {
    key: "fatigue",
    short: "疲労感",
    label: "疲労感",
    category: "reaction",
    direction: "negative",
    compute: (a) => sum(a.B, [6, 7, 8]),
    male: [[3, 3], [4, 4], [5, 7], [8, 10], [11, 12]],
    female: [[3, 3], [4, 5], [6, 8], [9, 11], [12, 12]],
  },
  {
    key: "anxiety",
    short: "不安感",
    label: "不安感",
    category: "reaction",
    direction: "negative",
    compute: (a) => sum(a.B, [9, 10, 11]),
    male: [[3, 3], [4, 4], [5, 7], [8, 9], [10, 12]],
    female: [[3, 3], [4, 4], [5, 7], [8, 10], [11, 12]],
  },
  {
    key: "depression",
    short: "抑うつ感",
    label: "抑うつ感",
    category: "reaction",
    direction: "negative",
    compute: (a) => sum(a.B, [12, 13, 14, 15, 16, 17]),
    male: [[6, 6], [7, 8], [9, 12], [13, 16], [17, 24]],
    female: [[6, 6], [7, 8], [9, 12], [13, 17], [18, 24]],
  },
  {
    key: "somatic",
    short: "身体愁訴",
    label: "身体愁訴",
    category: "reaction",
    direction: "negative",
    compute: (a) => sum(a.B, [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]),
    male: [[11, 11], [12, 15], [16, 21], [22, 26], [27, 44]],
    female: [[11, 13], [14, 17], [18, 23], [24, 29], [30, 44]],
  },

  // ---- ストレス反応に影響を与える他の因子(C・D: 4尺度) ----
  {
    key: "boss",
    short: "上司サポート",
    label: "上司からのサポート",
    category: "support",
    direction: "positive",
    compute: (a) => 15 - sum(a.C, [0, 3, 6]),
    male: [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12]],
    female: [[3, 3], [4, 5], [6, 7], [8, 10], [11, 12]],
  },
  {
    key: "coworker",
    short: "同僚サポート",
    label: "同僚からのサポート",
    category: "support",
    direction: "positive",
    compute: (a) => 15 - sum(a.C, [1, 4, 7]),
    male: [[3, 5], [6, 7], [8, 9], [10, 11], [12, 12]],
    female: [[3, 5], [6, 7], [8, 9], [10, 11], [12, 12]],
  },
  {
    key: "family",
    short: "家族・友人",
    label: "家族・友人からのサポート",
    category: "support",
    direction: "positive",
    compute: (a) => 15 - sum(a.C, [2, 5, 8]),
    male: [[3, 6], [7, 8], [9, 9], [10, 11], [12, 12]],
    female: [[3, 6], [7, 8], [9, 9], [10, 11], [12, 12]],
  },
  {
    key: "satisfaction",
    short: "満足度",
    label: "仕事や生活の満足度",
    category: "support",
    direction: "positive",
    compute: (a) => 10 - sum(a.D, [0, 1]),
    male: [[2, 3], [4, 4], [5, 6], [7, 7], [8, 8]],
    female: [[2, 3], [4, 4], [5, 6], [7, 7], [8, 8]],
  },
];

export type ScaleResult = {
  key: string;
  label: string;
  short: string;
  category: ScaleDef["category"];
  direction: ScaleDef["direction"];
  raw: number; // 換算後の素点
  grade: number; // 評価点 1..gradeMax
  gradeMax: number; // 5 または 4(単一項目尺度)
  gradeLabel: string;
  radar: number; // レーダー用(外側ほど良好, 1..5)
};

const LABELS_NEG = ["低い/少ない", "やや低い/少ない", "普通", "やや高い/多い", "高い/多い"];
const LABELS_POS = ["低い/少ない", "やや低い/少ない", "普通", "やや高い/多い", "高い/多い"];

export function computeProfile(answers: Answers, gender: Gender): ScaleResult[] {
  return SCALES.map((s) => {
    const raw = s.compute(answers);
    const ranges = gender === "male" ? s.male : s.female;
    let grade = 1;
    for (let i = 0; i < ranges.length; i++) {
      if (raw >= ranges[i][0] && raw <= ranges[i][1]) {
        grade = i + 1;
        break;
      }
      if (raw > ranges[ranges.length - 1][1]) grade = ranges.length;
    }
    const gradeMax = ranges.length;
    const labels = s.direction === "negative" ? LABELS_NEG : LABELS_POS;
    // レーダー: 外側(値が大きい)ほど良好に統一
    const radar = s.direction === "positive" ? grade : gradeMax + 1 - grade;
    return {
      key: s.key,
      label: s.label,
      short: s.short,
      category: s.category,
      direction: s.direction,
      raw,
      grade,
      gradeMax,
      gradeLabel: labels[grade - 1],
      radar,
    };
  });
}

export function hasCompleteAnswers(answers: unknown): answers is Answers {
  if (!answers || typeof answers !== "object") return false;
  const a = answers as Record<string, unknown>;
  return (
    Array.isArray(a.A) && a.A.length === 17 && a.A.every((v) => typeof v === "number") &&
    Array.isArray(a.B) && a.B.length === 29 && a.B.every((v) => typeof v === "number") &&
    Array.isArray(a.C) && a.C.length === 9 && a.C.every((v) => typeof v === "number") &&
    Array.isArray(a.D) && a.D.length === 2 && a.D.every((v) => typeof v === "number")
  );
}

// コメント文の自動生成(厚労省プログラムの結果説明に相当する簡易アドバイス)
export function buildAdvice(profile: ScaleResult[], highStress: boolean): string[] {
  const out: string[] = [];

  const bad = (s: ScaleResult) =>
    s.direction === "negative" ? s.grade >= s.gradeMax - 1 : s.grade <= 2;

  const stressors = profile.filter((s) => s.category === "stressor" && bad(s)).map((s) => s.label);
  const reactions = profile.filter((s) => s.category === "reaction" && bad(s)).map((s) => s.label);
  const supports = profile.filter((s) => s.category === "support" && bad(s)).map((s) => s.label);

  if (highStress) {
    out.push(
      "今回の結果は「高ストレス」に該当し、医師(産業医)による面接指導の対象です。マイページから面接指導の申出ができます。申出を理由とする不利益な取り扱いは法律で禁止されています。"
    );
  }

  if (reactions.length > 0) {
    out.push(
      `心身のストレス反応では「${reactions.join("」「")}」に注意が必要な状態です。十分な睡眠・休養を心がけ、つらい状態が続く場合は産業医や医療機関、社外の相談窓口に早めに相談してください。`
    );
  } else {
    out.push("心身のストレス反応は、現時点で大きな問題は見られません。");
  }

  if (stressors.length > 0) {
    out.push(
      `仕事のストレス要因では「${stressors.join("」「")}」が負担になっている可能性があります。業務量や進め方について、上司や同僚と話し合える部分がないか検討してみてください。`
    );
  }

  if (supports.length > 0) {
    out.push(
      `「${supports.join("」「")}」が少なめです。周囲に相談できる相手を持つことはストレスの緩和に有効です。職場内外のコミュニケーションの機会を意識的に持つことをおすすめします。`
    );
  }

  out.push(
    "この結果は医療上の診断ではありません。結果にかかわらず、体調の変化を感じたときは産業医・保健師や医療機関にご相談ください。"
  );

  return out;
}
