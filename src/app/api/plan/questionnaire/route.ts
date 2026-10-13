import { NextResponse } from "next/server";
import { requestUser } from "@/lib/supabase/server";
import { getFiscalYear } from "@/lib/fiscal";
import { questionnaireLabel } from "@/lib/plan";
import { adminClient } from "@/lib/plan-server";

export const runtime = "nodejs";

// Web申込の企業の担当者(実施事務従事者)が、調査票(57項目版/80項目版)を変更する。
// 同じ年度の中で調査票が混ざらないよう、今年度まだ誰も受検していないときだけ変更できる
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });

  let body: { questionnaire?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const q = body.questionnaire === "80" ? "80" : body.questionnaire === "57" ? "57" : null;
  if (!q) return NextResponse.json({ error: "調査票を選んでください" }, { status: 400 });

  const { data: me } = await admin
    .from("profiles")
    .select("role, company_id, no_personnel_authority")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me || me.role !== "jimu" || !me.company_id || !me.no_personnel_authority) {
    return NextResponse.json({ error: "変更できるのは自社の担当者(実施事務従事者)だけです" }, { status: 403 });
  }
  const { data: co } = await admin.from("companies").select("web_signup, questionnaire").eq("id", me.company_id).maybeSingle();
  if (!co?.web_signup) return NextResponse.json({ error: "Web申込の企業ではありません" }, { status: 400 });
  if (co.questionnaire === q) return NextResponse.json({ ok: true, unchanged: true });

  const { count } = await admin
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("company_id", me.company_id)
    .eq("fiscal_year", getFiscalYear());
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `今年度はすでに受検した方がいるため、調査票は変更できません(${questionnaireLabel(co.questionnaire)}のまま実施します)。来年度のお申込みで選び直せます。` },
      { status: 409 }
    );
  }
  const { error } = await admin.from("companies").update({ questionnaire: q }).eq("id", me.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
