import { describe, expect, it } from "vitest";
import {
  CRISIS_FOLLOWUP,
  decideTurn,
  detectCrisis,
  INTERVIEW_SYSTEM,
  fillReplyNames,
  removeEmergencyCall,
  surnameOf,
  INTAKE_CLOSING,
  followupsLeft,
  formatQuickAnswers,
  higherRisk,
  INTAKE_MAX_FOLLOWUPS,
  INTAKE_TOPICS,
  validTopics,
  intakeProgress,
  needsPartialSummary,
  QUICK_QUESTIONS,
  quickRisk,
  SUMMARY_SCHEMA,
  TURN_SCHEMA,
  validQuickAnswers,
  type QuickAnswers,
} from "@/lib/intake";

describe("事前問診: 命に関わるサインの言葉", () => {
  it("はっきりした言葉は拾う(全角・半角の違いも)", () => {
    expect(detectCrisis("もう死にたいと思うことがある")).toBe(true);
    expect(detectCrisis("消えたい気持ちになる")).toBe(true);
    expect(detectCrisis("自殺を考えたことがある")).toBe(true);
    expect(detectCrisis("生きていたくない")).toBe(true);
    expect(detectCrisis("リストカットをしてしまった")).toBe(true);
  });
  it("ふつうの困りごとでは反応しない", () => {
    expect(detectCrisis("残業が多くて眠れない")).toBe(false);
    expect(detectCrisis("上司との関係がつらい")).toBe(false);
    expect(detectCrisis("死ぬほど忙しい")).toBe(false);
  });
});

describe("事前問診: 緊急度", () => {
  it("高いほうを残す", () => {
    expect(higherRisk("low", "high")).toBe("high");
    expect(higherRisk("moderate", "low")).toBe("moderate");
    expect(higherRisk("none", "none")).toBe("none");
  });
  it("AIの返答の形は必須項目がそろっている", () => {
    expect(TURN_SCHEMA.required).toEqual(["reply", "done", "risk_level", "covered"]);
    expect(SUMMARY_SCHEMA.required).toContain("opinion");
    expect(SUMMARY_SCHEMA.properties.opinion.required).toEqual(
      expect.arrayContaining(["work_condition", "fatigue", "psych_burden", "other_health", "guidance", "work_category", "measures", "measure_period", "environment", "medical_care"])
    );
    expect(SUMMARY_SCHEMA.required).toContain("company_share_draft");
    expect(SUMMARY_SCHEMA.required).toContain("reply_draft");
    expect(SUMMARY_SCHEMA.additionalProperties).toBe(false);
  });
});

import { shouldRemind } from "@/lib/intake-invite";

describe("事前問診: 催促", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const base = { last_sent_at: "2026-10-16T00:00:00Z", sent_count: 1, declined_at: null };
  it("案内から3日たって未回答なら催促する", () => {
    expect(shouldRemind(base, null, "pending", now)).toBe(true);
    expect(shouldRemind(base, "in_progress", "scheduled", now)).toBe(true); // 途中でやめた人にも
  });
  it("3日たっていない・回数の上限・受けない・回答済み・面接終了なら催促しない", () => {
    expect(shouldRemind({ ...base, last_sent_at: "2026-10-18T00:00:00Z" }, null, "pending", now)).toBe(false);
    expect(shouldRemind({ ...base, sent_count: 3 }, null, "pending", now)).toBe(false);
    expect(shouldRemind({ ...base, declined_at: "2026-10-17T00:00:00Z" }, null, "pending", now)).toBe(false);
    expect(shouldRemind(base, "completed", "pending", now)).toBe(false);
    expect(shouldRemind(base, null, "done", now)).toBe(false);
    expect(shouldRemind({ ...base, last_sent_at: null, sent_count: 0 }, null, "pending", now)).toBe(false); // 最初の案内は実施者か申出時
  });
});

