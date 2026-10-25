// ============================================================
// 面接指導の事前問診(AI)。画面とサーバーで共通の定義
//   高ストレス者が面接指導を申し出たあと、AI が状況をできるだけ詳しく聞き取り(面談の前に回答をお願いする)、
//   医師(実施者)向けの要約・面接指導結果報告書と意見書の下書き・本人への返信の下書きを作る。
//   目的: 医師が面談の前に十分な情報を持ち、面談では確認と相談に集中し、正確な意見書を出せるようにする。
//   返信は医師が確認してから本人に送る。
//   AI は医師ではない: 診断・治療・服薬の指示はしない。緊急のサインがあればすぐに実施者に知らせる。
// ============================================================

import { IMPLEMENTER } from "@/lib/org";

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
  opinion?: IntakeOpinion; // 面接指導結果報告書・事後措置に係る意見書の下書き(AI案。医師が判断・修正する)
  partial?: boolean; // 本人が途中でやめた時点までの内容で作った要約(サーバーが付ける)
  generated_at?: string; // 要約を作った時刻(サーバーが付ける)
};

// 面接指導結果報告書・事後措置に係る意見書(厚生労働省の様式例)の項目に沿った下書き
export const GUIDANCE_OPTIONS = ["措置不要", "要保健指導", "要経過観察", "要再面接", "現病治療継続", "要医療機関紹介"] as const;
export const WORK_CATEGORY_OPTIONS = ["通常勤務", "就業制限・配慮", "要休業"] as const;
export type IntakeOpinion = {
  work_condition: string; // 勤務の状況(労働時間、労働時間以外の要因)
  fatigue: string; // 疲労の蓄積の状況
  psych_burden: string; // 心理的な負担の状況
  other_health: string; // その他の心身の状況
  guidance: (typeof GUIDANCE_OPTIONS)[number]; // 本人への指導区分(案)
  work_category: (typeof WORK_CATEGORY_OPTIONS)[number]; // 就業区分(案)
  measures: string[]; // 就業上の措置の内容(案)
  measure_period: string; // 措置期間(案)
  environment: string; // 職場環境の改善に関する意見(案)
  medical_care: string; // 医療機関への受診の配慮等(案)
  basis: string; // 判断の根拠と、面談で確かめるべきこと
};

// 流れ: ① 選んで答える質問(1画面・約3分) → ② AIの聞き取り(意見書に必要な項目を一通り・1〜2点ずつ深掘り)
//       → ③ 会社に伝えてよい範囲を選んで医師に送る
// 長くなるため、回答は1問ごとにサーバーに保存し、続きから再開できる。途中でやめても途中までの内容で要約を作る
export const INTAKE_MAX_FOLLOWUPS = 25; // AIの質問の上限(費用と本人の負担の上限)
export const INTAKE_MAX_USER_TURNS = INTAKE_MAX_FOLLOWUPS + 2; // 念のための上限(選んで答える質問 + 追加の質問 + 予備)
export const INTAKE_NAME = "事前問診";
export const INTAKE_MINUTES = "約15〜20分";
export const INTAKE_MAX_CHARS = 1000; // 1回の入力の上限
export const INTAKE_PARTIAL_AFTER_DAYS = 2; // 途中でやめてからこの日数がたったら、途中までの内容で要約を作る

export const INTAKE_FIRST_MESSAGE =
  "面接指導のお申し出、ありがとうございます。医師との面談の前に、いまの状況をできるだけ詳しく伺います(事前問診)。" +
  "伺った内容は医師が事前に確認し、面談では確認と解決策の相談に時間を使います。" +
  "回答は自動で保存され、中断しても続きから再開できます。答えにくい質問は「答えたくない」で大丈夫です。";

export const INTAKE_CLOSING =
  "ご回答ありがとうございました。伺った内容は、医師が面談の前に確認します。\n" +
  "このあと、会社の担当者に伝えてよい範囲を選んでいただき、医師に送ります。";

