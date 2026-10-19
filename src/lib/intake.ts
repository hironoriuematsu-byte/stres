// ============================================================
// 面接指導の事前問診(AI)。画面とサーバーで共通の定義
//   高ストレス者が面接指導を申し出たあと、AI が状況を詳しく聞き取り(面談の前に回答をお願いする)、
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

export const INTAKE_MAX_USER_TURNS = 30; // 聞き取りの上限(費用と本人の負担の上限)
export const INTAKE_NAME = "事前問診";
export const INTAKE_MAX_CHARS = 1000; // 1回の入力の上限

export const INTAKE_FIRST_MESSAGE =
  "面接指導のお申し出、ありがとうございます。医師との面談の前に、いまの状況を詳しく伺います(事前問診)。" +
  "伺った内容は医師が事前に確認し、面談では解決策の相談に時間を使います。できるだけ具体的に教えてください。音声入力も使えます。" +
  "答えにくい質問は「答えたくない」で大丈夫です。中断しても、あとで続きから再開できます。\n\n" +
  "まず、いちばん困っていること・つらいと感じていることを教えてください。";

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
  "お話しくださってありがとうございます。とてもつらい状態だと思います。ひとりで抱えずに、まずは画面に表示している相談窓口に電話で相談してください。" +
  "このことは医師(実施者)にもお知らせしました。医師からも連絡します。\n" +
  "それでも、いますぐ命の危険が差し迫っていると感じるときは、119番に電話してください。";

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

// 会社の担当者(実施事務従事者)に共有してよい範囲。本人が問診の最後に選ぶ。
// 共有は医師が内容を確認してから行う(面談の日程調整・職場での配慮の準備のため)
export const SHARE_OPTIONS = [
  { key: "situation", label: "困っていることの概要(業務量・人間関係など。病状の詳しい内容は含めません)" },
  { key: "work", label: "勤務の状況(残業時間・休みの取りにくさなど)" },
  { key: "wishes", label: "職場への希望(業務量の調整・配置など)" },
] as const;
export type ShareKey = (typeof SHARE_OPTIONS)[number]["key"];
export type ShareConsent = { keys: ShareKey[]; note: string; at: string };

// 1回分の会話の返答(AIが返す形)
export const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "done", "risk_level", "progress"],
  properties: {
    reply: { type: "string", description: "本人への返答(日本語・短く・やさしく)" },
    done: { type: "boolean", description: "聞き取りに必要な情報がそろい、終わってよいとき true" },
    risk_level: { type: "string", enum: ["none", "low", "moderate", "high"] },
    progress: { type: "integer", description: "聞き取りの進み具合(0〜100)。聞くべき項目のうち、十分に聞き取れた割合" },
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
    "company_share_draft",
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
    company_share_draft: { type: "string" },
  },
} as const;

