// 紙の回答用紙(専用様式)。設問に 1〜57(80項目版は 1〜80)の通し番号を付け、
// 用紙の印刷・回答の登録画面・写真からのAI読み取りで同じ番号を使う。
//   1〜17: A / 18〜46: B / 47〜55: C / 56〜57: D / 58〜80: 80項目版の追加(E〜H)

import { SECTION_A, SECTION_B, SECTION_C, SECTION_D, emptyAnswers, type Answers } from "@/lib/questionnaire";
import { EXT80_COUNT, EXT80_ITEMS, SECTION_E, SECTION_F, SECTION_G, SECTION_H, type Ext80Answers } from "@/lib/questionnaire80";

export type PaperItem = {
  no: number; // 通し番号(1〜)
  section: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  text: string;
  group?: string; // C の小見出し(次の人たちはどのくらい気軽に話ができますか? など)
};
export type PaperSection = { key: PaperItem["section"]; title: string; options: string[]; items: PaperItem[] };

export const PAPER_BASE_COUNT = 57;
export const paperCount = (questionnaire: "57" | "80"): number => (questionnaire === "80" ? PAPER_BASE_COUNT + EXT80_COUNT : PAPER_BASE_COUNT);

export function paperSections(questionnaire: "57" | "80"): PaperSection[] {
  let no = 0;
  const out: PaperSection[] = [
    { key: "A", title: SECTION_A.title, options: SECTION_A.options, items: SECTION_A.items.map((it) => ({ no: ++no, section: "A" as const, text: it.t })) },
    { key: "B", title: SECTION_B.title, options: SECTION_B.options, items: SECTION_B.items.map((it) => ({ no: ++no, section: "B" as const, text: it.t })) },
    {
      key: "C",
      title: SECTION_C.title,
      options: SECTION_C.options,
      items: SECTION_C.groups.flatMap((g) => g.items.map((t) => ({ no: ++no, section: "C" as const, text: t, group: g.label }))),
    },
    { key: "D", title: SECTION_D.title, options: SECTION_D.options, items: SECTION_D.items.map((it) => ({ no: ++no, section: "D" as const, text: it.t })) },
  ];
  if (questionnaire === "80") {
    for (const sec of [SECTION_E, SECTION_F, SECTION_G, SECTION_H]) {
      out.push({
        key: sec.key,
        title: sec.title,
        options: sec.options,
        items: EXT80_ITEMS.filter((it) => it.section === sec.key).map((it) => ({ no: it.no, section: sec.key, text: it.t })),
      });
    }
  }
  return out;
}

// 通し番号順の回答(0 = 未記入・読めない、1〜4)
export type FlatAnswers = number[];

export const emptyFlat = (questionnaire: "57" | "80"): FlatAnswers => Array(paperCount(questionnaire)).fill(0);
export const validChoice = (v: unknown): v is 1 | 2 | 3 | 4 => v === 1 || v === 2 || v === 3 || v === 4;
// すべての設問に 1〜4 の回答があるか
export const flatComplete = (flat: FlatAnswers, questionnaire: "57" | "80"): boolean =>
  flat.length === paperCount(questionnaire) && flat.every(validChoice);
// 未記入の設問番号
export const flatMissing = (flat: FlatAnswers, questionnaire: "57" | "80"): number[] =>
  Array.from({ length: paperCount(questionnaire) }, (_, i) => i + 1).filter((no) => !validChoice(flat[no - 1]));

// 通し番号順の回答を、Web受検と同じ保存の形(answers / answers_ext)にする
export function flatToAnswers(flat: FlatAnswers, questionnaire: "57" | "80"): { answers: Answers; ext: Ext80Answers | null } {
  const a = emptyAnswers();
  const nA = a.A.length;
  const nB = a.B.length;
  const nC = a.C.length;
  const nD = a.D.length;
  const pick = (from: number, n: number) => flat.slice(from, from + n).map((v) => (validChoice(v) ? v : null));
  a.A = pick(0, nA);
  a.B = pick(nA, nB);
  a.C = pick(nA + nB, nC);
  a.D = pick(nA + nB + nC, nD);
  const ext = questionnaire === "80" ? pick(PAPER_BASE_COUNT, EXT80_COUNT) : null;
  return { answers: a, ext };
}

// 入力を通し番号順の回答にそろえる(長さを合わせ、1〜4 以外は 0)
export function cleanFlat(input: unknown, questionnaire: "57" | "80"): FlatAnswers {
  const n = paperCount(questionnaire);
  const src = Array.isArray(input) ? input : [];
  return Array.from({ length: n }, (_, i) => (validChoice(src[i]) ? (src[i] as number) : 0));
}
