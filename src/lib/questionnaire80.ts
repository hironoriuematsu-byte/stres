// ============================================================
// 職業性ストレス簡易調査票(80項目版)の追加23項目(設問58〜80)
//
// 出典:
// - 厚生労働省「職業性ストレス簡易調査票(80項目版)」
//   (現行57項目 + 新職業性ストレス簡易調査票 推奨尺度セット短縮版23項目)
// - 「現行および新職業性ストレス簡易調査票の得点計算」(2012/4/1公開、5/29修正)
// - 「現行および新職業性ストレス簡易調査票の尺度の全国平均データ」(2012/4/1公開)
//   および全国調査の1項目版性別尺度平均(表2)
//
// 採点の共通ルール(出典資料):
// - 各尺度得点は「項目合計 ÷ 項目数」で1〜4点に分布させる
// - どの尺度も「高得点が望ましい状態」を示すよう変換する
//   (資料で「４点３点２点１点」と配点される設問は 5 - 回答値 とする)
//
// 高ストレス者の判定は現行57項目部分で行うため、この追加分は
// 判定には影響しない(職場環境改善のための情報として用いる)。
// ============================================================

export type Ext80Item = {
  no: number; // 80項目版での設問番号
  t: string; // 設問文
  section: "E" | "F" | "G" | "H";
  // 資料の配点が「４点３点２点１点」の設問(=肯定文)は true。
  // 得点は 5 - 回答値 として「高いほど良好」に揃える。
  r: boolean;
};

export const SECTION_E = {
  key: "E" as const,
  title: "E. あなた自身のお仕事について、もう少し詳しくうかがいます",
  lead: "最もあてはまるものを選んでください。",
  options: ["そうだ", "まあそうだ", "ややちがう", "ちがう"],
};

export const SECTION_F = {
  key: "F" as const,
  title: "F. あなたが働いている職場についてうかがいます",
  lead: "最もあてはまるものを選んでください。",
  options: ["そうだ", "まあそうだ", "ややちがう", "ちがう"],
};

export const SECTION_G = {
  key: "G" as const,
  title: "G. あなたの働いている会社や組織についてうかがいます",
  lead: "最もあてはまるものを選んでください。",
  options: ["そうだ", "まあそうだ", "ややちがう", "ちがう"],
};

export const SECTION_H = {
  key: "H" as const,
  title: "H. あなたのお仕事の状況や成果についてうかがいます",
  lead: "最もあてはまるものを選んでください。",
  options: ["そうだ", "まあそうだ", "ややちがう", "ちがう"],
};

// 追加23項目(設問58〜80)。配列の並び順が回答の格納順(index 0 = 設問58)
export const EXT80_ITEMS: Ext80Item[] = [
  // E: あなた自身のお仕事について
  { no: 58, section: "E", t: "感情面で負担になる仕事だ", r: false },
  { no: 59, section: "E", t: "複数の人からお互いに矛盾したことを要求される", r: false },
  { no: 60, section: "E", t: "自分の職務や責任が何であるか分かっている", r: true },
  { no: 61, section: "E", t: "仕事で自分の長所をのばす機会がある", r: true },
  // F: 働いている職場について
  { no: 62, section: "F", t: "自分の仕事に見合う給料やボーナスをもらっている", r: true },
  { no: 63, section: "F", t: "私は上司からふさわしい評価を受けている", r: true },
  { no: 64, section: "F", t: "職を失う恐れがある", r: false },
  { no: 65, section: "F", t: "上司は、部下が能力を伸ばす機会を持てるように、取り計らってくれる", r: true },
  { no: 66, section: "F", t: "上司は誠実な態度で対応してくれる", r: true },
  { no: 67, section: "F", t: "努力して仕事をすれば、ほめてもらえる", r: true },
  { no: 68, section: "F", t: "失敗しても挽回(ばんかい)するチャンスがある職場だ", r: true },
  // G: 会社や組織について
  { no: 69, section: "G", t: "経営層からの情報は信頼できる", r: true },
  { no: 70, section: "G", t: "職場や仕事で変化があるときには、従業員の意見が聞かれている", r: true },
  { no: 71, section: "G", t: "一人ひとりの価値観を大事にしてくれる職場だ", r: true },
  { no: 72, section: "G", t: "人事評価の結果について十分な説明がなされている", r: true },
  {
    no: 73,
    section: "G",
    t: "職場では、(正規、非正規、アルバイトなど)いろいろな立場の人が職場の一員として尊重されている",
    r: true,
  },
  { no: 74, section: "G", t: "意欲を引き出したり、キャリアに役立つ教育が行われている", r: true },
  { no: 75, section: "G", t: "仕事のことを考えているため自分の生活を充実させられない", r: false },
  { no: 76, section: "G", t: "仕事でエネルギーをもらうことで、自分の生活がさらに充実している", r: true },
  // H: 仕事の状況や成果について
  { no: 77, section: "H", t: "職場で自分がいじめにあっている(セクハラ、パワハラを含む)", r: false },
  { no: 78, section: "H", t: "私たちの職場では、お互いに理解し認め合っている", r: true },
  { no: 79, section: "H", t: "仕事をしていると、活力がみなぎるように感じる", r: true },
  { no: 80, section: "H", t: "自分の仕事に誇りを感じる", r: true },
];