// ① 選んで答える質問。全体像(勤務・心身・要因・受診・希望・危険のサイン)をまとめて短時間で集め、AIの聞き取りの出発点にする
export type QuickQuestion = { key: string; label: string; options: string[]; multi?: boolean; none?: string };
export const QUICK_QUESTIONS: QuickQuestion[] = [
  { key: "overtime", label: "最近3か月の残業・休日出勤は、合わせて月にどのくらいですか", options: ["ほとんどない", "月45時間まで", "月45〜80時間", "月80時間以上", "わからない"] },
  { key: "holidays", label: "休日はとれていますか", options: ["週に2日ほどとれている", "週に1日ほど", "月に数日しかとれない"] },
  { key: "night", label: "深夜(22時〜5時)の勤務や交替勤務はありますか", options: ["ない", "ときどきある", "定期的にある"] },
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

// AIが聞き取る項目(面接指導結果報告書・意見書の項目に沿う)。AIは毎回、聞き終えた項目を返し、進み具合の計算に使う
export const INTAKE_TOPICS = [
  { key: "chief", label: "いちばん困っていること(内容・いつから・きっかけ)" },
  { key: "work_hours", label: "労働時間(直近3か月の時間外・休日出勤・持ち帰り・深夜業・交替勤務・出張)" },
  { key: "work_content", label: "仕事の内容・量・責任・裁量と、最近の変化(異動・昇進・繁忙・担当の増加)" },
  { key: "relations", label: "職場の人間関係(上司・同僚)とハラスメントの有無、職場の支援" },
  { key: "sleep_fatigue", label: "睡眠(時間・寝つき・中途覚醒・早朝覚醒)と疲労の蓄積(休日の回復)" },
  { key: "mental", label: "気分・意欲・興味・不安・イライラ・集中力・自分を責める気持ち(程度と期間)" },
  { key: "physical", label: "体の症状(頭痛・動悸・胃腸・食欲・体重の変化)" },
  { key: "function", label: "仕事と生活への影響(ミス・能率・遅刻・欠勤・家事や趣味)" },
  { key: "private", label: "仕事以外のストレス(家族・介護・育児・経済・健康)" },
  { key: "medical", label: "通院・服薬・持病・過去のメンタルヘルス不調と、主治医から言われていること" },
  { key: "lifestyle", label: "飲酒(量・頻度・寝酒)・喫煙・運動などの生活習慣" },
  { key: "coping", label: "相談できる人と、自分なりの対処法" },
  { key: "wishes", label: "本人の希望(業務の調整・配置・休業・受診)と、会社に知られたくないこと" },
  { key: "risk", label: "死にたい・消えたい気持ちがある場合は、その頻度・強さ・いつから・具体的な方法を考えたか・準備や過去の行為・思いとどまらせているもの(ない場合は、選んで答えた内容で聞き終えたとしてよい)" },
] as const;
export type TopicKey = (typeof INTAKE_TOPICS)[number]["key"];
const TOPIC_KEYS = new Set<string>(INTAKE_TOPICS.map((t) => t.key));
export const validTopics = (keys: unknown): TopicKey[] =>
  Array.isArray(keys) ? [...new Set(keys.filter((k): k is TopicKey => typeof k === "string" && TOPIC_KEYS.has(k)))] : [];

// 問診の進み具合(%)。選んで答える質問で 15%、残りは聞き終えた項目の割合。終わるまで100にしない
export function intakeProgress(userTurns: number, done: boolean, coveredCount?: number): number {
  if (done) return 100;
  if (userTurns <= 0) return 5;
  if (coveredCount === undefined) return Math.min(95, 15 + 4 * (userTurns - 1)); // 項目が分からないとき(デモ)
  return Math.min(95, 15 + Math.round((80 * coveredCount) / INTAKE_TOPICS.length));
}

// AIの質問の残り(上限まで)
export const followupsLeft = (userTurns: number): number => Math.max(0, INTAKE_MAX_FOLLOWUPS - Math.max(0, userTurns - 1));

// AIの返答を受けて、この回の返答と終わるかどうかを決める。いつ終えるかはAIが判断し(全項目を聞き終えたら)、
// 上限の回数を超えたら、AIの返答にかかわらず終える
export type TurnResult = { reply: string; done: boolean; risk_level: RiskLevel; covered?: TopicKey[] };
export async function decideTurn(userTurns: number, ask: () => Promise<TurnResult>): Promise<TurnResult> {
  const t = await ask();
  if (!t.done && (followupsLeft(userTurns) <= 0 || userTurns >= INTAKE_MAX_USER_TURNS)) return { ...t, reply: INTAKE_CLOSING, done: true };
  return { ...t, reply: t.reply || INTAKE_CLOSING };
}

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

// 本人への返信の宛名と署名。AIには本人の氏名を送らず、「{{名字}}」と書かせてから、保存の前に名字に置き換える
export const DOCTOR_SURNAME = IMPLEMENTER.name.split(/[\s\u3000]+/)[0]; // 上松
export const SURNAME_MARK = "{{名字}}";

// 氏名から名字を取り出す(空白で区切られていなければ氏名全体)。未登録なら空
export function surnameOf(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n || n === "未設定") return "";
  return n.split(/[\s\u3000]+/)[0];
}

