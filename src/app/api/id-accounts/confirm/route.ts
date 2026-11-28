import { NextResponse } from "next/server";
import { requestUser } from "@/lib/supabase/server";
import { adminClient } from "@/lib/plan-server";
import { ID_CONFIRM_MAX_FAILURES } from "@/lib/no-email";

export const runtime = "nodejs";

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// IDでログインした本人の、最初の本人確認(発行時に登録した生年月日と合うか)。
// 合言葉の紙を拾った人が使えないようにするため。5回まちがえると止まり、担当者に合言葉を出し直してもらう
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return fail(401, "ログインの有効期限が切れました。もう一度ログインしてください。");
  const admin = adminClient();
  if (!admin) return fail(500, "サーバー設定エラー");
  let body: { birthDate?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const birthDate = typeof body.birthDate === "string" ? body.birthDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return fail(400, "生年月日を入力してください");

  const { data: prof } = await admin
    .from("profiles")
    .select("user_id, login_id, id_birth_date, id_confirmed_at, id_confirm_failures")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prof?.login_id) return fail(400, "この確認は必要ありません");
  if (prof.id_confirmed_at) return NextResponse.json({ ok: true });
  const failures = (prof.id_confirm_failures as number | null) ?? 0;
  if (failures >= ID_CONFIRM_MAX_FAILURES) {
    return fail(423, "確認に続けて失敗したため、利用を止めています。会社のストレスチェック担当者に、合言葉の出し直しを依頼してください。", { locked: true });
  }
  if (prof.id_birth_date && prof.id_birth_date !== birthDate) {
    const next = failures + 1;
    await admin.from("profiles").update({ id_confirm_failures: next }).eq("user_id", user.id);
    const left = ID_CONFIRM_MAX_FAILURES - next;
    return fail(
      400,
      left > 0
        ? `登録されている生年月日と一致しません。もう一度確かめて入力してください(あと${left}回)。`
        : "確認に続けて失敗したため、利用を止めました。会社のストレスチェック担当者に、合言葉の出し直しを依頼してください。",
      { locked: left <= 0 }
    );
  }
  const { error } = await admin
    .from("profiles")
    .update({ id_confirmed_at: new Date().toISOString(), id_confirm_failures: 0, ...(prof.id_birth_date ? {} : { id_birth_date: birthDate, birth_date: birthDate }) })
    .eq("user_id", user.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);
  return NextResponse.json({ ok: true });
}
