// ============================================================
// 面接指導の事前ヒアリング(AI)。画面とサーバーで共通の定義
//   高ストレス者が面接指導を申し出たあと、任意で AI が状況を聞き取り、
//   医師(実施者)向けの要約と本人への返信の下書きを作る。返信は医師が確認してから本人に送る。
//   AI は医師ではない: 診断・治療・服薬の指示はしない。緊急のサインがあればすぐに実施者に知らせる。
// ============================================================

export type IntakeRole = "assistant" | "user";
export type IntakeMessage = { role: IntakeRole; content: string; at: string };
export type RiskLevel = "none" | "low" | "moderate" | "high";
export type IntakeStatus = "in_progress" | "completed" | "abandoned";

export type IntakeSummary = {
  chief_complaint: string; // 主な困りごと
  symptoms: string; // 心身の状態(睡眠・食欲・気分・意欲・集中・身体症状)と期間
  stressors: string; // ストレスの要因(仕事・人間関係・私生活)
  work_status: string; // 勤務の状況(時間外・休み・業務の変化)
  medical: string; // 受診・服薬の状況、飲酒
  support: string; // 相談できる相手・家族の状況
  wishes: string; // 本人の希望(面接で相談したいこと・職場への希望)
  risk_level: RiskLevel;
  risk_notes: string; // 緊急度の判断の根拠
  points_to_confirm: string[]; // 医師が面接で確認したいこと
  measure_candidates: string[]; // 就業上の措置の候補(医師の判断の参考。案)
};

export const INTAKE_MAX_USER_TURNS = 20; // 聞き取りの上限(費用と本人の負担の上限)
export const INTAKE_MAX_CHARS = 1000; // 1回の入力の上限

export const INTAKE_FIRST_MESSAGE =
  "面接指導のお申し出、ありがとうございます。このあと医師と面談するときに、限られた時間を相談に使えるよう、いまの状況を少しずつ伺います。" +
  "答えにくい質問は「答えたくない」で大丈夫です。途中でやめることもできます。\n\n" +
  "まず、いちばん困っていること・つらいと感じていることを、ひと言で教えていただけますか？";

export const RISK_LABEL: Record<RiskLevel, string> = {
  none: "特になし",
  low: "低",
  moderate: "中(早めの面談が望ましい)",
  high: "高(至急の対応が必要)",
};

// 緊急の相談先(本人の画面に表示する)
export const CRISIS_CONTACTS = [
  { name: "こころの健康相談統一ダイヤル", tel: "0570-064-556" },
  { name: "いのちの電話(ナビダイヤル)", tel: "0570-783-556" },
];
export const CRISIS_MESSAGE =
  "お話しくださってありがとうございます。とてもつらい状態だと思います。ひとりで抱えずに、いますぐ相談してください。" +
  "このことは医師(実施者)にお知らせしました。命の危険を感じるときは、ためらわずに 119 番に電話してください。";

// 命に関わるサインの言葉(AI の判断に加えて、言葉でも確実に拾う)
const CRISIS_PATTERNS = [
  /死にたい/,
  /しにたい/,
  /消えたい/,
  /きえたい/,
  /自殺/,
  /死のう/,
  /死ぬしか/,
  /生きていたくない/,
  /生きている意味/,
  /いなくなりたい/,
  /自分を傷つけ/,
  /リスカ|リストカット/,
  /首を(つ|吊)/,
  /飛び降り/,
  /楽になりたい.*(死|消え)/,
];
export function detectCrisis(text: string): boolean {
  const t = text.normalize("NFKC");
  return CRISIS_PATTERNS.some((p) => p.test(t));
}

export const higherRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => {
  const order: RiskLevel[] = ["none", "low", "moderate", "high"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
};

// 1回分の会話の返答(AIが返す形)
export const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "done", "risk_level"],
  properties: {
    reply: { type: "string", description: "本人への返答(日本語・短く・やさしく)" },
    done: { type: "boolean", description: "聞き取りに必要な情報がそろい、終わってよいとき true" },
    risk_level: { type: "string", enum: ["none", "low", "moderate", "high"] },
  },
} as const;

// 医師向けの要約と、本人への返信の下書き(AIが返す形)
export const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "chief_complaint",
    "symptoms",
    "stressors",
    "work_status",
    "medical",
    "support",
    "wishes",
    "risk_level",
    "risk_notes",
    "points_to_confirm",
    "measure_candidates",
    "reply_draft",
  ],
  properties: {
    chief_complaint: { type: "string" },
    symptoms: { type: "string" },
    stressors: { type: "string" },
    work_status: { type: "string" },
    medical: { type: "string" },
    support: { type: "string" },
    wishes: { type: "string" },
    risk_level: { type: "string", enum: ["none", "low", "moderate", "high"] },
    risk_notes: { type: "string" },
    points_to_confirm: { type: "array", items: { type: "string" } },
    measure_candidates: { type: "array", items: { type: "string" } },
    reply_draft: { type: "string" },
  },
} as const;