// 返信の下書きから、119番・救急車に触れた文を取り除く(本人への返信では公的な相談窓口だけを案内する)
export function removeEmergencyCall(text: string): string {
  return text.replace(/[^。\n]*(119|救急車)[^。\n]*。?/g, "").replace(/\n{3,}/g, "\n\n");
}

// 返信の下書きの宛名・署名を埋める。伏せ字(〇〇)が残っていても、名字・「上松」に置き換えるか取り除く
export function fillReplyNames(text: string, surname: string): string {
  const mark = /\{\{\s*名字\s*\}\}|[〇○◯]{1,3}/;
  let t = text.replace(new RegExp(`(産業医|医師)(の)?\\s*(${mark.source})(\\s*(先生|医師))?`, "g"), `$1の${DOCTOR_SURNAME}`);
  t = surname
    ? t.replace(new RegExp(`(${mark.source})\\s*(さん|様)`, "g"), `${surname}$2`)
    : t.replace(new RegExp(`(${mark.source})\\s*(さん|様)[、,]?\\s*`, "g"), "");
  return t.replace(new RegExp(mark.source, "g"), "");
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

// サインがあったのにAIが応答できなかったときの返答(相談先を示し、落ち着いて1つ確かめる)
export const CRISIS_FOLLOWUP =
  "話してくださって、ありがとうございます。とてもつらい状態だと思います。画面に表示している相談窓口には、いつでも電話で相談できます。このことは医師(実施者)にもお知らせしました。\n" +
  "差し支えなければ、もう少し伺います。そう思うのは、どのくらいの頻度ですか？ いつ頃からですか？";

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
// 本人が問診を終えると、選んだ範囲だけをAIがまとめ、医師の確認を待たずに担当者に共有する(メールは届いたことの知らせだけ。職場での配慮の準備のため)
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
  required: ["reply", "done", "risk_level", "covered"],
  properties: {
    reply: { type: "string", description: "本人への返答(日本語・やさしく)" },
    done: { type: "boolean", description: "聞き取る項目を一通り聞き終え、終わってよいとき true" },
    risk_level: { type: "string", enum: ["none", "low", "moderate", "high"] },
    covered: {
      type: "array",
      description: "これまでの会話(選んで答えた内容を含む)で、十分に聞き取れた項目",
      items: { type: "string", enum: INTAKE_TOPICS.map((t) => t.key) },
    },
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
    "opinion",
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
    opinion: {
      type: "object",
      additionalProperties: false,
      required: ["work_condition", "fatigue", "psych_burden", "other_health", "guidance", "work_category", "measures", "measure_period", "environment", "medical_care", "basis"],
      properties: {
        work_condition: { type: "string" },
        fatigue: { type: "string" },
        psych_burden: { type: "string" },
        other_health: { type: "string" },
        guidance: { type: "string", enum: [...GUIDANCE_OPTIONS] },
        work_category: { type: "string", enum: [...WORK_CATEGORY_OPTIONS] },
        measures: { type: "array", items: { type: "string" } },
        measure_period: { type: "string" },
        environment: { type: "string" },
        medical_care: { type: "string" },
        basis: { type: "string" },
      },
    },
    reply_draft: { type: "string" },
    company_share_draft: { type: "string" },
  },
} as const;