describe("事前問診: 選んで答える質問", () => {
  const calm: QuickAnswers = Object.fromEntries(QUICK_QUESTIONS.map((q) => [q.key, [q.options[0]]]));
  it("すべてに答えていれば受け付ける。未回答・選択肢にない値・1つだけの質問に複数は受け付けない", () => {
    expect(validQuickAnswers(calm)).toBe(true);
    const { sleep: _omit, ...missing } = calm;
    expect(validQuickAnswers(missing)).toBe(false);
    expect(validQuickAnswers({ ...calm, sleep: ["勝手な値"] })).toBe(false);
    expect(validQuickAnswers({ ...calm, sleep: ["よく眠れている", "ほとんど眠れない日が多い"] })).toBe(false);
    expect(validQuickAnswers({ ...calm, causes: ["仕事の量・時間", "上司との関係"] })).toBe(true);
    expect(validQuickAnswers(null)).toBe(false);
  });
  it("会話の記録に残す文章に、質問と答えが入る", () => {
    const t = formatQuickAnswers({ ...calm, overtime: ["月80時間以上"] }, "担当が増えた");
    expect(t).toContain("残業・休日出勤は、合わせて月にどのくらいですか: 月80時間以上");
    expect(t).toContain("いちばん困っていること: 担当が増えた");
  });
  it("死にたい気持ちが少しでもあれば緊急度は高、措置が要りそうな答えは中", () => {
    expect(quickRisk(calm)).toBe("low");
    expect(quickRisk({ ...calm, crisis: ["ときどきある"] })).toBe("high");
    expect(quickRisk({ ...calm, overtime: ["月80時間以上"] })).toBe("moderate");
    expect(quickRisk({ ...calm, causes: ["ハラスメントと感じること"] })).toBe("moderate");
  });
});

describe("事前問診: 往復の上限と進み具合", () => {
  it("AIの質問は最大25問。選んで答える質問のあとから数える", () => {
    expect(INTAKE_MAX_FOLLOWUPS).toBe(25);
    expect(followupsLeft(1)).toBe(25);
    expect(followupsLeft(11)).toBe(15);
    expect(followupsLeft(26)).toBe(0);
  });
  it("進み具合は聞き終えた項目の割合で決まり、終わるまで100にならない", () => {
    expect(intakeProgress(0, false)).toBe(5);
    expect(intakeProgress(1, false, 0)).toBe(15);
    expect(intakeProgress(5, false, 6)).toBeGreaterThan(intakeProgress(5, false, 3));
    expect(intakeProgress(20, false, INTAKE_TOPICS.length)).toBe(95);
    expect(intakeProgress(2, true, 1)).toBe(100);
  });
  it("聞き終えた項目は決まったキーだけを受け付ける", () => {
    expect(validTopics(["chief", "work_hours", "chief", "unknown", 3])).toEqual(["chief", "work_hours"]);
    expect(validTopics(null)).toEqual([]);
  });
});

describe("事前問診: 途中でやめたときの要約", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const msgs = (lastAt: string) => [
    { role: "assistant" as const, content: "はじめに", at: "2026-10-15T00:00:00Z" },
    { role: "user" as const, content: "回答", at: lastAt },
  ];
  it("最後の回答から2日たっていて、要約がまだ・古いときに作る", () => {
    expect(needsPartialSummary({ status: "in_progress", messages: msgs("2026-10-17T00:00:00Z"), summary: null }, now)).toBe(true);
    expect(
      needsPartialSummary({ status: "in_progress", messages: msgs("2026-10-17T00:00:00Z"), summary: { generated_at: "2026-10-16T00:00:00Z" } }, now)
    ).toBe(true);
  });
  it("2日たっていない・作成済み・回答なし・完了済みなら作らない", () => {
    expect(needsPartialSummary({ status: "in_progress", messages: msgs("2026-10-19T00:00:00Z"), summary: null }, now)).toBe(false);
    expect(
      needsPartialSummary({ status: "in_progress", messages: msgs("2026-10-17T00:00:00Z"), summary: { generated_at: "2026-10-18T00:00:00Z" } }, now)
    ).toBe(false);
    expect(needsPartialSummary({ status: "in_progress", messages: msgs("2026-10-17T00:00:00Z").slice(0, 1), summary: null }, now)).toBe(false);
    expect(needsPartialSummary({ status: "completed", messages: msgs("2026-10-17T00:00:00Z"), summary: null }, now)).toBe(false);
  });
});

