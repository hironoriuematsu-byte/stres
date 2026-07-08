// ============================================================
// 職業性ストレス簡易調査票(57項目) — 厚生労働省版
// 判定: 合計点数法(数値基準に基づく高ストレス者の選定・例)
//   ① 領域B 合計 ≧ 77点
//   ② 領域A+C 合計 ≧ 76点 かつ 領域B 合計 ≧ 63点
// 換算: 点数が高いほどストレスが高くなるよう反転処理
// ============================================================

export type QuestionItem = { t: string; r: boolean };

export const SECTION_A = {
  key: "A" as const,
  title: "A. あなたの仕事について",
  lead: "最もあてはまるものを選んでください。",
  options: ["そうだ", "まあそうだ", "ややちがう", "ちがう"],
  items: [
    { t: "非常にたくさんの仕事をしなければならない", r: true },
    { t: "時間内に仕事が処理しきれない", r: true },
    { t: "一生懸命働かなければならない", r: true },
    { t: "かなり注意を集中する必要がある", r: true },
    { t: "高度の知識や技術が必要なむずかしい仕事だ", r: true },
    { t: "勤務時間中はいつも仕事のことを考えていなければならない", r: true },
    { t: "からだを大変よく使う仕事だ", r: true },
    { t: "自分のペースで仕事ができる", r: false },
    { t: "自分で仕事の順番・やり方を決めることができる", r: false },
    { t: "職場の仕事の方針に自分の意見を反映できる", r: false },
    { t: "自分の技能や知識を仕事で使うことが少ない", r: true },
    { t: "私の部署内で意見のくい違いがある", r: true },
    { t: "私の部署と他の部署とはうまが合わない", r: true },
    { t: "私の職場の雰囲気は友好的である", r: false },
    { t: "私の職場の作業環境(騒音、照明、温度、換気など)はよくない", r: true },
    { t: "仕事の内容は自分にあっている", r: false },
    { t: "働きがいのある仕事だ", r: false },
  ] satisfies QuestionItem[],
};

export const SECTION_B = {
  key: "B" as const,
  title: "B. 最近1か月間のあなたの状態について",
  lead: "最もあてはまるものを選んでください。",
  options: ["ほとんどなかった", "ときどきあった", "しばしばあった", "ほとんどいつもあった"],
  items: [
    { t: "活気がわいてくる", r: true },
    { t: "元気がいっぱいだ", r: true },
    { t: "生き生きする", r: true },
    { t: "怒りを感じる", r: false },
    { t: "内心腹立たしい", r: false },
    { t: "イライラしている", r: false },
    { t: "ひどく疲れた", r: false },
    { t: "へとへとだ", r: false },
    { t: "だるい", r: false },
    { t: "気がはりつめている", r: false },
    { t: "不安だ", r: false },
    { t: "落着かない", r: false },
    { t: "ゆううつだ", r: false },
    { t: "何をするのも面倒だ", r: false },
    { t: "物事に集中できない", r: false },
    { t: "気分が晴れない", r: false },
    { t: "仕事が手につかない", r: false },
    { t: "悲しいと感じる", r: false },
    { t: "めまいがする", r: false },
    { t: "体のふしぶしが痛む", r: false },
    { t: "頭が重かったり頭が痛い", r: false },
    { t: "首筋や肩がこる", r: false },
    { t: "腰が痛い", r: false },
    { t: "目が疲れる", r: false },
    { t: "動悸や息切れがする", r: false },
    { t: "胃腸の具合が悪い", r: false },
    { t: "食欲がない", r: false },
    { t: "便秘や下痢をする", r: false },
    { t: "よく眠れない", r: false },
  ] satisfies QuestionItem[],
};

export const SECTION_C = {
  key: "C" as const,
  title: "C. あなたの周りの方々について",
  lead: "最もあてはまるものを選んでください。",
  options: ["非常に", "かなり", "多少", "全くない"],
  groups: [
    { label: "次の人たちはどのくらい気軽に話ができますか?", items: ["上司", "職場の同僚", "配偶者、家族、友人等"] },
    { label: "あなたが困った時、次の人たちはどのくらい頼りになりますか?", items: ["上司", "職場の同僚", "配偶者、家族、友人等"] },
    { label: "あなたの個人的な問題を相談したら、次の人たちはどのくらいきいてくれますか?", items: ["上司", "職場の同僚", "配偶者、家族、友人等"] },
  ],
};

export const SECTION_D = {
  key: "D" as const,
  title: "D. 満足度について",
  lead: "最もあてはまるものを選んでください。",
  options: ["満足", "まあ満足", "やや不満足", "不満足"],
  items: [
    { t: "仕事に満足だ", r: false },
    { t: "家庭生活に満足だ", r: false },
  ] satisfies QuestionItem[],
};

export type Answers = {
  A: (number | null)[];
  B: (number | null)[];
  C: (number | null)[];
  D: (number | null)[];
};

export function emptyAnswers(): Answers {
  return {
    A: Array(SECTION_A.items.length).fill(null),
    B: Array(SECTION_B.items.length).fill(null),
    C: Array(9).fill(null),
    D: Array(SECTION_D.items.length).fill(null),
  };
}

function scoreOf(raw: number, reverse: boolean) {
  return reverse ? 5 - raw : raw;
}

export type Scores = {
  A: number;
  B: number;
  C: number;
  D: number;
  AC: number;
  highStress: boolean;
};

export function calcScores(answers: Answers): Scores {
  const sumA = answers.A.reduce<number>(
    (s, v, i) => s + scoreOf(v as number, SECTION_A.items[i].r),
    0
  );
  const sumB = answers.B.reduce<number>(
    (s, v, i) => s + scoreOf(v as number, SECTION_B.items[i].r),
    0
  );
  const sumC = answers.C.reduce<number>((s, v) => s + (v as number), 0);
  const sumD = answers.D.reduce<number>((s, v) => s + (v as number), 0);
  const highStress = sumB >= 77 || (sumB >= 63 && sumA + sumC >= 76);
  return { A: sumA, B: sumB, C: sumC, D: sumD, AC: sumA + sumC, highStress };
}
