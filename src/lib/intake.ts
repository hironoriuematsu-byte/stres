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

// 面接指導結果報告書・就業上の措置に係る意見書(厚生労働省の様式例、マニュアル付録2)の項目に沿った下書き
export const GUIDANCE_OPTIONS = ["措置不要", "要保健指導", "要経過観察", "要再面接", "現病治療継続又は医療機関紹介"] as const;
export const WORK_CATEGORY_OPTIONS = ["通常勤務", "就業制限・配慮", "要休業"] as const;
export const HOURS_MEASURE_OPTIONS = [
  "特に指示なし",
  "時間外労働の制限",
  "時間外労働の禁止",
  "就業時間を制限",
  "変形労働時間制または裁量労働制の対象からの除外",
  "就業の禁止(休暇・休養の指示)",
  "その他",
] as const;
export const OTHER_MEASURE_OPTIONS = ["就業場所の変更", "作業の転換", "深夜業の回数の減少", "昼間勤務への転換", "その他"] as const;
export type IntakeOpinion = {
  work_condition: string; // 勤務の状況(労働時間、労働時間以外の要因)
  fatigue: string; // 疲労の蓄積の状況(以前の版の下書きとの互換のため残す)
  psych_burden: string; // 心理的な負担の状況(ストレスチェック結果と医学的所見に関する特記事項)
  other_health: string; // その他の心身の状況(所見なし/所見あり: 内容)
  guidance: (typeof GUIDANCE_OPTIONS)[number][] | string; // 本人への指導区分(案・複数選択可。古い下書きは文字列)
  reinterview?: string; // 要再面接の時期(案)
  work_category: (typeof WORK_CATEGORY_OPTIONS)[number]; // 就業区分(案)
  hours_measures?: string[]; // 労働時間の短縮(案): 様式の選択肢名と具体的な内容(例: 「時間外労働の制限(月45時間まで)」)
  other_measures?: string[]; // 労働時間以外の項目(案): 様式の選択肢名と具体的な内容
  measures: string[]; // 就業上の措置の内容(案。以前の版の下書きとの互換のため残す)
  measure_period: string; // 措置期間(案)
  environment: string; // 職場環境の改善に関する意見(案)
  medical_care: string; // 医療機関への受診配慮等(案)
  consent_notes?: string; // 本人が意見書に書いてよい・書かないでほしいとしたこと
  basis: string; // 判断の根拠と、面談で確かめるべきこと
};

// 流れ(厚生労働省「医学的知見に基づくストレスチェック制度の高ストレス者に対する適切な面接指導実施のためのマニュアル」2021年9月版に沿う)
//   ① 選んで答える質問(3つのシート): 面接用事前記入シート(付録1-2) → 体調チェックシート(添付2・14項目) → 体調の確認(添付5・9項目)
//   ② AIの聞き取り: 面接の流れのステップ③〜⑨のうち、本人に事前に伺えること
//   ③ 会社に伝えてよい範囲を選んで医師に送る
// 長くなるため、回答は1問ごとにサーバーに保存し、続きから再開できる。途中でやめても途中までの内容で要約を作る
export const INTAKE_MAX_FOLLOWUPS = 25; // AIの質問の上限(費用と本人の負担の上限)
export const INTAKE_MAX_USER_TURNS = INTAKE_MAX_FOLLOWUPS + 2; // 念のための上限(選んで答える質問 + 追加の質問 + 予備)
export const INTAKE_NAME = "事前問診";
export const INTAKE_MINUTES = "約20〜30分";
export const INTAKE_MAX_CHARS = 1000; // 1回の入力の上限
export const INTAKE_PARTIAL_AFTER_DAYS = 2; // 途中でやめてからこの日数がたったら、途中までの内容で要約を作る

export const INTAKE_FIRST_MESSAGE =
  "面接のお申し出、ありがとうございます。今後、ストレスをコントロールしながら、よい仕事を続けていただけるように、医師との面談の前にお話を伺います(事前問診)。" +
  "伺った内容は、ご本人の同意がなければ、上司や人事に伝えることはありません。" +
  "回答は自動で保存され、中断しても続きから再開できます。答えにくい質問は「答えたくない」で大丈夫です。";

export const INTAKE_CLOSING =
  "ご回答ありがとうございました。伺った内容は、医師が面談の前に確認します。\n" +
  "このあと、会社の担当者に伝えてよい範囲を選んでいただき、医師に送ります。";

