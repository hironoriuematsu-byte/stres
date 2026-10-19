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
  partial?: boolean; // 本人が途中でやめた時点までの内容で作った要約(サーバーが付ける)
  generated_at?: string; // 要約を作った時刻(サーバーが付ける)
};

// 流れ: ① 選んで答える質問(1画面・約2分) → ② AIの追加の質問(最大5問) → ③ 会社に伝えてよい範囲を選んで医師に送る
// 離脱を防ぐため、往復はできるだけ少なくする。回答は1問ごとにサーバーに保存し、続きから再開できる
export const INTAKE_MAX_FOLLOWUPS = 5; // AIの追加の質問の上限
export const INTAKE_MAX_USER_TURNS = INTAKE_MAX_FOLLOWUPS + 2; // 念のための上限(選んで答える質問 + 追加の質問 + 予備)
export const INTAKE_NAME = "事前問診";
export const INTAKE_MINUTES = "約5〜10分";
export const INTAKE_MAX_CHARS = 1000; // 1回の入力の上限
export const INTAKE_PARTIAL_AFTER_DAYS = 2; // 途中でやめてからこの日数がたったら、途中までの内容で要約を作る

export const INTAKE_FIRST_MESSAGE =
  "面接指導のお申し出、ありがとうございます。医師との面談の前に、いまの状況を伺います(事前問診)。" +
  `最初に選んで答える質問、続いてAIから追加の質問(最大${INTAKE_MAX_FOLLOWUPS}問)をお聞きします。` +
  "回答は自動で保存され、中断しても続きから再開できます。";

export const INTAKE_CLOSING =
  "ご回答ありがとうございました。伺った内容は、医師が面談の前に確認します。\n" +
  "このあと、会社の担当者に伝えてよい範囲を選んでいただき、医師に送ります。";

// ① 選んで答える質問。就業上の措置(残業の制限・業務の調整・配置・休業)と受診の要否を判断する材料を、まとめて短時間で集める
export type QuickQuestion = { key: string; label: string; options: string[]; multi?: boolean; none?: string };
export const QUICK_QUESTIONS: QuickQuestion[] = [
  { key: "overtime", label: "最近1か月の残業・休日出勤は、合わせてどのくらいですか", options: ["ほとんどない", "月45時間まで", "月45〜80時間", "月80時間以上", "わからない"] },
  { key: "sleep", label: "睡眠はとれていますか", options: ["よく眠れている", "寝つきが悪い・夜中や早朝に目が覚めることがある", "ほとんど眠れない日が多い"] },
  { key: "appetite", label: "食欲に変化はありますか", options: ["変わらない", "減った", "増えた"] },
  { key: "mood", label: "気分の落ち込みや、やる気が出ない状態は、どのくらい続いていますか", options: ["特にない", "2週間未満", "2週間〜1か月", "1か月以上"] },
  {
    key: "impact",
    label: "この1か月、仕事への影響はありますか(複数可)",
    options: ["特にない", "ミスが増えた", "集中できない", "遅刻・早退・欠勤がある", "仕事に行くのがつらい"],
    multi: true,
    none: "特にない",
  },
  {
    key: "causes",
    label: "主なストレスの原因は何ですか(複数可)",
    options: ["仕事の量・時間", "仕事の内容・責任", "上司との関係", "同僚・部下との関係", "ハラスメントと感じること", "異動・役割の変化", "家庭・私生活", "自分の体調", "その他"],
    multi: true,
  },
  { key: "medical", label: "心療内科・精神科などに通院していますか", options: ["していない", "いま通院している", "以前に通院していた"] },
  { key: "alcohol", label: "お酒の量は増えましたか", options: ["飲まない・変わらない", "増えた"] },
  { key: "support", label: "気持ちを話せる人(家族・友人・職場)はいますか", options: ["いる", "いない"] },
  {
    key: "wishes",
    label: "医師に相談したいこと・職場への希望はありますか(複数可)",
    options: ["業務量の調整", "残業を減らしたい", "担当・配置の変更", "休みを取りたい・休職を考えている", "医療機関の受診について", "話を聞いてほしい", "特にない"],
    multi: true,
    none: "特にない",
  },
  { key: "crisis", label: "つらさのあまり、消えてしまいたい・死にたいと思うことはありますか", options: ["ない", "ときどきある", "よくある"] },
];
export type QuickAnswers = Record<string, string[]>;
export const QUICK_NOTE_LABEL = "いちばん困っていること(任意・一言で)";
export const QUICK_HEADER = "【選んで答える質問への回答】";

