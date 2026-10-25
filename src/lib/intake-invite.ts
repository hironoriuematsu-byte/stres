import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMails } from "@/lib/plan-server";
import { INTAKE_MINUTES } from "@/lib/intake";

// ============================================================
// 事前問診(AI)の案内と催促
//   - 申出の受付確認メール、または実施者が送る案内が「最初の案内」
//   - まだ受けていない(または途中でやめた)人には、最後の案内から3日ごとに最大2回まで催促する
//   - 本人が「今回は受けない」を選んだ人、面接指導が終わった・取り消された申出には送らない
// ============================================================

export const INTAKE_REMIND_AFTER_DAYS = 3;
export const INTAKE_MAX_SENDS = 3; // 最初の案内 + 催促2回

export type InviteRow = {
  request_id: string;
  company_id: string;
  first_sent_at: string | null;
  last_sent_at: string | null;
  sent_count: number;
  declined_at: string | null;
};

// 催促してよいか(判定だけ。テストしやすいよう純粋な関数にしている)
export function shouldRemind(
  invite: Pick<InviteRow, "last_sent_at" | "sent_count" | "declined_at">,
  intakeStatus: string | null,
  requestStatus: string,
  now: Date
): boolean {
  if (invite.declined_at) return false;
  if (requestStatus !== "pending" && requestStatus !== "scheduled") return false;
  if (intakeStatus && intakeStatus !== "in_progress") return false; // 送信済み・中止
  if (!invite.last_sent_at) return false; // まだ一度も案内していない(最初の案内は申出時か実施者が送る)
  if (invite.sent_count >= INTAKE_MAX_SENDS) return false;
  const elapsed = now.getTime() - new Date(invite.last_sent_at).getTime();
  return elapsed >= INTAKE_REMIND_AFTER_DAYS * 24 * 3600 * 1000;
}

// 案内メールを送り、記録する。本文に健康情報は書かない
export async function sendIntakeInvite(
  admin: SupabaseClient,
  req: { id: string; user_id: string; company_id: string },
  origin: string,
  kind: "invite" | "remind",
  inProgress: boolean
): Promise<boolean> {
  const { data: u } = await admin.auth.admin.getUserById(req.user_id);
  const email = u?.user?.email;
  if (!email) return false;
  await sendMails(
    [email],
    kind === "remind" ? "【ストレスチェックWeb】面談前の事前問診に回答してください(再送)" : "【ストレスチェックWeb】面談前の事前問診への回答のお願い",
    [
      "産業医面接指導のお申し出、ありがとうございます。",
      "",
      inProgress
        ? "面談前の事前問診が途中のままになっています。これまでの回答は保存されているので、下のリンクから続きに回答してください(残りは数分です)。"
        : `医師との面談の前に、「事前問診」(選んで答える質問とAIによる聞き取り・${INTAKE_MINUTES})への回答をお願いします。全員にお願いしているものです。医師が事前に内容を確認するので、面談では解決策の相談に時間を使えます。`,
      "",
      `${origin}/intake/${req.id}`,
      "",
      "※回答は自動で保存されます。途中でやめても、続きから再開できます。",
      "※内容を見られるのは、あなたと実施者(産業医)だけです。",
    ].join("\n")
  );

  const now = new Date().toISOString();
  const { data: cur } = await admin.from("interview_intake_invites").select("*").eq("request_id", req.id).maybeSingle();
  const row = cur as InviteRow | null;
  await admin.from("interview_intake_invites").upsert({
    request_id: req.id,
    company_id: req.company_id,
    first_sent_at: row?.first_sent_at ?? now,
    last_sent_at: now,
    sent_count: (row?.sent_count ?? 0) + 1,
    declined_at: row?.declined_at ?? null,
    updated_at: now,
  });
  return true;
}