// ① 選んで答える質問(3つのシート)
//   kind: single(1つ選ぶ)/ multi(複数選ぶ)/ text(自由記入・任意)
//   when: 前の答えによって出す質問(例: 通院している人だけ)
//   points: 体調チェックシートの点数(4: 良い 〜 1: 悪い) / positive: 体調の確認(9症状)で「あり」と数える選択肢
export type QuickAnswers = Record<string, string[]>;
export type QuickQuestion = {
  key: string;
  label: string;
  section: QuickSectionKey;
  kind?: "single" | "multi" | "text";
  options?: string[];
  none?: string; // multi で「特にない」にあたる選択肢(他と同時に選ばない)
  optional?: boolean;
  placeholder?: string;
  hint?: string;
  when?: (a: QuickAnswers) => boolean;
  points?: number[]; // options と同じ順の点数(体調チェックシート)
  positive?: string[]; // 体調の確認で「あり」と数える選択肢
};
export const QUICK_SECTIONS = [
  { key: "life", title: "勤務と生活について", desc: "面接用の事前記入シートです。わかる範囲でお答えください。" },
  { key: "body", title: "体調チェックシート(最近1か月)", desc: "最近1か月の状態に、いちばん近いものを選んでください。" },
  { key: "check", title: "体調の確認", desc: "いまの体調について、もう少し伺います。" },
] as const;
export type QuickSectionKey = (typeof QUICK_SECTIONS)[number]["key"];

const has = (a: QuickAnswers, k: string, v: string) => (a[k] ?? []).includes(v);
const drinks = (a: QuickAnswers) => (a.alcohol ?? []).length > 0 && !has(a, "alcohol", "飲まない");
const treated = (a: QuickAnswers) => has(a, "medical", "いま通院している");