export const EXT80_COUNT = EXT80_ITEMS.length; // 23

export const sectionItems = (key: "E" | "F" | "G" | "H") =>
  EXT80_ITEMS.map((it, i) => ({ ...it, index: i })).filter((it) => it.section === key);

// 追加尺度(短縮版)。norm は全国平均(表2の1項目版)。高得点ほど良好。
export type Ext80Scale = {
  key: string;
  label: string;
  group: "burden" | "task" | "dept" | "org" | "outcome";
  items: number[]; // EXT80_ITEMS 内のindex
  norm: { male: number; female: number; all: number };
};

export const EXT80_GROUP_LABEL = {
  burden: "仕事の負担(追加分)",
  task: "仕事の資源(作業レベル)",
  dept: "仕事の資源(部署レベル)",
  org: "仕事の資源(事業場レベル)",
  outcome: "いきいきアウトカム・ハラスメント",
} as const;

const idx = (no: number) => EXT80_ITEMS.findIndex((it) => it.no === no);

export const EXT80_SCALES: Ext80Scale[] = [
  // 仕事の負担(追加分)
  { key: "emotional", label: "情緒的負担", group: "burden", items: [idx(58)], norm: { male: 2.65, female: 2.66, all: 2.66 } },
  { key: "roleConflict", label: "役割葛藤", group: "burden", items: [idx(59)], norm: { male: 2.73, female: 3.01, all: 2.87 } },
  { key: "wsbNeg", label: "ワーク・セルフ・バランス(ネガティブ)", group: "burden", items: [idx(75)], norm: { male: 2.76, female: 2.92, all: 2.83 } },
  // 仕事の資源(作業レベル)
  { key: "roleClarity", label: "役割明確さ", group: "task", items: [idx(60)], norm: { male: 3.38, female: 3.44, all: 3.41 } },
  { key: "growth", label: "成長の機会", group: "task", items: [idx(61)], norm: { male: 2.6, female: 2.64, all: 2.62 } },
  // 仕事の資源(部署レベル)
  { key: "payReward", label: "経済・地位報酬", group: "dept", items: [idx(62)], norm: { male: 2.2, female: 2.31, all: 2.25 } },
  { key: "esteemReward", label: "尊重報酬", group: "dept", items: [idx(63)], norm: { male: 2.52, female: 2.67, all: 2.59 } },
  { key: "jobSecurity", label: "安定報酬", group: "dept", items: [idx(64)], norm: { male: 2.83, female: 2.85, all: 2.84 } },
  { key: "leadership", label: "上司のリーダーシップ", group: "dept", items: [idx(65)], norm: { male: 2.31, female: 2.19, all: 2.25 } },
  { key: "bossFair", label: "上司の公正な態度", group: "dept", items: [idx(66)], norm: { male: 2.61, female: 2.69, all: 2.65 } },
  { key: "praise", label: "ほめてもらえる職場", group: "dept", items: [idx(67)], norm: { male: 2.55, female: 2.62, all: 2.59 } },
  { key: "failureOk", label: "失敗を認める職場", group: "dept", items: [idx(68)], norm: { male: 2.46, female: 2.44, all: 2.45 } },
  // 仕事の資源(事業場レベル)
  { key: "mgmtTrust", label: "経営層との信頼関係", group: "org", items: [idx(69)], norm: { male: 2.53, female: 2.63, all: 2.58 } },
  { key: "changeMgmt", label: "変化への対応", group: "org", items: [idx(70)], norm: { male: 2.33, female: 2.37, all: 2.35 } },
  { key: "respect", label: "個人の尊重", group: "org", items: [idx(71)], norm: { male: 2.1, female: 2.19, all: 2.14 } },
  { key: "fairEval", label: "公正な人事評価", group: "org", items: [idx(72)], norm: { male: 2.03, female: 2.05, all: 2.04 } },
  { key: "diversity", label: "多様な労働者への対応", group: "org", items: [idx(73)], norm: { male: 2.64, female: 2.81, all: 2.72 } },
  { key: "career", label: "キャリア形成", group: "org", items: [idx(74)], norm: { male: 2.18, female: 2.28, all: 2.23 } },
  { key: "wsbPos", label: "ワーク・セルフ・バランス(ポジティブ)", group: "org", items: [idx(76)], norm: { male: 1.98, female: 2.18, all: 2.07 } },
  // いきいきアウトカム・ハラスメント
  { key: "harassment", label: "職場のハラスメント", group: "outcome", items: [idx(77)], norm: { male: 3.69, female: 3.72, all: 3.7 } },
  { key: "cohesion", label: "職場の一体感", group: "outcome", items: [idx(78)], norm: { male: 2.58, female: 2.75, all: 2.66 } },
  { key: "engagement", label: "ワーク・エンゲイジメント", group: "outcome", items: [idx(79), idx(80)], norm: { male: 2.45, female: 2.58, all: 2.52 } },
];