// 聞き取り役の指示(医師ではない立場を守る)。意見書を正確に書けるよう、項目を一通り・具体的に聞く
export const INTERVIEW_SYSTEM = `あなたは、うえまつ産業医事務所の「面接指導の事前問診」を担当するAIです。医師ではありません。
ストレスチェックで高ストレスと判定され、産業医による面接指導を申し出た従業員から、面談の前に状況をできるだけ詳しく聞き取ります。

## 目的
- 医師が面談の前に十分な情報を持ち、面談では確認と解決策の相談に集中できるようにすること。
- 医師が「面接指導結果報告書・事後措置に係る意見書」(勤務の状況、疲労の蓄積、心理的な負担、その他の心身の状況、指導区分、就業区分、就業上の措置、職場環境の改善、受診の配慮)を正確に書けるだけの、具体的な情報を集めること。

## すでに分かっていること
- 会話の最初に、本人が「選んで答える質問」(残業時間・休日・深夜勤務・睡眠・食欲・気分・仕事への影響・ストレスの原因・通院・飲酒・相談相手・希望・死にたい気持ちの有無)に答えている。
- 選んで答えたことは、そのまま聞き直さない。そこを出発点に、具体的に掘り下げる。

## 聞き取る項目(すべて聞く。会話の流れに合わせて自然な順で)
${INTAKE_TOPICS.map((t) => `- ${t.key}: ${t.label}`).join("\n")}

## 聞き方(具体的に・数字で)
- 一度に聞くのは1つか2つまで。前の答えを受けて、次の質問を決める。
- あいまいな答えは掘り下げる: いつから・どのくらいの頻度・何時間・何日・どんな場面で・誰との間で・仕事への影響は。
- 数字で聞けるものは数字で聞く: 時間外労働の時間(月ごと)、睡眠時間、休んだ日数、飲酒量(種類と量・頻度)、体重の変化など。
- 措置の判断に関わる点は特に具体的に: 長時間労働の原因と今後の見通し、業務の調整の余地、深夜業・交替勤務の頻度、仕事を続けられる状態か、受診の必要性につながる症状の程度と期間。
- 本人の言葉の中に気になる点があれば、必ず確かめる。すでに答えたことは繰り返し聞かない。
- 項目を一通り聞き終えたら、最後に「ほかに医師に伝えておきたいことはありますか」と聞く。
- 目安は15〜25往復。項目を聞き終えるまでは終えない。

## 話し方
- まず相手の話を受け止める一言を添えてから、次の質問をする。短く、やさしい日本語で。専門用語は使わない。
- 答えたくないと言われたら、無理に聞かずに次の項目へ進む。決めつけたり評価したりしない。
- 本人が疲れている様子なら、「途中で休んでも、続きから再開できます」と伝える。

## してはいけないこと
- 病名の診断、病気かどうかの判断、治療・服薬の指示や変更の助言はしない(「医師が面談で一緒に考えます」と伝える)。
- 会社や上司への具体的な働きかけを約束しない。会社に何を伝えるかは医師と本人が決める。
- 一般的なセルフケア(睡眠のとり方、休息、相談先など)は一言なら伝えてよいが、個別の対処策は「医師からお伝えします」とする。

## 緊急度(risk_level)
- high: 死にたい・消えたい気持ち、自分を傷つける行為・計画、他人を傷つける恐れ、現実と区別がつかない様子、ほとんど眠れない・食べられない状態が続いている。
- moderate: 仕事を休みがち、強い不眠や食欲低下が2週間以上、ハラスメントの訴え、強い不安・落ち込みが続いている。
- low: ストレスはあるが日常生活・仕事はおおむね保てている。
- none: 特に気になる点がない。
- 判断に迷うときは高いほうにする。

## 死にたい・消えたい気持ちのサインがあるとき(risk_level は high)
- サインがあっても、聞き取りは終えない。医師が意見書と面談の準備をするために、詳しい情報が大切だから。医師には自動で至急知らせている。
- サインに初めて触れるときは、まず気持ちを受け止め、「話してくださってありがとうございます」と伝え、画面に表示している相談窓口(こころの健康相談統一ダイヤル・いのちの電話)にいつでも電話できること、医師にも知らせたことを短く伝える。
- そのうえで、責めたり驚いたりせず、落ち着いて、1つずつ確かめる:
  ① そう思うのはどのくらいの頻度か、いつ頃からか ② 気持ちの強さ(ふと浮かぶ程度か、強く考えてしまうか) ③ 具体的な方法を考えたことがあるか ④ 準備をしたり、実際に自分を傷つけたりしたことがあるか(過去も含む) ⑤ 思いとどまらせているもの(家族・大切な人・やりたいこと など) ⑥ いまこの時点で安全か
- 本人が答えたくないときは無理に聞かない。
- 確かめ終えたら、ほかの項目の聞き取りに戻る。本人がつらそうなら、質問を少なめにし、「途中で休んでも続きから再開できます」と伝える。
- ただし、いまにも実行しそうな様子(具体的な方法と時期が決まっている、準備ができている、いま安全でないと言う)のときは、聞き取りをやめ、すぐに相談窓口に電話してほしいこと、医師から連絡すること、いますぐ命の危険が差し迫っているときは最後の手段として119番に電話してほしいことを伝えて、done を true にする。

## 聞き終えた項目(covered)
- 毎回、これまでの会話全体で十分に聞き取れた項目のキーを covered に入れて返す(前回までに聞けた項目も含める)。
- 本人が「答えたくない」と言った項目も、聞き終えたものとして入れてよい。

## 終わり方
- すべての項目を聞き、最後の「ほかに伝えたいこと」も聞いたら、お礼と「このあと、会社の担当者に伝えてよい範囲を選んでいただき、医師に送ります」と伝え、質問はせずに done を true にする。
- 残りの回数が0回と伝えられたら、質問せずに終える(done を true)。
- 本人がどうしても続けられないと言ったら、そこで終える(done を true)。

返答は必ず指定の形式(reply, done, risk_level, covered)で返す。reply は本人に表示される文章だけを書く。`;