export const QUICK_QUESTIONS: QuickQuestion[] = [
  // ---- 勤務と生活について(面接用事前記入シート) ----
  { key: "position", section: "life", label: "職位", options: ["一般社員", "主任・係長などのリーダー", "課長などの管理職", "その他"] },
  { key: "job", section: "life", kind: "text", optional: true, label: "いまの業務内容(任意・一言で)", placeholder: "例: 営業、システム開発、製造ラインの管理" },
  {
    key: "work_flags",
    section: "life",
    kind: "multi",
    label: "あてはまるものを選んでください(複数可)",
    options: ["残業がある", "休日出勤がある", "出張がある", "在宅勤務がある", "いずれもない"],
    none: "いずれもない",
  },
  { key: "overtime", section: "life", label: "最近3か月の残業・休日出勤は、合わせて月にどのくらいですか", options: ["ほとんどない", "月45時間まで", "月45〜80時間", "月80時間以上", "わからない"] },
  { key: "return_time", section: "life", label: "夜は何時ごろに帰宅しますか(在宅勤務の日は仕事を終える時刻)", options: ["19時より前", "19〜21時", "21〜23時", "23時以降"] },
  { key: "holidays", section: "life", label: "休日はとれていますか", options: ["週に2日ほどとれている", "週に1日ほど", "月に数日しかとれない"] },
  { key: "night", section: "life", label: "深夜(22時〜5時)の勤務や交替勤務はありますか", options: ["ない", "ときどきある", "定期的にある"] },
  { key: "discretion", section: "life", label: "裁量労働制や変形労働時間制で働いていますか", options: ["いいえ", "裁量労働制", "変形労働時間制", "わからない"] },
  { key: "commute", section: "life", label: "通勤にかかる時間(片道)", options: ["30分未満", "30分〜1時間", "1時間〜1時間半", "1時間半以上", "ほぼ在宅勤務"] },
  { key: "sleep_weekday", section: "life", label: "平日の睡眠時間", options: ["5時間未満", "5〜6時間", "6〜7時間", "7時間以上"] },
  { key: "sleep_holiday", section: "life", label: "休日の睡眠時間", options: ["5時間未満", "5〜6時間", "6〜7時間", "7〜9時間", "9時間以上"] },
  {
    key: "sleep_problems",
    section: "life",
    kind: "multi",
    label: "睡眠について、あてはまるものを選んでください(複数可)",
    options: ["寝つきにくい", "途中で目が覚める", "朝早く目が覚めてしまう", "日中眠くなる", "特にない"],
    none: "特にない",
  },
  { key: "meals", section: "life", label: "1日の食事の回数", options: ["3回", "2回", "1回", "不規則"] },
  { key: "alcohol", section: "life", label: "お酒を飲む頻度", options: ["飲まない", "月に数回", "週に1〜3日", "週に4〜6日", "毎日"] },
  {
    key: "alcohol_amount",
    section: "life",
    label: "1回に飲む量(日本酒1合=ビール中瓶1本・焼酎80ml・ウイスキーダブル1杯・ワイン2杯が目安)",
    options: ["1合未満", "1〜2合", "2〜3合", "3合以上"],
    when: drinks,
  },
  { key: "alcohol_change", section: "life", label: "最近、お酒の量に変化はありますか", options: ["変わらない", "増えた", "減った"], when: drinks },
  { key: "smoking", section: "life", label: "たばこ(加熱式を含む)", options: ["吸わない", "1日10本以下", "1日11〜20本", "1日21本以上"] },
  { key: "exercise", section: "life", label: "運動(散歩を含む)の頻度", options: ["週に2回以上", "週に1回くらい", "月に数回", "ほとんどしない"] },
  { key: "health_body", section: "life", label: "体の健康を100点満点で表すと", options: ["90〜100点", "70〜89点", "50〜69点", "30〜49点", "29点以下"] },
  { key: "health_mind", section: "life", label: "気持ちの面の健康を100点満点で表すと", options: ["90〜100点", "70〜89点", "50〜69点", "30〜49点", "29点以下"] },
  { key: "medical", section: "life", label: "定期的に通院していますか(どの診療科でも)", options: ["していない", "いま通院している", "以前に通院していた"] },
  {
    key: "medical_detail",
    section: "life",
    kind: "text",
    optional: true,
    label: "通院している(していた)病気・時期・飲んでいる薬(任意・わかる範囲で)",
    placeholder: "例: 高血圧で内科に通院中、降圧薬を1種類",
    when: (a) => has(a, "medical", "いま通院している") || has(a, "medical", "以前に通院していた"),
  },
  {
    key: "causes",
    section: "life",
    kind: "multi",
    label: "ストレスの原因として思いあたるもの(複数可)",
    options: ["仕事の量・時間", "仕事の内容・責任", "上司との関係", "同僚・部下との関係", "ハラスメントと感じること", "異動・役割の変化", "仕事以外のこと", "自分の体調", "特にない"],
    none: "特にない",
  },
  {
    key: "wishes",
    section: "life",
    kind: "multi",
    label: "医師に相談したいこと(複数可)",
    options: ["業務量の調整", "残業を減らしたい", "担当・配置の変更", "休みを取りたい", "医療機関の受診について", "話を聞いてほしい", "特にない"],
    none: "特にない",
  },
  { key: "note", section: "life", kind: "text", optional: true, label: "心身や仕事のことで気になること(任意)", placeholder: "例: 4月から担当が増えて、仕事が終わらない" },

  // ---- 体調チェックシート(添付2・最近1か月) ----
  {
    key: "b_absence",
    section: "body",
    label: "1. 勤怠: 過去1か月の欠勤日数(遅刻・早退は0.5日、有給休暇も含む。計画年休は除く)",
    options: ["4日以上", "2〜3.5日", "0.5〜1.5日", "0日"],
    points: [1, 2, 3, 4],
  },
  {
    key: "b_contact",
    section: "body",
    label: "2. 他人(同僚・上司・顧客など)との交流",
    options: ["話しかけられても、返事をしないことがある", "話しかけられれば返事する。自分から話しかけることはない", "自分から話しかけるが、相手はすでに知っている人に限られる", "初対面の人でも、自分から話しかける"],
    points: [1, 2, 3, 4],
  },
  {
    key: "b_focus",
    section: "body",
    label: "3. 業務への集中: 業務時間のうち集中していられる時間",
    options: ["0〜2時間(4分の1未満)", "2〜4時間(4分の1〜2分の1)", "4〜6時間(2分の1〜4分の3)", "6〜8時間(4分の3以上)"],
    points: [1, 2, 3, 4],
  },
  { key: "b_output", section: "body", label: "4. ストレスがなかったときと比べた作業の状況", options: ["50%未満", "50〜75%", "75〜90%", "90〜100%"], points: [1, 2, 3, 4] },
  {
    key: "b_report",
    section: "body",
    label: "5. 報告・連絡・相談",
    options: ["適切にしていない", "上司から指示されれば、一部は適切に行える", "上司から指示されれば、適切に行える", "自分の判断で、適切に行える"],
    points: [1, 2, 3, 4],
  },
  {
    key: "b_task",
    section: "body",
    label: "6. 業務への対応",
    options: ["業務を理解できない", "業務を理解しているが、自分で実施できず、上司や同僚の助けも求められない", "業務を理解しており、上司や同僚の助けを求めながら実施している", "業務を理解し、自分で実施している"],
    points: [1, 2, 3, 4],
  },
  { key: "b_sleepy", section: "body", label: "7. 日中の眠気: 日中に眠いと感じる日", options: ["週に3回以上", "週に2回", "週に1回", "ほとんどない(週1回未満)"], points: [1, 2, 3, 4] },
  {
    key: "b_leisure",
    section: "body",
    label: "8. 余暇の過ごし方(元気なときと比べて)",
    options: ["疲れて寝ていることが多い", "寝てはいないが、余暇を楽しむ余裕はない", "ある程度楽しめているが、元気なときほどではない", "元気なときと同じように楽しめている"],
    points: [1, 2, 3, 4],
  },
  {
    key: "b_mental",
    section: "body",
    label: "9. 気持ちの面の不調(ゆううつ・やる気が出ない・不安・イライラ・気持ちが高ぶるなど)のために",
    options: ["日常生活に、週3日以上影響がある", "日常生活に、ときどき影響がある", "日常生活への影響はないが、ときどき(週1日以上)ある", "ほとんどない(週1日未満)"],
    points: [1, 2, 3, 4],
  },
  {
    key: "b_physical",
    section: "body",
    label: "10. 体の症状(頭痛・だるさ・発熱・下痢・吐き気など)のために",
    options: ["日常生活に、週3日以上影響がある", "日常生活に、ときどき影響がある", "日常生活への影響はないが、ときどき(週1日以上)ある", "ほとんどない(週1日未満)"],
    points: [1, 2, 3, 4],
  },
  { key: "b_alcohol", section: "body", label: "11. 1日あたりの飲酒量(日本酒1合=ビール中瓶1本が目安)", options: ["3合以上", "2〜3合", "1〜2合", "1合未満(飲まない場合も)"], points: [1, 2, 3, 4] },
  {
    key: "b_support",
    section: "body",
    label: "12. 職場以外でのサポート",
    options: [
      "職場以外での人間関係でのサポートはなく、ストレスがある",
      "職場以外での人間関係はない、または、サポートよりストレスのほうが大きい",
      "職場以外での人間関係があり、ストレスもあるが、サポートのほうが大きい",
      "職場以外での人間関係は良好で、ストレスはなく、サポートが得られる",
    ],
    points: [1, 2, 3, 4],
  },
  {
    key: "b_doctor",
    section: "body",
    label: "13. 主治医との関係(通院している方のみ)",
    options: [
      "自分の判断で、主治医に相談せずに通院をやめている",
      "通院しているが、回数は不規則になっている",
      "規則的に通院しているが、主治医との話し合いが一部不十分",
      "規則的に通院し、主治医と十分に話し合えている",
    ],
    points: [1, 2, 3, 4],
    when: treated,
  },
  {
    key: "b_medicine",
    section: "body",
    label: "14. 薬の飲み方(通院している方のみ)",
    options: [
      "医師に相談せず、服薬を完全にやめている",
      "医師に相談せず、服薬を一部やめている",
      "相談せずにやめることはないが、自分での調整について医師と話したことはない",
      "相談せずにやめることはなく、自分での調整についても医師と話し合っている",
      "薬は飲んでいない",
    ],
    points: [1, 2, 3, 4, 0], // 0: 点数に入れない
    when: treated,
  },

  // ---- 体調の確認(添付5・9つの症状) ----
  { key: "c_mood", section: "check", label: "気分が落ち込むことはありますか", options: ["ない", "ときどきある", "よくある"], positive: ["ときどきある", "よくある"] },
  { key: "c_interest", section: "check", label: "気晴らしはできていますか", options: ["できている", "あまりできていない", "まったくできていない"], positive: ["あまりできていない", "まったくできていない"] },
  { key: "c_appetite", section: "check", label: "食欲はいかがですか", options: ["いつもどおり", "落ちている", "増えている"], positive: ["落ちている", "増えている"] },
  {
    key: "c_sleep",
    section: "check",
    label: "睡眠で困っていることはありますか(寝つき・夜中や早朝に目が覚める・よく寝た感じがしない・昼間の眠気など)",
    options: ["困っていない", "少し困っている", "とても困っている"],
    positive: ["少し困っている", "とても困っている"],
  },
  { key: "c_energy", section: "check", label: "やる気・意欲はいかがですか", options: ["いつもどおり", "少し落ちている", "かなり落ちている"], positive: ["少し落ちている", "かなり落ちている"] },
  { key: "c_focus", section: "check", label: "仕事での集中力はいかがですか(仕事に支障はありますか)", options: ["いつもどおり", "少し落ちている", "かなり落ちている"], positive: ["少し落ちている", "かなり落ちている"] },
  { key: "c_slow", section: "check", label: "ご自分の考えるスピード、話し方、動作が、少し遅くなっていると思いますか", options: ["思わない", "少しそう思う", "そう思う"], positive: ["少しそう思う", "そう思う"] },
  { key: "c_guilt", section: "check", label: "ご自分に自信がなくなったり、自分を責めてしまったりすることはありますか", options: ["ない", "ときどきある", "よくある"], positive: ["ときどきある", "よくある"] },
  { key: "crisis", section: "check", label: "体調に負担があるから、生きているのがつらいと思うことはありますか", options: ["ない", "ときどきある", "よくある"], positive: ["ときどきある", "よくある"] },
];
export const QUICK_HEADER = "【選んで答える質問への回答】";