// 回答値(1〜4)を「高いほど良好」な得点に変換する
export function itemScore(raw: number, reverse: boolean): number {
  return reverse ? 5 - raw : raw;
}

export type Ext80Answers = (number | null)[]; // 長さ23

export function emptyExt80(): Ext80Answers {
  return Array(EXT80_COUNT).fill(null);
}

export function isExt80Complete(a: unknown): a is number[] {
  return Array.isArray(a) && a.length === EXT80_COUNT && a.every((v) => typeof v === "number" && v >= 1 && v <= 4);
}

export type Ext80ScaleResult = {
  key: string;
  label: string;
  group: Ext80Scale["group"];
  score: number; // 1〜4(高いほど良好)
  norm: number; // 比較する全国平均
  diff: number; // 全国平均との差
};

// 追加尺度の得点を算出する(高得点=良好、1〜4点)
export function computeExt80(
  answers: Ext80Answers,
  gender: "male" | "female" | null
): Ext80ScaleResult[] {
  return EXT80_SCALES.map((s) => {
    const vals = s.items.map((i) => {
      const raw = answers[i];
      return raw == null ? null : itemScore(raw, EXT80_ITEMS[i].r);
    });
    const ok = vals.filter((v): v is number => v != null);
    const score = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0;
    const norm = gender === "male" ? s.norm.male : gender === "female" ? s.norm.female : s.norm.all;
    return {
      key: s.key,
      label: s.label,
      group: s.group,
      score: Math.round(score * 100) / 100,
      norm,
      diff: Math.round((score - norm) * 100) / 100,
    };
  });
}