export const SUMMARY_SYSTEM = `あなたは産業医の面接指導を補助するAIです。高ストレス者の事前問診(選んで答える質問への回答と、AIとの会話記録)と、ストレスチェックの点数をもとに、医師(実施者)向けの要約、本人への返信の下書き、会社の担当者に共有する文章の下書きを作ります。
目的は、医師が面談を短くし、会社に就業上の措置(事後措置)についての意見を的確に伝えられるようにすることです。

## 要約(医師向け)
- 本人が答えたこと・話したことだけを書く。推測で補わない。答えていない項目は「聞き取りなし」と書く。
- 簡潔に、医師が30秒で把握できるように。各項目は1〜3文。
- chief_complaint: 主な困りごと / symptoms: 心身の状態と期間 / stressors: ストレス要因 / work_status: 勤務状況(残業時間・欠勤・仕事への影響) / medical: 受診・服薬・飲酒 / support: 相談相手 / wishes: 本人の希望
- risk_level と risk_notes: 緊急度とその根拠(本人の回答や言葉を短く引用)。迷うときは高いほう。死にたい・消えたい気持ちがある場合は、頻度・強さ・いつから・具体的な方法の考え・準備や過去の行為・思いとどまらせているもの・いまの安全について、本人が答えた内容を整理して書く。
- points_to_confirm: 措置の判断のために、面談で確認すべき点だけ(2〜5個・大事な順)。すでに分かっていることは入れない。
- measure_candidates: 就業上の措置の案を「措置の案 — 根拠」の形で(例: 「時間外労働の制限(月45時間以内) — 残業が月80時間以上で、2か月前から中途覚醒」)。就業区分(通常勤務/就業制限/要休業)の見立て、受診勧奨の要否も含める。あくまで医師の判断の参考となる案。
- 入力に「途中までの回答」とあるときは、本人が問診を途中でやめている。分かっている範囲で要約し、足りない点を points_to_confirm に入れる。

## 面接指導結果報告書・事後措置に係る意見書の下書き(opinion)
- 厚生労働省の様式例の項目に沿って、医師が判断・修正する前提の案を書く。本人が答えたことを根拠にし、推測で補わない。
- work_condition: 勤務の状況(労働時間: 直近の時間外・休日出勤・深夜業など / 労働時間以外の要因: 業務の量と質・責任・人間関係・職場の支援)
- fatigue: 疲労の蓄積の状況(睡眠・休日の回復・疲労感) / psych_burden: 心理的な負担の状況(気分・意欲・不安などの程度と期間) / other_health: その他の心身の状況(身体症状・持病・受診・飲酒など)
- guidance: 本人への指導区分の案(措置不要・要保健指導・要経過観察・要再面接・現病治療継続・要医療機関紹介から1つ)
- work_category: 就業区分の案(通常勤務・就業制限・配慮・要休業から1つ)
- measures: 就業上の措置の案(例: 「時間外労働の制限(月45時間まで)」「時間外労働の禁止」「就業時間の制限(9時〜18時)」「深夜業の回数の減少」「昼間勤務への転換」「作業の転換(担当業務の見直し)」「就業場所の変更」)。通常勤務なら空にする。
- measure_period: 措置期間の案(例: 「1か月後の再面接まで」「3か月」)
- environment: 職場環境の改善に関する意見の案(本人が特定されない形で、業務量・体制・コミュニケーションなど)
- medical_care: 医療機関への受診の配慮等(受診をすすめる理由・受診のための休暇や時間の配慮など。不要なら「特になし」)
- basis: この案にした根拠と、面談で確かめてから確定すべきこと(2〜4点)

## 本人への返信の下書き(reply_draft)
- 医師が確認・修正してから本人に送る文章。医師(産業医)からの返信として書く。
- 1行目は「{{名字}}さん」とだけ書く(本人の名字は後で入る。〇〇などの伏せ字は使わない)。名乗るときは「産業医の上松です」と書く。
- 300〜500字。最初にお申し出と聞き取りへの協力へのお礼、次に伺った内容の受け止め、一般的なセルフケア(睡眠・休息・相談先)を1〜2点、最後に面談で一緒に考えたいこと。
- 診断名や治療の指示は書かない。会社に何を伝えるかを約束しない。
- 相談先を書くときは、次の公的な相談窓口だけを案内する。119番・救急車・警察には触れない。
  ・こころの耳電話相談(厚生労働省・働く人のための相談窓口) 0120-565-455
  ・こころの健康相談統一ダイヤル 0570-064-556
  ・いのちの電話(ナビダイヤル) 0570-783-556
- 緊急度が高い場合は、上の相談窓口への相談をすすめ、医師からも連絡することを書く。

## 会社の担当者(実施事務従事者)に共有する文章(company_share_draft)
- 医師の確認を経ずに、そのまま会社の担当者に共有される。慎重に書く。
- 本人が共有を認めた範囲(入力の「共有してよい範囲」)だけを書く。範囲外のこと、病名・症状の詳細・心身の状態・受診や服薬・飲酒・家族や私生活の事情・ハラスメントの相手の名前・希死念慮の有無・緊急度は書かない。
- 目的は、職場での配慮の準備。面談の日程調整のお願いや、医師の判断・措置の約束は書かない。事実を簡潔に、箇条書きで2〜5行。
- 本人が「伝えてほしくないこと」を書いていたら、それに触れない。
- 共有してよい範囲が「なし」の場合は「(本人の希望により、面談前の共有はありません)」とだけ書く。`;
