import { NextResponse } from "next/server";
import { getFiscalYear } from "@/lib/fiscal";
import { checkPersonInput, createNoEmailPerson, issuePasscode, listNoEmailPeople, staffContext } from "@/lib/no-email-server";

export const runtime = "nodejs";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const MAX_PEOPLE = 50;

// メールアドレスのない受検者の一覧(当年度の受検状況つき)
export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId") ?? "";
  const ctx = await staffContext(req, companyId);
  if (!ctx.ok) return fail(ctx.status, ctx.error);
  const fy = getFiscalYear();
  try {
    return NextResponse.json({ fiscalYear: fy, people: await listNoEmailPeople(ctx.admin, companyId, fy) });
  } catch (e) {
    // SQL 0034 の実行前は列がない
    return fail(503, `準備がまだです(SQL 0034 を実行してください): ${e instanceof Error ? e.message : String(e)}`);
  }
}

// action=create: 受検者を登録する / issue: 合言葉を発行(出し直し)する / remove: 登録を取り消す(結果がない人だけ)
export async function POST(req: Request) {
  let body: { companyId?: unknown; action?: unknown; people?: unknown; userId?: unknown; userIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const ctx = await staffContext(req, companyId);
  if (!ctx.ok) return fail(ctx.status, ctx.error);
  const { admin } = ctx;
  const log = (action: string, target: string) =>
    admin.from("access_logs").insert({ user_id: ctx.userId, role: ctx.role, action, target, company_id: companyId });

  if (body.action === "create") {
    const list = Array.isArray(body.people) ? (body.people as unknown[]) : [];
    if (list.length === 0) return fail(400, "登録する方を入力してください");
    if (list.length > MAX_PEOPLE) return fail(400, `一度に登録できるのは${MAX_PEOPLE}名までです`);
    const checked = list.map((p) => checkPersonInput((p ?? {}) as Record<string, unknown>));
    const bad = checked.find((c) => !c.ok);
    if (bad && !bad.ok) return fail(400, bad.error);
    const created: { userId: string; loginId: string; name: string }[] = [];
    const errors: string[] = [];
    for (const c of checked) {
      if (!c.ok) continue;
      const r = await createNoEmailPerson(admin, companyId, c);
      if (r.ok) created.push({ userId: r.userId, loginId: r.loginId, name: c.name });
      else errors.push(r.error);
    }
    if (created.length > 0) await log("no_email_person_created", `count=${created.length}`);
    return NextResponse.json({ ok: true, created, errors });
  }

  // ここから先は、対象がこの企業のメールなしの受検者であることを確かめる
  if (body.action === "issue") {
    // 合言葉の発行(出し直し)。まとめて発行できる。合言葉は保存していないので、この応答でしか見られない(紙に印刷して渡す)
    const ids = [...new Set((Array.isArray(body.userIds) ? (body.userIds as unknown[]) : [body.userId]).filter((x): x is string => typeof x === "string" && x !== ""))];
    if (ids.length === 0) return fail(400, "対象の方を選んでください");
    if (ids.length > MAX_PEOPLE) return fail(400, `一度に発行できるのは${MAX_PEOPLE}名までです`);
    const { data: profs } = await admin.from("profiles").select("user_id, name, dept, company_id, login_id").in("user_id", ids);
    const targets = (profs ?? []).filter((p) => p.company_id === companyId && p.login_id);
    if (targets.length !== ids.length) return fail(404, "対象の方が見つかりません");
    const { data: done } = await admin.from("results").select("user_id").eq("fiscal_year", getFiscalYear()).in("user_id", ids);
    if ((done ?? []).length > 0) return fail(400, "今年度すでに受検済みの方が含まれています");
    const slips: { userId: string; name: string; dept: string | null; loginId: string; passcode: string }[] = [];
    for (const p of targets) {
      const r = await issuePasscode(admin, p.user_id as string);
      if (!r.ok) return fail(500, r.error);
      slips.push({ userId: p.user_id as string, name: p.name as string, dept: (p.dept as string | null) ?? null, loginId: p.login_id as string, passcode: r.passcode });
    }
    await log("no_email_passcode_issued", `count=${slips.length}`);
    slips.sort((a, b) => (a.dept ?? "").localeCompare(b.dept ?? "", "ja") || a.name.localeCompare(b.name, "ja"));
    return NextResponse.json({ ok: true, slips });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const { data: prof } = await admin.from("profiles").select("user_id, name, company_id, login_id").eq("user_id", userId).maybeSingle();
  if (!prof || prof.company_id !== companyId || !prof.login_id) return fail(404, "対象の方が見つかりません");

  if (body.action === "remove") {
    const { count } = await admin.from("results").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) > 0) return fail(400, "受検結果がある方は取り消せません(結果は5年間保存します)");
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return fail(500, `取り消せませんでした: ${error.message}`);
    await log("no_email_person_removed", String(prof.name));
    return NextResponse.json({ ok: true });
  }

  return fail(400, "操作の指定が不正です");
}