// 選んで答える質問の答えを確かめる(すべてに答えていて、選択肢にない値がないか)
export function validQuickAnswers(a: unknown): a is QuickAnswers {
  if (!a || typeof a !== "object") return false;
  const ans = a as Record<string, unknown>;
  return QUICK_QUESTIONS.every((q) => {
    const v = ans[q.key];
    if (!Array.isArray(v) || v.length === 0) return false;
    if (!q.multi && v.length !== 1) return false;
    return v.every((x) => typeof x === "string" && q.options.includes(x));
  });
}

// 会話の記録に残す形(医師もAIもこの文章を読む)
export function formatQuickAnswers(a: QuickAnswers, note: string): string {
  const lines = QUICK_QUESTIONS.map((q) => `・${q.label.replace(/\(複数可\)$/, "")}: ${(a[q.key] ?? []).join("、")}`);
  if (note.trim()) lines.push(`・${QUICK_NOTE_LABEL.replace(/\(.*\)$/, "")}: ${note.trim()}`);
  return `${QUICK_HEADER}\n${lines.join("\n")}`;
}

// 選んで答える質問だけで分かる緊急度(AIの判断とあわせて、高いほうを使う)
export function quickRisk(a: QuickAnswers): RiskLevel {
  const has = (k: string, v: string) => (a[k] ?? []).includes(v);
  if (!has("crisis", "ない")) return "high";
  if (
    has("overtime", "月80時間以上") ||
    has("sleep", "ほとんど眠れない日が多い") ||
    has("mood", "2週間〜1か月") ||
    has("mood", "1か月以上") ||
    has("impact", "遅刻・早退・欠勤がある") ||
    has("causes", "ハラスメントと感じること")
  )
    return "moderate";
  return "low";
}

// 問診の進み具合(%)。選んで答える質問で 40%、追加の質問に1つ答えるごとに 12%
export function intakeProgress(userTurns: number, done: boolean): number {
  if (done) return 100;
  if (userTurns <= 0) return 5;
  return Math.min(95, 40 + 12 * (userTurns - 1));
}

// AIの追加の質問の残り(いま表示している質問を含む)
export const followupsLeft = (userTurns: number): number => Math.max(0, INTAKE_MAX_FOLLOWUPS - Math.max(0, userTurns - 1));