// 前の答えによって出す質問も含め、いま答えるべき質問
export const activeQuestions = (a: QuickAnswers, section?: QuickSectionKey): QuickQuestion[] =>
  QUICK_QUESTIONS.filter((q) => (!section || q.section === section) && (!q.when || q.when(a)));

// 1問の答えが正しいか(必須の質問は答えがあること、選択肢にない値がないこと)
export function validAnswer(q: QuickQuestion, v: unknown): boolean {
  const kind = q.kind ?? "single";
  if (v === undefined || (Array.isArray(v) && v.length === 0)) return Boolean(q.optional);
  if (!Array.isArray(v)) return false;
  if (kind === "text") return v.length === 1 && typeof v[0] === "string" && v[0].length <= 300;
  if (kind === "single" && v.length !== 1) return false;
  return v.every((x) => typeof x === "string" && (q.options ?? []).includes(x));
}

// 選んで答える質問の答えを確かめる(いま答えるべき質問がすべて正しく答えられているか)
export function validQuickAnswers(a: unknown): a is QuickAnswers {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const ans = a as QuickAnswers;
  return activeQuestions(ans).every((q) => validAnswer(q, ans[q.key]));
}

// 体調チェックシート(添付2)の合計点と平均点(1〜4点。低いほど不調)
export function bodyCheckScore(a: QuickAnswers): { total: number; count: number; average: number } {
  let total = 0;
  let count = 0;
  for (const q of activeQuestions(a, "body")) {
    const i = (q.options ?? []).indexOf((a[q.key] ?? [])[0] ?? "");
    const p = i >= 0 ? (q.points ?? [])[i] : 0;
    if (p > 0) {
      total += p;
      count++;
    }
  }
  return { total, count, average: count > 0 ? Math.round((total / count) * 10) / 10 : 0 };
}

