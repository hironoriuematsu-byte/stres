// ============================================================
// 広告・紹介用のデモデータ(架空の「モデル株式会社」100名・5部署)
//
// - 実データベースには一切保存せず、毎回この場で生成する
//   (実企業の集計・CSV・ログに混ざらない)
// - 乱数は固定シードのため、誰がいつ見ても同じ結果になる
// - 判定・集計は本番と同じロジック(questionnaire / profile-report /
//   group-report / health-risk)を通すので、表示内容は実物と同等
// ============================================================

import { Answers, calcScores, SECTION_A, SECTION_B, SECTION_D } from "@/lib/questionnaire";
import type { GroupResultInput } from "@/lib/group-report";
import type { ResultRow } from "@/lib/types";
import type { Gender } from "@/lib/profile-report";

export const DEMO_COMPANY = "モデル株式会社";
export const DEMO_FISCAL_YEAR = 2026;

// 部署ごとの傾向(1に近いほど負担が重く支援が乏しい設定)
const DEPTS: { name: string; n: number; load: number; support: number }[] = [
  { name: "製造部", n: 32, load: 0.64, support: 0.46 },
  { name: "営業部", n: 24, load: 0.73, support: 0.42 },
  { name: "開発部", n: 18, load: 0.6, support: 0.56 },
  { name: "管理部", n: 14, load: 0.47, support: 0.64 },
  { name: "品質保証部", n: 12, load: 0.55, support: 0.52 },
];

// 固定シードの擬似乱数(mulberry32)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 状況の悪さ(0=良好〜1=不良)を回答値1〜4に変換する。
// 設問が肯定文(r=false: 「活気がわいてくる」等)なら、状況が悪いほど高い値、
// 否定文・負担文(r=true: 「たくさんの仕事をしなければならない」等)なら
// 状況が悪いほど低い値(=「そうだ」)になる。
function answerFor(rand: () => number, badness: number, reverse: boolean): number {
  const t = reverse ? 1 - badness : badness;
  const v = t * 3 + 1 + (rand() - 0.5) * 1.5;
  return Math.min(4, Math.max(1, Math.round(v)));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const SURNAMES = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
];
const GIVEN_M = ["健太", "翔", "大輔", "拓也", "誠", "直樹", "洋平", "亮", "隆", "浩二"];
const GIVEN_F = ["恵子", "由美", "彩", "美咲", "陽子", "沙織", "麻衣", "千夏", "裕子", "理恵"];

export type DemoPerson = {
  id: string;
  name: string;
  empId: string;
  dept: string;
  gender: Gender;
  answers: Answers;
  scores: ReturnType<typeof calcScores>;
  createdAt: string;
};

// 100名分の架空の受検データを生成する(常に同じ内容)
export function buildDemoPeople(): DemoPerson[] {
  const rand = rng(20260401);
  const people: DemoPerson[] = [];
  let seq = 0;

  for (const d of DEPTS) {
    for (let i = 0; i < d.n; i++) {
      seq++;
      const gender: Gender = rand() < 0.62 ? "male" : "female";
      // 個人差: 部署の傾向を中心にばらつきを持たせる
      const personal = (rand() - 0.5) * 0.45;
      const load = clamp01(d.load + personal); // 仕事の負担の重さ
      const ctrlLack = clamp01(0.15 + d.load * 0.6 + personal * 0.8); // 裁量の乏しさ
      const supportLack = clamp01(1 - d.support + personal * 0.7); // 支援の乏しさ
      // 心身の反応は、負担が重く裁量・支援が乏しいほど強く出る
      const reaction = clamp01(
        0.085 + load * 0.28 + ctrlLack * 0.1 + supportLack * 0.13 + (rand() - 0.5) * 0.34
      );

      // A領域の設問ごとに対応する状況の悪さ(尺度の並びに合わせる)
      const aBadness = [
        load, load, load, // 量的負担
        load * 0.9, load * 0.85, load * 0.9, // 質的負担
        load * 0.8, // 身体的負担
        ctrlLack, ctrlLack, ctrlLack, // コントロール
        ctrlLack * 0.8, // 技能の活用度
        supportLack * 0.8, supportLack * 0.7, supportLack, // 対人関係・雰囲気
        load * 0.6, // 職場環境
        (ctrlLack + supportLack) / 2, (ctrlLack + supportLack) / 2, // 適性・働きがい
      ];

      const answers: Answers = {
        A: SECTION_A.items.map((it, i) => answerFor(rand, aBadness[i], it.r)),
        B: SECTION_B.items.map((it) => answerFor(rand, reaction, it.r)),
        // C領域は3設問×3対象=9問(上司・同僚・家族)。家族の支援は職場より良好にする
        C: Array.from({ length: 9 }, (_, i) =>
          answerFor(rand, i % 3 === 2 ? supportLack * 0.55 : supportLack, false)
        ),
        D: SECTION_D.items.map(() => answerFor(rand, (supportLack + load) / 2, false)),
      };

      const surname = SURNAMES[seq % SURNAMES.length];
      const given = (gender === "male" ? GIVEN_M : GIVEN_F)[Math.floor(rand() * 10)];
      const day = 3 + (seq % 20);

      people.push({
        id: `demo-${String(seq).padStart(3, "0")}`,
        name: `${surname} ${given}`,
        empId: `M${String(1000 + seq)}`,
        dept: d.name,
        gender,
        answers,
        scores: calcScores(answers),
        createdAt: `${DEMO_FISCAL_YEAR}-06-${String(day).padStart(2, "0")}T10:00:00+09:00`,
      });
    }
  }
  return people;
}

// 集団分析(GroupReportView)に渡す形式
export function demoGroupRows(people: DemoPerson[]): GroupResultInput[] {
  return people.map((p) => ({
    dept: p.dept,
    answers: p.answers,
    gender: p.gender,
    high_stress: p.scores.highStress,
    score_a: p.scores.A,
    score_b: p.scores.B,
    score_c: p.scores.C,
  }));
}

// 個人結果票(ReportView)に渡す形式
export function demoResultRow(p: DemoPerson): ResultRow & { answers: unknown; gender: Gender } {
  return {
    id: p.id,
    user_id: p.id,
    company_id: "demo-company",
    dept: p.dept,
    fiscal_year: DEMO_FISCAL_YEAR,
    score_a: p.scores.A,
    score_b: p.scores.B,
    score_c: p.scores.C,
    score_d: p.scores.D,
    high_stress: p.scores.highStress,
    consent: true,
    created_at: p.createdAt,
    answers: p.answers,
    gender: p.gender,
  };
}
