import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fiscalYearOf, jstDate } from "@/lib/plan";
import {
  INTERVIEW_SYSTEM,
  SUMMARY_SCHEMA,
  SUMMARY_SYSTEM,
  TURN_SCHEMA,
  type IntakeMessage,
  SHARE_OPTIONS,
  type IntakeSummary,
  type RiskLevel,
  type ShareConsent,
  type TurnResult,
  validTopics,
} from "@/lib/intake";

// ============================================================
// 面接指導の事前問診(AI)のサーバー側。Claude API(Anthropic)を使う
//   環境変数 ANTHROPIC_API_KEY(Vercel・Sensitive)が無いときは、事前問診を案内しない
// ============================================================

const MODEL = "claude-opus-5-5";

export const intakeConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 55_000 });
  return client;
}

// うえまつ産業医事務所が面接指導を行う申出か(選任・顧問の企業、Web申込で「うえまつ産業医事務所に依頼」)
export async function intakeEligible(
  admin: SupabaseClient,
  req: { company_id: string; created_at: string }
): Promise<boolean> {
  const { data: co } = await admin.from("companies").select("web_signup").eq("id", req.company_id).maybeSingle();
  const web = Boolean(co?.web_signup);
  if (!web) return true;
  const fy = fiscalYearOf(jstDate(req.created_at));
  const { data: plans } = await admin
    .from("exam_plans")
    .select("interview_option")
    .eq("company_id", req.company_id)
    .lte("fiscal_year", fy)
    .order("fiscal_year", { ascending: false })
    .limit(1);
  const option = (plans?.[0]?.interview_option as string | null) ?? null;
  return option === "mestate";
}

// 会話の記録を Claude に渡す形にする(最初は本人の発言から始める必要があるため、開始の合図を置く)。
// 最後の本人の発言には、質問できる残りの回数を添える(本人には表示されず、記録にも残らない)
function toParams(history: IntakeMessage[], questionsLeft: number): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: "(面接指導を申し出ました。事前問診を始めてください)" },
  ];
  history.forEach((m, i) => {
    const note =
      i === history.length - 1 && m.role === "user"
        ? `\n\n(システムからの連絡: 質問できるのは、この返答を含めて残り${questionsLeft}回までです。${questionsLeft <= 0 ? "質問せずに終えてください。" : questionsLeft <= 3 ? "まだ聞いていない項目のうち、措置の判断に大事なものを優先してください。" : ""})`
        : "";
    msgs.push({ role: m.role, content: m.content + note });
  });
  return msgs;
}

function jsonText(res: Anthropic.Beta.BetaMessage): string {
  if (res.stop_reason === "refusal") throw new Error("AIが応答できませんでした(refusal)");
  const block = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  if (!block) throw new Error("AIの応答が空でした");
  return block.text;
}

// 聞き取りの1往復。本人の発言(history の最後)に対する返答と、聞き終えた項目を返す
export async function intakeTurn(history: IntakeMessage[], questionsLeft: number): Promise<TurnResult> {
  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: INTERVIEW_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: toParams(history, questionsLeft),
    output_config: { effort: "medium", format: { type: "json_schema", schema: TURN_SCHEMA as unknown as Record<string, unknown> } },
  });
  const parsed = JSON.parse(jsonText(res)) as { reply: string; done: boolean; risk_level: RiskLevel; covered?: unknown };
  return {
    reply: String(parsed.reply ?? "").trim(),
    done: Boolean(parsed.done),
    risk_level: parsed.risk_level ?? "none",
    covered: validTopics(parsed.covered),
  };
}

// 医師向けの要約、本人への返信の下書き、会社の担当者に共有する文章の下書き
export async function intakeSummarize(
  history: IntakeMessage[],
  scores: { score_a: number; score_b: number; score_c: number; high_stress: boolean } | null,
  share: ShareConsent | null,
  partial = false
): Promise<{ summary: IntakeSummary; reply_draft: string; company_share_draft: string }> {
  const transcript = history.map((m) => `${m.role === "user" ? "本人" : "AI"}: ${m.content}`).join("\n");
  const scoreText = scores
    ? `ストレスチェックの点数(合計点数法): A 仕事のストレス要因 ${scores.score_a}点/68、B 心身のストレス反応 ${scores.score_b}点/116、C 周囲のサポート ${scores.score_c}点/36(高いほどサポートが乏しい)。判定: ${scores.high_stress ? "高ストレス" : "高ストレスに該当せず"}。`
    : "ストレスチェックの点数: なし";
  const shareText =
    share && share.keys.length > 0
      ? `共有してよい範囲: ${SHARE_OPTIONS.filter((o) => share.keys.includes(o.key)).map((o) => o.label).join(" / ")}${share.note ? `\n伝えてほしくないこと・補足: ${share.note}` : ""}`
      : "共有してよい範囲: なし";
  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SUMMARY_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${scoreText}\n${shareText}${partial ? "\n※途中までの回答(本人は問診を途中でやめています)" : ""}\n\n## 事前問診の会話記録\n${transcript}` }],
    output_config: { effort: "high", format: { type: "json_schema", schema: SUMMARY_SCHEMA as unknown as Record<string, unknown> } },
  });
  const parsed = JSON.parse(jsonText(res)) as IntakeSummary & { reply_draft: string; company_share_draft: string };
  const { reply_draft, company_share_draft, ...summary } = parsed;
  return {
    summary: { ...summary, partial, generated_at: new Date().toISOString() },
    reply_draft,
    company_share_draft: share && share.keys.length > 0 ? company_share_draft : "",
  };
}