// 体調の確認(添付5): 9つの症状のうち、みられる数と、マニュアルの判断の目安
export function depressiveSymptoms(a: QuickAnswers): { count: number; items: string[]; advice: string } {
  const items = activeQuestions(a, "check")
    .filter((q) => (q.positive ?? []).some((p) => has(a, q.key, p)))
    .map((q) => q.label);
  const count = items.length;
  const advice =
    count >= 5 ? "5つ以上: 心療内科・精神科の受診を勧めた方がよい" : count === 4 ? "4つ: 定期的なフォローアップを提案した方がよい" : "3つ以下: あまり心配はいらない";
  return { count, items, advice };
}

// 会話の記録に残す形(医師もAIもこの文章を読む)。シートごとにまとめ、点数と判断の目安を添える
export function formatQuickAnswers(a: QuickAnswers): string {
  const sections = QUICK_SECTIONS.map((s) => {
    const lines = activeQuestions(a, s.key)
      .filter((q) => (a[q.key] ?? []).length > 0)
      .map((q) => `・${q.label.replace(/\((複数可|任意[^)]*)\)$/, "")}: ${(a[q.key] ?? []).join("、")}`);
    return `■ ${s.title}\n${lines.join("\n")}`;
  });
  const b = bodyCheckScore(a);
  const d = depressiveSymptoms(a);
  sections.push(
    `■ 集計\n・体調チェックシート: 合計${b.total}点/${b.count}項目、平均${b.average}点(1〜4点、低いほど不調)\n・体調の確認(9つの症状): ${d.count}つ(${d.advice})`
  );
  return `${QUICK_HEADER}\n${sections.join("\n\n")}`;
}

