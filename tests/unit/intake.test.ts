import { describe, expect, it } from "vitest";
import {
  decideTurn,
  detectCrisis,
  INTAKE_CLOSING,
  followupsLeft,
  formatQuickAnswers,
  higherRisk,
  INTAKE_MAX_FOLLOWUPS,
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
    expect(TURN_SCHEMA.required).toEqual(["reply", "done", "risk_level"]);
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
    expect(t).toContain("残業・休日出勤は、合わせてどのくらいですか: 月80時間以上");
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
  it("追加の質問は最大5問。選んで答える質問のあとから数える", () => {
    expect(INTAKE_MAX_FOLLOWUPS).toBe(5);
    expect(followupsLeft(1)).toBe(5);
    expect(followupsLeft(3)).toBe(3);
    expect(followupsLeft(6)).toBe(0);
    expect(followupsLeft(9)).toBe(0);
  });
  it("進み具合は戻らず、終わるまで100にならない", () => {
    expect(intakeProgress(0, false)).toBe(5);
    expect(intakeProgress(1, false)).toBe(40);
    expect(intakeProgress(2, false)).toBeGreaterThan(intakeProgress(1, false));
    expect(intakeProgress(20, false)).toBe(95);
    expect(intakeProgress(2, true)).toBe(100);
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

describe("事前問診: 追加の質問の回数(必要なときだけ・上限あり)", () => {
  // 選んで答える質問のあと、本人が答えるたびに decideTurn を呼び、終わるまでの追加の質問の数を数える
  async function run(ai: (turn: number) => boolean) {
    let questions = 0;
    for (let userTurns = 1; userTurns <= 20; userTurns++) {
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
  it("AIが終えようとしなくても、5問で必ず終わる", async () => {
    const r = await run(() => false);
    expect(r.questions).toBe(5);
    expect(r.last.reply).toBe(INTAKE_CLOSING);
  });
});
