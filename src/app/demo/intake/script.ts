import { INTAKE_CLOSING, INTAKE_FIRST_MESSAGE, formatQuickAnswers, type IntakeMessage, type IntakeSummary, type QuickAnswers } from "@/lib/intake";

// 紹介用デモ: 事前問診の流れ(AIは使わず、決まった質問を順に出す)。答えの内容を読み取らないので、
// どんな答えにも合う質問だけにしている。実際のAIは、選んだ答えに合わせて措置の判断に必要な点だけを聞く
export const DEMO_QUICK: QuickAnswers = {
  overtime: ["月45〜80時間"],
  sleep: ["寝つきが悪い・夜中や早朝に目が覚めることがある"],
  appetite: ["減った"],
  mood: ["1か月以上"],
  impact: ["集中できない", "ミスが増えた"],
  causes: ["仕事の量・時間", "上司との関係"],
  medical: ["していない"],
  alcohol: ["増えた"],
  support: ["いる"],
  wishes: ["業務量の調整"],
  crisis: ["ない"],
};
export const DEMO_QUICK_NOTE = "4月から担当が増えて、仕事が終わらない";

// steps[0] は選んで答える質問のあとの返答。sample はその前の質問への答えの例
export const DEMO_STEPS: { reply: string; sample: string }[] = [
  {
    sample: "",
    reply:
      "ご回答ありがとうございます。いくつか具体的に伺います。\n1. 残業が増えたのはいつ頃からですか？ この先も続きそうですか？\n2. 睡眠は、1日に何時間くらい取れていますか？",
  },
  {
    sample: "1. 4月からです。少なくとも年内は続きそうです。\n2. 5時間くらいです。",
    reply:
      "教えてくださってありがとうございます。\n1. いちばん負担に感じている仕事は何ですか？(例: 締め切りが重なる、担当が多すぎる)\n2. 上司との関係で、つらいと感じるのはどんな場面ですか？(詳しい内容は面談で伺います)",
  },
  {
    sample: "1. 担当の案件が3件から5件に増えて、締め切りが重なっています。\n2. 相談しても「頑張って」と言われるだけで、言い出しにくいです。",
    reply:
      "ありがとうございます。最後に伺います。\n1. 職場にどんな配慮があると助かりますか？(例: 担当の見直し、締め切りの調整)\n2. ほかに医師に伝えておきたいことがあれば、一緒に書いてください。",
  },
  {
    sample: "1. 担当を減らすか、締め切りを調整してほしいです。\n2. 上司には、自分から相談したことを伏せてほしいです。",
    reply: INTAKE_CLOSING,
  },
];

export const DEMO_REPLY_FROM_DOCTOR = `事前問診へのご協力、ありがとうございました。産業医の上松です。

4月から担当の案件が増えて締め切りが重なり、残業が多い状態が続いていること、睡眠が5時間ほどで、集中しにくくなっていることを確認しました。上司に言い出しにくい中で、よく伝えてくださいました。

面談までの間は、できる範囲で次のことを試してみてください。
・寝る前のお酒は控えめにする(眠りが浅くなりやすいため)
・寝る1時間前からはスマートフォンや仕事のメールを見ない

面談では、睡眠の様子や業務の状況を詳しく伺い、仕事の量の調整などについて一緒に考えます。会社に何をどう伝えるかは、面談であなたと相談して決めますので、安心してください。

日程は別途ご連絡します。それまでに急につらさが強くなったときは、遠慮なくご連絡ください。`;

const at = "2026-10-17T10:00:00+09:00";
export const DEMO_TRANSCRIPT: IntakeMessage[] = [
  { role: "assistant", content: INTAKE_FIRST_MESSAGE, at },
  { role: "user", content: formatQuickAnswers(DEMO_QUICK, DEMO_QUICK_NOTE), at },
  { role: "assistant", content: DEMO_STEPS[0].reply, at },
  ...DEMO_STEPS.slice(1).flatMap((s) => [
    { role: "user" as const, content: s.sample, at },
    { role: "assistant" as const, content: s.reply, at },
  ]),
];

export const DEMO_SUMMARY: IntakeSummary = {
  chief_complaint: "4月から担当が増え、仕事が終わらない。集中できずミスが増えた。",
  symptoms: "1か月以上、気分の落ち込み・意欲低下。寝つきが悪く中途覚醒あり、睡眠は5時間程度。食欲低下。",
  stressors: "担当案件が3件から5件に増え、締め切りが重なる。上司に相談しても「頑張って」と言われ、言い出しにくい。",
  work_status: "時間外労働は月45〜80時間。4月から続き、年内は続く見込み。集中力低下・ミスの増加あり。欠勤なし。",
  medical: "通院・服薬なし。飲酒量が増えた。",
  support: "話せる人はいる。",
  wishes: "業務量の調整(担当を減らす、締め切りの調整)。上司には本人から相談したことを伏せてほしい。",
  risk_level: "moderate",
  risk_notes: "落ち込みが1か月以上続き、睡眠5時間程度・食欲低下・ミスの増加あり。希死念慮は「ない」と回答。",
  points_to_confirm: [
    "抑うつ症状の程度(朝の気分、興味の低下)と、受診の必要性",
    "飲酒量(量・頻度、寝酒になっていないか)",
    "上司への伝え方(本人の同意の範囲)",
  ],
  measure_candidates: [
    "時間外労働の制限(月45時間以内) — 4月から月45〜80時間が続き、睡眠5時間・集中力低下・ミスの増加",
    "業務量の調整(担当案件の見直し・締め切りの分散) — 担当が3件から5件に増え、締め切りが重なっている",
    "就業区分の見立て: 就業制限(通常勤務は可能、上記の制限つき) — 欠勤はなく、業務は継続できている",
    "医療機関の受診勧奨の検討 — 落ち込みが1か月以上、食欲低下あり",
  ],
};