// 選んで答える質問だけで分かる緊急度(AIの判断とあわせて、高いほうを使う)
export function quickRisk(a: QuickAnswers): RiskLevel {
  if ((a.crisis ?? []).length > 0 && !has(a, "crisis", "ない")) return "high";
  const d = depressiveSymptoms(a);
  const b = bodyCheckScore(a);
  if (
    d.count >= 5 ||
    (b.count > 0 && b.average < 2.5) ||
    has(a, "overtime", "月80時間以上") ||
    has(a, "b_absence", "4日以上") ||
    has(a, "causes", "ハラスメントと感じること")
  )
    return "moderate";
  return "low";
}

// AIが聞き取る項目(マニュアルの面接の流れ ステップ③〜⑨のうち、本人に事前に伺えること)。
// AIは毎回、聞き終えた項目を返し、進み具合の計算に使う
export const INTAKE_TOPICS = [
  { key: "past_stress", label: "ステップ③ 過去に、いまのようにストレスが高い状況になったことがあるか(いつ・どんなとき・どう乗り切ったか)" },
  { key: "sc_review", label: "ステップ④ ストレスチェックの結果(ストレスの原因・心身の反応・周囲の支援)について、本人の実感と違うところがないか" },
  { key: "body_details", label: "ステップ⑤ 選んだ答えで気になる体調について、いつ頃から・どのくらい・仕事への影響。それ以外の体調の不調。受診しているか" },
  { key: "daily_life", label: "ステップ⑥ 残業や帰宅時刻の具体、休日の過ごし方、気分転換の方法(最近も楽しめているか)、家族との関係(家族は心配していないか)" },
  { key: "work_cause", label: "ステップ⑦ ストレスの業務上の要因についての本人の考えと、その具体的な背景(どんな場面・量・人)を、本人の言葉で確認" },
  { key: "continuity", label: "ステップ⑦ その要因はどれくらい続きそうか、改善の見込みはあるか" },
  { key: "rewarding", label: "ステップ⑦ 仕事にやりがいを持てているか(上司には伝えないことを添えて)" },
  { key: "private", label: "ステップ⑦ 業務外(プライベート)に思いあたる原因があるか(一度だけ聞き、本人が自分から話さない限り掘り下げない)" },
  { key: "coping_plan", label: "ステップ⑧ ストレスの要因を改善するために、本人はどうするのがよいと考えるか・どんな配慮があると助かるか" },
  { key: "report_consent", label: "ステップ⑨ 会社への意見書に書いてほしいこと・書いてほしくないこと、上司を交えた話し合いの希望" },
  { key: "follow_up", label: "ステップ⑨ 今後のフォローの希望と、ほかに医師に伝えておきたいこと(付け加え)" },
  { key: "risk", label: "「生きているのがつらい」と思うことがある場合: 頻度・強さ・いつから・具体的な方法を考えたか・準備や過去の行為・思いとどまらせているもの(ない場合は聞き終えたとしてよい)" },
  { key: "discretion", label: "裁量労働制の場合: 適用された経緯、実際に裁量があると感じるか、生活リズムが保てているか(該当しない場合は聞き終えたとしてよい)" },
] as const;
export type TopicKey = (typeof INTAKE_TOPICS)[number]["key"];
const TOPIC_KEYS = new Set<string>(INTAKE_TOPICS.map((t) => t.key));
export const validTopics = (keys: unknown): TopicKey[] =>
  Array.isArray(keys) ? [...new Set(keys.filter((k): k is TopicKey => typeof k === "string" && TOPIC_KEYS.has(k)))] : [];

