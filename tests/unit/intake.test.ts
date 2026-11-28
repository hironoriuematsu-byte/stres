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
  activeQuestions,
  bodyCheckScore,
  depressiveSymptoms,
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

describe("事前問診: 選んで答える質問(厚生労働省マニュアルの3つのシート)", () => {
  // 落ち着いた答え: 体調チェックシートは4点、それ以外は最初の選択肢。自由記入は空
  const calm: QuickAnswers = Object.fromEntries(
    QUICK_QUESTIONS.filter((q) => (q.kind ?? "single") !== "text").map((q) => [q.key, [q.points ? q.options![q.points.indexOf(4)] : q.options![0]]])
  );
  it("3つのシートに分かれ、体調チェックシート14項目・体調の確認9項目がある", () => {
    expect(QUICK_QUESTIONS.filter((q) => q.section === "body")).toHaveLength(14);
    expect(QUICK_QUESTIONS.filter((q) => q.section === "check")).toHaveLength(9);
  });
  it("いま答えるべき質問がすべて答えられていれば受け付ける。未回答・選択肢にない値・1つだけの質問に複数は受け付けない", () => {
    expect(validQuickAnswers(calm)).toBe(true);
    const { sleep_weekday: _omit, ...missing } = calm;
    expect(validQuickAnswers(missing)).toBe(false);
    expect(validQuickAnswers({ ...calm, sleep_weekday: ["勝手な値"] })).toBe(false);
    expect(validQuickAnswers({ ...calm, sleep_weekday: ["5時間未満", "7時間以上"] })).toBe(false);
    expect(validQuickAnswers({ ...calm, causes: ["仕事の量・時間", "上司との関係"] })).toBe(true);
    expect(validQuickAnswers({ ...calm, note: ["担当が増えた"] })).toBe(true); // 自由記入は任意
    expect(validQuickAnswers(null)).toBe(false);
  });
  it("前の答えによって出る質問: 通院中なら主治医・服薬の項目、飲酒する人は量の項目が必要になる", () => {
    const keys = (a: QuickAnswers) => activeQuestions(a).map((q) => q.key);
    expect(keys(calm)).not.toContain("b_doctor");
    expect(keys({ ...calm, medical: ["いま通院している"] })).toEqual(expect.arrayContaining(["b_doctor", "b_medicine", "medical_detail"]));
    const { b_doctor: _d, b_medicine: _m, ...noTreat } = calm;
    expect(validQuickAnswers({ ...noTreat, medical: ["いま通院している"] })).toBe(false); // 主治医・服薬に未回答
    expect(validQuickAnswers(noTreat)).toBe(true); // 通院していなければ不要
    expect(keys({ ...calm, alcohol: ["毎日"] })).toEqual(expect.arrayContaining(["alcohol_amount", "alcohol_change"]));
    expect(keys(calm)).not.toContain("alcohol_amount"); // 「飲まない」
  });
  it("体調チェックシートの合計・平均点(薬を飲んでいない場合は点数に入れない)", () => {
    expect(bodyCheckScore(calm)).toEqual({ total: 48, count: 12, average: 4 });
    const treated = { ...calm, medical: ["いま通院している"], b_doctor: ["通院しているが、回数は不規則になっている"], b_medicine: ["薬は飲んでいない"] };
    expect(bodyCheckScore(treated)).toEqual({ total: 50, count: 13, average: 3.8 });
  });
  it("体調の確認: 9つの症状の数とマニュアルの判断の目安(3つ以下・4つ・5つ以上)", () => {
    expect(depressiveSymptoms(calm).count).toBe(0);
    const four = { ...calm, c_mood: ["ときどきある"], c_sleep: ["少し困っている"], c_energy: ["少し落ちている"], c_focus: ["少し落ちている"] };
    expect(depressiveSymptoms(four).count).toBe(4);
    expect(depressiveSymptoms(four).advice).toMatch(/定期的なフォローアップ/);
    expect(depressiveSymptoms({ ...four, c_guilt: ["よくある"] }).advice).toMatch(/受診を勧めた方がよい/);
  });
  it("会話の記録に残す文章: シートごとの答えと集計が入る", () => {
    const t = formatQuickAnswers({ ...calm, overtime: ["月80時間以上"], note: ["担当が増えた"] });
    expect(t).toContain("■ 勤務と生活について");
    expect(t).toContain("残業・休日出勤は、合わせて月にどのくらいですか: 月80時間以上");
    expect(t).toContain("心身や仕事のことで気になること: 担当が増えた");
    expect(t).toContain("体調チェックシート: 合計48点/12項目、平均4点");
    expect(t).toContain("体調の確認(9つの症状): 0つ");
    expect(t).not.toContain("主治医との関係"); // 通院していない人には出さない
  });
  it("「生きているのがつらい」が少しでもあれば緊急度は高、症状5つ以上・長時間労働などは中", () => {
    expect(quickRisk(calm)).toBe("low");
    expect(quickRisk({ ...calm, crisis: ["ときどきある"] })).toBe("high");
    expect(quickRisk({ ...calm, overtime: ["月80時間以上"] })).toBe("moderate");
    expect(quickRisk({ ...calm, causes: ["ハラスメントと感じること"] })).toBe("moderate");
    const five = { ...calm, c_mood: ["ときどきある"], c_sleep: ["少し困っている"], c_energy: ["少し落ちている"], c_focus: ["少し落ちている"], c_guilt: ["ときどきある"] };
    expect(quickRisk(five)).toBe("moderate");
  });
  it("AIへの指示: マニュアルの言葉づかい(「うつ」「こころ」を使わない)と、業務外の要因を深追いしないこと", () => {
    expect(INTERVIEW_SYSTEM).toMatch(/「精神的」「こころ」「うつ」/);
    expect(INTERVIEW_SYSTEM).toMatch(/自分から話さない限り質問を重ねない/);
    expect(INTAKE_TOPICS.map((t) => t.key)).toEqual(expect.arrayContaining(["past_stress", "sc_review", "continuity", "rewarding", "report_consent", "follow_up"]));
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
    expect(intakeProgress(1, false, 0)).toBe(25);
    expect(intakeProgress(5, false, 6)).toBeGreaterThan(intakeProgress(5, false, 3));
    expect(intakeProgress(20, false, INTAKE_TOPICS.length)).toBe(95);
    expect(intakeProgress(2, true, 1)).toBe(100);
  });
  it("聞き終えた項目は決まったキーだけを受け付ける", () => {
    expect(validTopics(["past_stress", "sc_review", "past_stress", "unknown", 3])).toEqual(["past_stress", "sc_review"]);
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
