import { NextResponse } from "next/server";
import {
  CRISIS_MESSAGE,
  INTAKE_MAX_CHARS,
  INTAKE_MAX_USER_TURNS,
  detectCrisis,
  higherRisk,
  type IntakeMessage,
  type RiskLevel,
} from "@/lib/intake";
import { intakeTurn } from "@/lib/intake-server";
import { fail, intakeContext, loadIntake, notifyUrgent, siteOrigin } from "@/lib/intake-api";

export const runtime = "nodejs";
export const maxDuration = 60;

// 事前ヒアリングの1往復(本人のみ)。本人の発言を受けて AI が返答する。
// 命に関わる言葉があれば AI を待たずに相談先を示し、実施者に至急知らせる
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId } = ctx;

  let body: { intakeId?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const intake = await loadIntake(admin, body.intakeId);
  if (!intake || intake.user_id !== userId) return fail(404, "事前ヒアリングが見つかりません");
  if (intake.status !== "in_progress") return fail(400, "この事前ヒアリングは終了しています");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return fail(400, "入力してください");
  if (text.length > INTAKE_MAX_CHARS) return fail(400, `1回の入力は${INTAKE_MAX_CHARS}文字までにしてください`);

  const now = () => new Date().toISOString();
  const history: IntakeMessage[] = [...(intake.messages ?? []), { role: "user", content: text, at: now() }];
  const userTurns = history.filter((m) => m.role === "user").length;

  let reply: string;
  let done: boolean;
  let risk: RiskLevel = intake.risk_level ?? "none";
  if (detectCrisis(text)) {
    reply = CRISIS_MESSAGE;
    done = true;
    risk = "high";
  } else {
    try {
      const t = await intakeTurn(history);
      reply = t.reply || "ありがとうございます。続けて教えてください。";
      done = t.done;
      risk = higherRisk(risk, t.risk_level);
    } catch (e) {
      console.error("intake turn failed", e);
      return fail(502, "AIの応答に失敗しました。少し時間をおいて、もう一度送信してください。");
    }
  }
  if (userTurns >= INTAKE_MAX_USER_TURNS) done = true;

  history.push({ role: "assistant", content: reply, at: now() });
  const { error } = await admin
    .from("interview_intakes")
    .update({ messages: history, risk_level: risk, updated_at: now() })
    .eq("id", intake.id)
    .eq("status", "in_progress");
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  if (risk === "high") await notifyUrgent(admin, intake, siteOrigin(req));
  return NextResponse.json({ reply, done, risk_level: risk });
}