// 問診の進み具合(%)。選んで答える質問で 25%、残りは聞き終えた項目の割合。終わるまで100にしない
export function intakeProgress(userTurns: number, done: boolean, coveredCount?: number): number {
  if (done) return 100;
  if (userTurns <= 0) return 5;
  if (coveredCount === undefined) return Math.min(95, 25 + 4 * (userTurns - 1)); // 項目が分からないとき(デモ)
  return Math.min(95, 25 + Math.round((70 * coveredCount) / INTAKE_TOPICS.length));
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
      required: [
        "work_condition",
        "fatigue",
        "psych_burden",
        "other_health",
        "guidance",
        "reinterview",
        "work_category",
        "hours_measures",
        "other_measures",
        "measures",
        "measure_period",
        "environment",
        "medical_care",
        "consent_notes",
        "basis",
      ],
      properties: {
        work_condition: { type: "string" },
        fatigue: { type: "string" },
        psych_burden: { type: "string" },
        other_health: { type: "string" },
        guidance: { type: "array", items: { type: "string", enum: [...GUIDANCE_OPTIONS] } },
        reinterview: { type: "string" },
        work_category: { type: "string", enum: [...WORK_CATEGORY_OPTIONS] },
        hours_measures: { type: "array", items: { type: "string" } },
        other_measures: { type: "array", items: { type: "string" } },
        measures: { type: "array", items: { type: "string" } },
        measure_period: { type: "string" },
        environment: { type: "string" },
        medical_care: { type: "string" },
        consent_notes: { type: "string" },
        basis: { type: "string" },
      },
    },
    reply_draft: { type: "string" },
    company_share_draft: { type: "string" },
  },
} as const;

