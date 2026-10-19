import { NextResponse } from "next/server";
import {
  CRISIS_MESSAGE,
  decideTurn,
  INTAKE_MAX_CHARS,
  detectCrisis,
  followupsLeft,
  formatQuickAnswers,
  higherRisk,
  intakeProgress,
  quickRisk,
  validQuickAnswers,
  type IntakeMessage,
  type RiskLevel,
} from "@/lib/intake";
import { intakeTurn } from "@/lib/intake-server";
import { fail, intakeContext, loadIntake, notifyUrgent, siteOrigin } from "@/lib/intake-api";

export const runtime = "nodejs";
export const maxDuration = 60;

// 事前問診の1往復(本人のみ)。3つの送り方がある:
//   quick: 最初の「選んで答える質問」の回答 / text: AIの追加の質問への回答 / retry: 前回AIの応答に失敗したときのやり直し
// 本人の回答は AI の応答を待たずに先に保存する(AIが失敗しても回答は消えず、続きから再開できる)。
// 命に関わるサインがあれば AI を待たずに相談先を示し、実施者に至急知らせる
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId } = ctx;

  let body: { intakeId?: unknown; text?: unknown; quick?: unknown; note?: unknown; retry?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const intake = await loadIntake(admin, body.intakeId);
  if (!intake || intake.user_id !== userId) return fail(404, "事前問診が見つかりません");
  if (intake.status !== "in_progress") return fail(400, "この事前問診は終了しています");

  const now = () => new Date().toISOString();
  const history: IntakeMessage[] = [...(intake.messages ?? [])];
  const answered = history.some((m) => m.role === "user");
  let risk: RiskLevel = intake.risk_level ?? "none";
  let crisis = false;

  if (body.retry === true) {
    if (history[history.length - 1]?.role !== "user") return fail(400, "やり直す回答がありません");
    crisis = detectCrisis(history[history.length - 1].content);
  } else if (body.quick !== undefined) {
    if (answered) return fail(400, "選んで答える質問は回答済みです");
    if (!validQuickAnswers(body.quick)) return fail(400, "すべての質問に答えてください");
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
    history.push({ role: "user", content: formatQuickAnswers(body.quick, note), at: now() });
    risk = higherRisk(risk, quickRisk(body.quick));
    crisis = risk === "high" || detectCrisis(note);
  } else {
    if (!answered) return fail(400, "先に、選んで答える質問に回答してください");
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return fail(400, "入力してください");
    if (text.length > INTAKE_MAX_CHARS) return fail(400, `1回の入力は${INTAKE_MAX_CHARS}文字までにしてください`);
    history.push({ role: "user", content: text, at: now() });
    crisis = detectCrisis(text);
  }
  if (crisis) risk = "high";
  const userTurns = history.filter((m) => m.role === "user").length;

  // 本人の回答を先に保存する
  if (body.retry !== true) {
    const { error } = await admin
      .from("interview_intakes")
      .update({ messages: history, risk_level: risk, progress: intakeProgress(userTurns, false), updated_at: now() })
      .eq("id", intake.id)
      .eq("status", "in_progress");
    if (error) return fail(500, `保存できませんでした: ${error.message}`);
  }
  if (risk === "high") await notifyUrgent(admin, intake, siteOrigin(req));

  let reply: string;
  let done: boolean;
  const left = followupsLeft(userTurns);
  if (crisis) {
    reply = CRISIS_MESSAGE;
    done = true;
  } else {
    try {
      const t = await decideTurn(userTurns, (mustAsk) => intakeTurn(history, left, mustAsk));
      reply = t.reply;
      done = t.done;
      risk = higherRisk(risk, t.risk_level);
    } catch (e) {
      console.error("intake turn failed", e);
      return NextResponse.json(
        { error: "回答は保存しました。AIの応答に失敗したため、「続きの質問を受け取る」を押してください。", saved: true },
        { status: 502 }
      );
    }
  }
  const progress = intakeProgress(userTurns, done);

  history.push({ role: "assistant", content: reply, at: now() });
  const { error } = await admin
    .from("interview_intakes")
    .update({ messages: history, risk_level: risk, progress, updated_at: now() })
    .eq("id", intake.id)
    .eq("status", "in_progress");
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  if (risk === "high") await notifyUrgent(admin, intake, siteOrigin(req));
  return NextResponse.json({ reply, done, risk_level: risk, progress, user: history[history.length - 2] });
}