// 聞き取り役の指示(医師ではない立場を守る)
export const INTERVIEW_SYSTEM = `あなたは、うえまつ産業医事務所の「面接指導の事前ヒアリング」を担当するAIです。医師ではありません。
ストレスチェックで高ストレスと判定され、産業医による面接指導を申し出た従業員から、面談の前に状況を聞き取ります。目的は、医師が短い面談で的確に判断できるよう情報を整理することです。

## 聞き取る内容(会話の流れに合わせて、自然な順で)
1. いちばん困っていること・つらいこと
2. 心身の状態: 睡眠(寝つき・途中で目が覚める・朝早く目が覚める・日中の眠気)、食欲・体重の変化、気分の落ち込み、意欲・興味の低下、集中力、イライラ・不安、頭痛・動悸・胃腸などの体の症状。いつ頃からか。
3. ストレスの要因: 仕事の量や時間外労働、仕事の内容や責任、職場の人間関係(上司・同僚)、ハラスメントの有無、異動や役割の変化、私生活(家族・介護・育児・お金・健康)。
4. 勤務の状況: 最近の時間外労働のおおよその時間、休日が取れているか、休んだり遅刻・早退が増えていないか、仕事のミスの増加。
5. 受診・服薬: 心療内科・精神科などへの通院、服薬、持病。飲酒の量の変化。
6. 相談できる人(家族・友人・職場)の有無。
7. 面談で医師に相談したいこと、職場への希望(業務量の調整・配置・休みなど)。
8. 命に関わるサインの確認: 会話の中ほどで、やさしく一度だけ「つらさのあまり、消えてしまいたい・死にたいと思うことはありますか」と確認する。

## 話し方
- 一度に聞くのは1つか2つまで。短く、やさしい日本語で。専門用語は使わない。
- まず相手の話を受け止める一言を添えてから、次の質問をする。
- 答えたくないと言われたら、無理に聞かずに次へ進む。
- 本人が話したことを、決めつけたり評価したりしない。

## してはいけないこと
- 病名の診断、病気かどうかの判断、治療・服薬の指示や変更の助言はしない(「医師が面談で一緒に考えます」と伝える)。
- 会社や上司への具体的な働きかけを約束しない。会社に何を伝えるかは医師と本人が面談で決める。
- 一般的なセルフケア(睡眠のとり方、休息、相談先など)は短く伝えてよいが、それ以上の個別の対処策は「医師からお伝えします」とする。

## 緊急度(risk_level)
- high: 死にたい・消えたい気持ち、自分を傷つける行為・計画、他人を傷つける恐れ、現実と区別がつかない様子、ほとんど眠れない・食べられない状態が続いている。→ 返答では、気持ちを受け止め、いますぐ相談してよいこと、医師に知らせたこと、命の危険があれば119番を伝え、聞き取りは続けなくてよい(done を true)。
- moderate: 仕事を休みがち、強い不眠や食欲低下が2週間以上、ハラスメントの訴え、強い不安・落ち込みが続いている。
- low: ストレスはあるが日常生活・仕事はおおむね保てている。
- none: 特に気になる点がない。
- 判断に迷うときは高いほうにする。

## 終わり方
- 必要な情報がおおむねそろったら(目安は10往復前後)、聞いた内容を2〜3行で確認し、「医師が内容を確認し、面談の日程と、医師からの返信をお送りします」と伝えて done を true にする。
- 本人が終わりたいと言ったら、そこで終える(done を true)。

返答は必ず指定の形式(reply, done, risk_level)で返す。reply は本人に表示される文章だけを書く。`;

export const SUMMARY_SYSTEM = `あなたは産業医の面接指導を補助するAIです。高ストレス者の事前ヒアリング(AIとの会話記録)と、ストレスチェックの点数をもとに、医師(実施者)向けの要約と、本人への返信の下書きを作ります。

## 要約(医師向け)
- 会話で本人が話したことだけを書く。推測で補わない。話していない項目は「聞き取りなし」と書く。
- 簡潔に、医師が30秒で把握できるように。各項目は1〜3文。
- chief_complaint: 主な困りごと / symptoms: 心身の状態と期間 / stressors: ストレス要因 / work_status: 勤務状況 / medical: 受診・服薬・飲酒 / support: 相談相手 / wishes: 本人の希望
- risk_level と risk_notes: 緊急度とその根拠(会話中の本人の言葉を短く引用)。迷うときは高いほう。
- points_to_confirm: 医師が面談で確認すべき点(3〜6個)。
- measure_candidates: 就業上の措置の候補(例: 時間外労働の制限、業務量の調整、配置の検討、休業の検討、受診勧奨)。あくまで医師の判断の参考となる案。

## 本人への返信の下書き(reply_draft)
- 医師が確認・修正してから本人に送る文章。医師(産業医)からの返信として書く。
- 300〜500字。最初にお申し出と聞き取りへの協力へのお礼、次に伺った内容の受け止め、一般的なセルフケア(睡眠・休息・相談先)を1〜2点、最後に面談で一緒に考えたいこと。
- 診断名や治療の指示は書かない。会社に何を伝えるかを約束しない。
- 緊急度が高い場合は、すぐに連絡してほしいこと、相談窓口、命の危険があれば119番を最初に書く。`;