describe("事前問診: 質問の回数(終えるのはAIが判断・上限あり)", () => {
  // 選んで答える質問のあと、本人が答えるたびに decideTurn を呼び、終わるまでの追加の質問の数を数える
  async function run(ai: (turn: number) => boolean) {
    let questions = 0;
    for (let userTurns = 1; userTurns <= 40; userTurns++) {
      const t = await decideTurn(userTurns, async () => {
        const done = ai(userTurns);
        return { reply: done ? "終わります" : `質問${userTurns}`, done, risk_level: "none" };
      });
      if (t.done) return { questions, last: t };
      questions++;
    }
    throw new Error("終わらない");
  }
  it("選択式だけで十分とAIが判断すれば、追加の質問なしで終わる", async () => {
    const r = await run(() => true);
    expect(r.questions).toBe(0);
    expect(r.last.reply).toBe("終わります");
  });
  it("AIが3問目で終えれば、3問で終わる", async () => {
    expect((await run((turn) => turn >= 4)).questions).toBe(3);
  });
  it("AIが終えようとしなくても、25問で必ず終わる", async () => {
    const r = await run(() => false);
    expect(r.questions).toBe(25);
    expect(r.last.reply).toBe(INTAKE_CLOSING);
  });
});

describe("事前問診: 本人への返信の宛名と署名", () => {
  it("氏名から名字を取り出す(全角・半角の空白どちらでも)", () => {
    expect(surnameOf("山田 太郎")).toBe("山田");
    expect(surnameOf("山田　太郎")).toBe("山田");
    expect(surnameOf("山田太郎")).toBe("山田太郎");
    expect(surnameOf("未設定")).toBe("");
    expect(surnameOf(null)).toBe("");
  });
  it("{{名字}}さん は本人の名字に、産業医の〇〇 は上松に置き換える", () => {
    const t = fillReplyNames("{{名字}}さん\n\n事前問診へのご協力、ありがとうございました。産業医の〇〇です。", "山田");
    expect(t).toBe("山田さん\n\n事前問診へのご協力、ありがとうございました。産業医の上松です。");
  });
  it("伏せ字が残っていても、〇〇さん・○○様・医師の◯◯ を置き換え、〇〇 の表記を残さない", () => {
    const t = fillReplyNames("〇〇さん、こんにちは。○○様の状況を伺いました。医師の◯◯より。〇〇", "佐藤");
    expect(t).toBe("佐藤さん、こんにちは。佐藤様の状況を伺いました。医師の上松より。");
    expect(t).not.toMatch(/[〇○◯]/);
  });
  it("名字がわからないときは、宛名を書かない", () => {
    expect(fillReplyNames("{{名字}}さん\n\n産業医の上松です。", "")).toBe("産業医の上松です。");
    expect(fillReplyNames("〇〇さん、ありがとうございました。", "")).toBe("ありがとうございました。");
  });
});

describe("事前問診: 本人への返信では119番を案内しない", () => {
  it("119番・救急車に触れた文だけを取り除く", () => {
    const t = removeEmergencyCall(
      "まずは、こころの耳電話相談(0120-565-455)に相談してください。いますぐ命の危険があるときは119番に電話してください。医師からも連絡します。"
    );
    expect(t).toBe("まずは、こころの耳電話相談(0120-565-455)に相談してください。医師からも連絡します。");
    expect(removeEmergencyCall("救急車を呼んでください。\n\n\n面談で一緒に考えます。")).toBe("\n\n面談で一緒に考えます。");
  });
});

describe("事前問診: 死にたい気持ちのサインがあっても聞き取りを続ける", () => {
  it("聞き取る項目に、希死念慮の確認(頻度・強さ・方法・準備・思いとどまらせるもの)が入っている", () => {
    const risk = INTAKE_TOPICS.find((t) => t.key === "risk");
    expect(risk?.label).toMatch(/頻度/);
    expect(risk?.label).toMatch(/思いとどまらせている/);
  });
  it("AIへの指示: サインがあっても終えず、いまにも実行しそうなときだけ終える", () => {
    expect(INTERVIEW_SYSTEM).toMatch(/サインがあっても、聞き取りは終えない/);
    expect(INTERVIEW_SYSTEM).toMatch(/いまにも実行しそうな様子/);
    expect(INTERVIEW_SYSTEM).not.toMatch(/聞き取りは続けなくてよい/);
  });
  it("AIが応答できないときの返答は、相談先を示して聞き取りを続ける", () => {
    expect(CRISIS_FOLLOWUP).toMatch(/相談窓口/);
    expect(CRISIS_FOLLOWUP).toMatch(/頻度/);
  });
});