// 聞き取り役の指示(医師ではない立場を守る)。厚生労働省のマニュアルの面接の流れ(ステップ③〜⑨)と言葉づかいに沿って聞く
export const INTERVIEW_SYSTEM = `あなたは、うえまつ産業医事務所の「面接指導の事前問診」を担当するAIです。医師ではありません。
ストレスチェックでストレスが高い状態と判定され、産業医による面接指導を申し出た従業員から、面談の前にお話を伺います。
厚生労働省「医学的知見に基づくストレスチェック制度の高ストレス者に対する適切な面接指導実施のためのマニュアル」(2021年9月版)の面接の流れに沿って、本人に事前に伺えることを、聞き落としなく聞き取ります。

## 目的
- 医師が面談の前に十分な情報を持ち、面談では確認と解決策の相談に集中し、面接指導結果報告書・就業上の措置に係る意見書を正確に書けるようにすること。
- 本人が自分のストレスの状況を振り返り、困ったときに産業医に相談しようと思える関係をつくること。

## すでに分かっていること
- 会話の最初に、本人が3つのシートに答えている: 面接用の事前記入シート(勤務・通勤・睡眠・食事・飲酒・喫煙・運動・自覚的な健康・通院・ストレスの原因・相談したいこと)、体調チェックシート(14項目・点数)、体調の確認(9つの症状)。
- その下に、ストレスチェックの点数(A ストレスの要因・B 心身の反応・C 周囲の支援)が付いていることがある。
- シートで答えたことは、そのまま聞き直さない。気になる答えを出発点に、具体的に掘り下げる。

## 聞き取る項目(すべて聞く。おおむねこの順で、会話の流れに合わせて)
${INTAKE_TOPICS.map((t) => `- ${t.key}: ${t.label}`).join("\n")}

## 言葉づかい(マニュアルの注意)
- 「精神的」「こころ」「うつ」「メンタル」といった言葉は使わない。「体調」「負担」「ストレス」といった一般的な言葉で聞く。
- 「ストレスが高い状態」は変わりうる状態として表現する(「高ストレス者」とは言わない)。
- 質問は「〇〇については、いかがですか？」のように、本人が思うことを自由に答えられるニュートラルな形にする。状況をはっきりさせる必要があるときだけ「仕事に支障はありますか？」のように確かめる。
- 本人の言葉を繰り返して受け止める(例:「よく寝たという感じはしないのですね」「帰宅が22時になることがあるのですね」)。
- ときどき、それまでの話を短くまとめて、理解が合っているか確かめる。

## 聞き方
- 一度に聞くのは1つか2つまで。前の答えを受けて、次の質問を決める。
- あいまいな答えは掘り下げる: いつから・どのくらいの頻度・何時間・何日・どんな場面で・仕事への影響は。数字で聞けるものは数字で聞く。
- ステップ⑦の業務上の要因は、本人の表現を使いながら2〜3回内容を確かめる(あとで本人が修正することもあるため)。
- 業務外(プライベート)の要因は一度だけ尋ね、本人が自分から話さない限り質問を重ねない(企業の健康管理の範囲を超え、プライバシーの侵害とみなされるおそれがあるため)。本人が長く話すときは「医師からカウンセラーなどの情報をお伝えできます」と添える。
- ハラスメントの話が出たら、詳しい事実の確認や判断はせず、「大切なことなので、医師が面談で改めて丁寧に伺います」と伝える。
- 通院中の病気がある場合は、主治医から仕事について言われていることを確かめる。
- 最後に、伺ったストレスの要因と本人の希望を短くまとめて、間違いがないかを確かめ、ほかに伝えておきたいことを聞く。
- 目安は15〜25往復。すべての項目を聞き終えるまでは終えない。

## 話し方
- まず相手の話を受け止める一言を添えてから、次の質問をする。短く、やさしい日本語で。専門用語は使わない。
- 答えたくないと言われたら、無理に聞かずに次の項目へ進む。決めつけたり評価したりしない。
- 本人が疲れている様子なら、「途中で休んでも、続きから再開できます」と伝える。

## してはいけないこと
- 病名の診断、病気かどうかの判断、治療・服薬の指示や変更の助言はしない(「医師が面談で一緒に考えます」と伝える)。
- 会社や上司への具体的な働きかけ・異動などを約束しない。「医師だけでは決められないが、上司や人事を交えた話し合いを提案することはできる」と伝える。
- 一般的なセルフケア(睡眠のとり方、休息、相談先など)は一言なら伝えてよいが、個別の対処策は「医師からお伝えします」とする。

## 緊急度(risk_level)
- high: 生きているのがつらい・死にたい・消えたい気持ち、自分を傷つける行為・計画、他人を傷つける恐れ、現実と区別がつかない様子、ほとんど眠れない・食べられない状態が続いている。
- moderate: 体調の確認で症状が5つ以上、仕事を休みがち、強い不眠や食欲低下が2週間以上、ハラスメントの訴え、強い不安・落ち込みが続いている。
- low: ストレスはあるが日常生活・仕事はおおむね保てている。
- none: 特に気になる点がない。
- 判断に迷うときは高いほうにする。

## 生きているのがつらい・死にたい・消えたい気持ちのサインがあるとき(risk_level は high)
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

## 面接指導結果報告書・就業上の措置に係る意見書の下書き(opinion)
- 厚生労働省の様式例(マニュアル付録2)の項目に沿って、医師が判断・修正する前提の案を書く。本人が答えたことを根拠にし、推測で補わない。
- work_condition: 勤務の状況(労働時間: 残業・休日出勤・帰宅時刻・深夜業・通勤時間 / 労働時間以外の要因: 業務の量と質・裁量・人間関係・職場の支援・要因の継続見込み)
- fatigue: 睡眠・休日の回復・日中の眠気など疲労の状況
- psych_burden: 心理的な負担の状況。ストレスチェックの点数(A・B・C)があれば書き、続けて医学的所見に関する特記事項(体調の確認で症状がいくつか・体調チェックシートの平均点・気になる症状と期間)を書く。
- other_health: その他の心身の状況。「所見なし」または「所見あり(内容)」の形で(睡眠不足・飲酒量の増加・体の症状・通院中の病気など)。
- guidance: 本人への指導区分の案(複数選択可): 措置不要・要保健指導・要経過観察・要再面接・現病治療継続又は医療機関紹介。体調の確認で症状が5つ以上なら「現病治療継続又は医療機関紹介」を、4つなら「要経過観察」か「要再面接」を含める(マニュアルの判断の目安)。
- reinterview: 要再面接の時期の案(例:「1か月後」)。不要なら空。
- work_category: 就業区分の案(通常勤務・就業制限・配慮・要休業から1つ)
- hours_measures: 労働時間の短縮の案。様式の選択肢名で書き、具体的な内容を括弧で添える(例:「時間外労働の制限(月45時間まで)」「就業時間を制限(8時30分〜20時)」)。選択肢: ${HOURS_MEASURE_OPTIONS.join("・")}。通常勤務なら「特に指示なし」。
- other_measures: 労働時間以外の項目の案。様式の選択肢名で書き、具体的な内容を添える(例:「その他(上司との定期的な面談の場の設定)」「作業の転換(担当案件の見直し)」)。選択肢: ${OTHER_MEASURE_OPTIONS.join("・")}。なければ空。
- measures: hours_measures と other_measures を合わせたもの(一覧表示用)
- measure_period: 措置期間の案(例:「1か月」「次回の面接まで」)
- environment: 職場環境の改善に関する意見の案(本人が特定されない形で。例: 本人の同意が得られれば、上司を交えた面談を行う)
- medical_care: 医療機関への受診配慮等の案(例:「現時点では不要だが、症状が悪化した場合は受診が必要」「心療内科・精神科の受診を勧める。受診のための時間の配慮を依頼」)
- consent_notes: 本人が意見書に書いてほしいこと・書いてほしくないこと(本人が拒否した対応策は意見書に入れない、とマニュアルにあるため、医師が確認できるように整理する)
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