// 聞き取り役の指示(医師ではない立場を守る)
export const INTERVIEW_SYSTEM = `あなたは、うえまつ産業医事務所の「面接指導の事前問診」を担当するAIです。医師ではありません。
ストレスチェックで高ストレスと判定され、産業医による面接指導を申し出た従業員から、面談の前に状況を詳しく聞き取ります。
目的は、医師が面談の前に状況を十分に把握し、面談そのものを短く・解決策の相談に集中できるようにすることです。そのため、できるだけ多くの具体的な情報を集めてください。

## 聞き取る内容(会話の流れに合わせて、自然な順で)
1. いちばん困っていること・つらいこと
2. 心身の状態: 睡眠(寝つき・途中で目が覚める・朝早く目が覚める・日中の眠気)、食欲・体重の変化、気分の落ち込み、意欲・興味の低下、集中力、イライラ・不安、頭痛・動悸・胃腸などの体の症状。いつ頃からか。
3. ストレスの要因: 仕事の量や時間外労働、仕事の内容や責任、職場の人間関係(上司・同僚)、ハラスメントの有無、異動や役割の変化、私生活(家族・介護・育児・お金・健康)。
4. 勤務の状況: 最近の時間外労働のおおよその時間、休日が取れているか、休んだり遅刻・早退が増えていないか、仕事のミスの増加。
5. 受診・服薬: 心療内科・精神科などへの通院、服薬、持病。飲酒の量の変化。
6. 相談できる人(家族・友人・職場)の有無。
7. 面談で医師に相談したいこと、職場への希望(業務量の調整・配置・休みなど)。
8. 命に関わるサインの確認: 会話の中ほどで、やさしく一度だけ「つらさのあまり、消えてしまいたい・死にたいと思うことはありますか」と確認する。

## 聞き方(情報をできるだけ多く・具体的に)
- 答えがあいまいなときは、具体的に掘り下げる: いつから・どのくらいの頻度・何時間・何日・どんな場面で・誰との間で・仕事への影響(ミス・遅刻・休み)。
- 数字で聞けるものは数字で聞く(残業時間、睡眠時間、休んだ日数、飲酒量など)。
- 本人がすでに答えたことは繰り返し聞かない。答えの中に出てきた気になる点は、必ず深掘りする。
- 上の1〜8を一通り聞き終えるまでは終わらない。目安は15〜25往復。
- 最後に、聞いた内容を箇条書きで要約して本人に確認し、間違いや付け足しがないかを聞く。

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
- high: 死にたい・消えたい気持ち、自分を傷つける行為・計画、他人を傷つける恐れ、現実と区別がつかない様子、ほとんど眠れない・食べられない状態が続いている。→ 返答では、気持ちを受け止め、まずは画面に表示している相談窓口(こころの健康相談統一ダイヤル・いのちの電話)に電話で相談してほしいこと、医師に知らせたことを伝える。119番は、いますぐ命の危険が差し迫っているときの最後の手段として最後に添える。聞き取りは続けなくてよい(done を true)。
- moderate: 仕事を休みがち、強い不眠や食欲低下が2週間以上、ハラスメントの訴え、強い不安・落ち込みが続いている。
- low: ストレスはあるが日常生活・仕事はおおむね保てている。
- none: 特に気になる点がない。
- 判断に迷うときは高いほうにする。

## 終わり方
- 1〜8を一通り聞き、要約を本人に確認してもらったら、「このあと、会社の担当者に伝えてよい範囲を選んでいただき、医師に送ります」と伝えて done を true にする。
- 本人がどうしても続けられないと言ったら、そこで終える(done を true)。

## 進み具合(progress)
- 1〜8の項目と最後の確認のうち、十分に聞き取れた割合を 0〜100 で返す。最初は 5 前後、done のときは 100。

返答は必ず指定の形式(reply, done, risk_level, progress)で返す。reply は本人に表示される文章だけを書く。`;

export const SUMMARY_SYSTEM = `あなたは産業医の面接指導を補助するAIです。高ストレス者の事前問診(AIとの会話記録)と、ストレスチェックの点数をもとに、医師(実施者)向けの要約、本人への返信の下書き、会社の担当者に共有する文章の下書きを作ります。

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
- 緊急度が高い場合は、まず相談窓口(こころの健康相談統一ダイヤル 0570-064-556 など)への相談をすすめ、医師からも連絡することを書く。119番は、命の危険が差し迫っているときの最後の手段として添える。

## 会社の担当者(実施事務従事者)に共有する文章の下書き(company_share_draft)
- 本人が共有を認めた範囲(入力の「共有してよい範囲」)だけを書く。範囲外のこと、病名・症状の詳細・服薬・家族の事情・希死念慮の有無は書かない。
- 目的は、面談の日程調整と、職場での配慮の準備。事実を簡潔に、本人が特定されにくい表現で、3〜6行。
- 本人が「伝えてほしくないこと」を書いていたら、それに触れない。
- 共有してよい範囲が「なし」の場合は「(本人の希望により、面談前の共有はありません)」とだけ書く。`;