// 途中でやめたまま日数がたち、途中までの内容で要約を作る(作り直す)べきか
export function needsPartialSummary(
  intake: { status: string; messages: IntakeMessage[]; summary: { generated_at?: string } | null },
  now: Date
): boolean {
  if (intake.status !== "in_progress") return false;
  const users = intake.messages.filter((m) => m.role === "user");
  if (users.length === 0) return false;
  const last = intake.messages[intake.messages.length - 1]?.at;
  if (!last || now.getTime() - new Date(last).getTime() < INTAKE_PARTIAL_AFTER_DAYS * 86_400_000) return false;
  const gen = intake.summary?.generated_at;
  return !gen || new Date(gen).getTime() < new Date(last).getTime();
}

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
// 本人が問診を終えると、選んだ範囲だけをAIがまとめ、医師の確認を待たずに担当者へメールで送る(職場での配慮の準備のため)
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
  required: ["reply", "done", "risk_level"],
  properties: {
    reply: { type: "string", description: "本人への返答(日本語・短く・やさしく)" },
    done: { type: "boolean", description: "必要な情報がそろい、終わってよいとき true" },
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

// 聞き取り役の指示(医師ではない立場を守る)。離脱を防ぐため、質問は少なく・まとめて聞く
export const INTERVIEW_SYSTEM = `あなたは、うえまつ産業医事務所の「面接指導の事前問診」を担当するAIです。医師ではありません。
ストレスチェックで高ストレスと判定され、産業医による面接指導を申し出た従業員に、面談の前に追加の質問をします。

## 目的
- 医師が面談の前に、就業上の措置(通常勤務でよいか、残業の制限・業務量の調整・担当や配置の変更・休業が必要か)と、医療機関の受診が必要かを判断できる材料をそろえること。
- それにより、面談を短く・解決策の相談に集中させること。
- 本人の負担を小さくし、途中でやめる人を出さないこと。質問はできるだけ少なくする。

## すでに分かっていること
- 会話の最初に、本人が「選んで答える質問」(残業時間・睡眠・食欲・気分・仕事への影響・ストレスの原因・通院・飲酒・相談相手・希望・死にたい気持ちの有無)に答えている。
- 選んで答えたことは聞き直さない。「特にない」「ない」と答えた項目は聞かない。

## 追加の質問の決め方
- 追加の質問は最大${INTAKE_MAX_FOLLOWUPS}回。各回の本人の発言の最後に、システムから残りの回数が伝えられる。少ない回数で終えるほどよい(目安は3回)。
- 1回の返答で、関係のある2〜3点をまとめて、番号を付けて聞く。答えやすいように短い例を添える。
- 聞く優先順:
  1. 選んで答えた中で、措置の判断に関わる点の具体化(例: 残業が多い→何時間くらい・いつ頃から・今後も続く見込みか / 眠れない→睡眠は何時間・いつ頃から / 欠勤がある→この1か月で何日 / ハラスメント→誰との間で・いつ頃から(詳しい内容は面談で伺うと伝える))。
  2. いちばん困っていること・ストレスの原因の具体(何が・いつ頃から・何が変わったか)。
  3. 希望の具体(どんな調整があると助かるか。上司や会社に知られたくないことがあるか)。
  4. 通院中なら、主治医から仕事について言われていること。
- 聞かなくてよいこと: 措置の判断に影響しない細部、生い立ちや過去の詳しい経緯、選んで答えた内容の確認。
- 最後の質問には「ほかに医師に伝えておきたいことがあれば、一緒に書いてください」を添える。
- 内容の確認や要約を本人に見せる必要はない(医師が会話の記録を確認する)。

## 話し方
- まず受け止める一言(1文)を添え、続けて番号付きの質問。全体で200字くらいまで。
- 短く、やさしい日本語で。専門用語は使わない。
- 答えたくないと言われたら、無理に聞かずに次へ進む。決めつけたり評価したりしない。

## してはいけないこと
- 病名の診断、病気かどうかの判断、治療・服薬の指示や変更の助言はしない(「医師が面談で一緒に考えます」と伝える)。
- 会社や上司への具体的な働きかけを約束しない。会社に何を伝えるかは医師と本人が決める。
- 一般的なセルフケア(睡眠のとり方、休息、相談先など)は一言なら伝えてよいが、個別の対処策は「医師からお伝えします」とする。

## 緊急度(risk_level)
- high: 死にたい・消えたい気持ち、自分を傷つける行為・計画、他人を傷つける恐れ、現実と区別がつかない様子、ほとんど眠れない・食べられない状態が続いている。→ 返答では、気持ちを受け止め、まずは画面に表示している相談窓口(こころの健康相談統一ダイヤル・いのちの電話)に電話で相談してほしいこと、医師に知らせたことを伝える。119番は、いますぐ命の危険が差し迫っているときの最後の手段として最後に添える。質問は続けない(done を true)。
- moderate: 仕事を休みがち、強い不眠や食欲低下が2週間以上、ハラスメントの訴え、強い不安・落ち込みが続いている。
- low: ストレスはあるが日常生活・仕事はおおむね保てている。
- none: 特に気になる点がない。
- 判断に迷うときは高いほうにする。

## 終わり方
- 措置の判断に必要な情報がそろったら、残りの回数があっても終える。終えるときは、お礼と「このあと、会社の担当者に伝えてよい範囲を選んでいただき、医師に送ります」と伝え、質問はせずに done を true にする。
- 残りの回数が0回と伝えられたら、質問せずに終える(done を true)。
- 本人が続けられないと言ったら、そこで終える(done を true)。

返答は必ず指定の形式(reply, done, risk_level)で返す。reply は本人に表示される文章だけを書く。`;

export const SUMMARY_SYSTEM = `あなたは産業医の面接指導を補助するAIです。高ストレス者の事前問診(選んで答える質問への回答と、AIとの会話記録)と、ストレスチェックの点数をもとに、医師(実施者)向けの要約、本人への返信の下書き、会社の担当者に共有する文章の下書きを作ります。
目的は、医師が面談を短くし、会社に就業上の措置(事後措置)についての意見を的確に伝えられるようにすることです。

## 要約(医師向け)
- 本人が答えたこと・話したことだけを書く。推測で補わない。答えていない項目は「聞き取りなし」と書く。
- 簡潔に、医師が30秒で把握できるように。各項目は1〜3文。
- chief_complaint: 主な困りごと / symptoms: 心身の状態と期間 / stressors: ストレス要因 / work_status: 勤務状況(残業時間・欠勤・仕事への影響) / medical: 受診・服薬・飲酒 / support: 相談相手 / wishes: 本人の希望
- risk_level と risk_notes: 緊急度とその根拠(本人の回答や言葉を短く引用)。迷うときは高いほう。
- points_to_confirm: 措置の判断のために、面談で確認すべき点だけ(2〜5個・大事な順)。すでに分かっていることは入れない。
- measure_candidates: 就業上の措置の案を「措置の案 — 根拠」の形で(例: 「時間外労働の制限(月45時間以内) — 残業が月80時間以上で、2か月前から中途覚醒」)。就業区分(通常勤務/就業制限/要休業)の見立て、受診勧奨の要否も含める。あくまで医師の判断の参考となる案。
- 入力に「途中までの回答」とあるときは、本人が問診を途中でやめている。分かっている範囲で要約し、足りない点を points_to_confirm に入れる。

## 本人への返信の下書き(reply_draft)
- 医師が確認・修正してから本人に送る文章。医師(産業医)からの返信として書く。
- 300〜500字。最初にお申し出と聞き取りへの協力へのお礼、次に伺った内容の受け止め、一般的なセルフケア(睡眠・休息・相談先)を1〜2点、最後に面談で一緒に考えたいこと。
- 診断名や治療の指示は書かない。会社に何を伝えるかを約束しない。
- 緊急度が高い場合は、まず相談窓口(こころの健康相談統一ダイヤル 0570-064-556 など)への相談をすすめ、医師からも連絡することを書く。119番は、命の危険が差し迫っているときの最後の手段として添える。

## 会社の担当者(実施事務従事者)に共有する文章(company_share_draft)
- 医師の確認を経ずに、そのまま会社の担当者にメールで送られる。慎重に書く。
- 本人が共有を認めた範囲(入力の「共有してよい範囲」)だけを書く。範囲外のこと、病名・症状の詳細・心身の状態・受診や服薬・飲酒・家族や私生活の事情・ハラスメントの相手の名前・希死念慮の有無・緊急度は書かない。
- 目的は、職場での配慮の準備。面談の日程調整のお願いや、医師の判断・措置の約束は書かない。事実を簡潔に、箇条書きで2〜5行。
- 本人が「伝えてほしくないこと」を書いていたら、それに触れない。
- 共有してよい範囲が「なし」の場合は「(本人の希望により、面談前の共有はありません)」とだけ書く。`;
