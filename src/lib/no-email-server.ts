import { randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestUser } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth-server";
import { adminClient } from "@/lib/plan-server";
import { cleanPersonName, isValidPersonName } from "@/lib/name";
import { birthDateError } from "@/lib/birth-date";
import { DEFAULT_ID_EMAIL_DOMAIN, idEmail, makeLoginId, makePasscode, type ExamMethod } from "@/lib/no-email";

// メールアドレスのない方の受検(ID受検・紙の回答)のサーバー側

export const idEmailDomain = (): string => process.env.ID_LOGIN_EMAIL_DOMAIN?.trim() || DEFAULT_ID_EMAIL_DOMAIN;
const rand = () => randomInt(0, 1_000_000) / 1_000_000;

// 権限: 実施者(office)は全企業、実施事務従事者(jimu)は誓約済みで自社のみ(回答という健康情報を扱うため)
export async function staffContext(
  req: Request,
  companyId: string
): Promise<{ ok: true; admin: SupabaseClient; userId: string; role: "office" | "jimu" } | { ok: false; status: number; error: string }> {
  const user = await requestUser(req);
  if (!user) return { ok: false, status: 401, error: "ログインの有効期限が切れました。ページを再読み込みしてください。" };
  const admin = adminClient();
  if (!admin) return { ok: false, status: 500, error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" };
  if (!companyId) return { ok: false, status: 400, error: "企業が指定されていません" };
  const { data: prof } = await admin.from("profiles").select("role, company_id, no_personnel_authority").eq("user_id", user.id).maybeSingle();
  const role = (prof?.role as string | undefined) ?? "";
  if (role === "office") return { ok: true, admin, userId: user.id, role: "office" };
  if (role === "jimu" && prof?.company_id === companyId) {
    if (!prof?.no_personnel_authority) return { ok: false, status: 403, error: "先に「人事権を持たない」ことの誓約を行ってください(ダッシュボードの最初の画面)" };
    return { ok: true, admin, userId: user.id, role: "jimu" };
  }
  return { ok: false, status: 403, error: "この企業の受検者を登録する権限がありません" };
}

// 画面(サーバー側のページ)用: ログイン中の人が、その企業の受検者を扱えるか
export async function staffPageRole(companyId: string): Promise<"office" | "jimu" | null> {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) return null;
  if (profile.role === "office") return "office";
  if (profile.role === "jimu" && profile.company_id === companyId && profile.no_personnel_authority) return "jimu";
  return null;
}

export type NoEmailPerson = {
  user_id: string;
  name: string;
  dept: string | null;
  birth_date: string | null;
  login_id: string;
  issued: boolean; // 合言葉を発行したことがある(IDの紙を渡している)
  confirmed: boolean; // 最初のログインの本人確認が済んでいる
  locked: boolean; // 本人確認に5回失敗して止まっている(合言葉の再発行が必要)
  result: { id: string; method: ExamMethod; at: string; consent: boolean; highStress: boolean } | null; // 当年度の結果
};

export async function listNoEmailPeople(admin: SupabaseClient, companyId: string, fiscalYear: number): Promise<NoEmailPerson[]> {
  const { data: profs, error } = await admin
    .from("profiles")
    .select("user_id, name, dept, login_id, id_birth_date, id_issued_at, id_confirmed_at, id_confirm_failures")
    .eq("company_id", companyId)
    .not("login_id", "is", null)
    .order("name");
  if (error) throw new Error(error.message);
  const ids = (profs ?? []).map((p) => p.user_id as string);
  const { data: results } = ids.length
    ? await admin.from("results").select("id, user_id, exam_method, created_at, consent, high_stress").eq("company_id", companyId).eq("fiscal_year", fiscalYear).in("user_id", ids)
    : { data: [] };
  const byUser = new Map((results ?? []).map((r) => [r.user_id as string, r]));
  return (profs ?? []).map((p) => {
    const r = byUser.get(p.user_id as string);
    return {
      user_id: p.user_id as string,
      name: p.name as string,
      dept: (p.dept as string | null) ?? null,
      birth_date: (p.id_birth_date as string | null) ?? null,
      login_id: p.login_id as string,
      issued: Boolean(p.id_issued_at),
      confirmed: Boolean(p.id_confirmed_at),
      locked: ((p.id_confirm_failures as number | null) ?? 0) >= 5,
      result: r ? { id: r.id as string, method: (r.exam_method as ExamMethod) ?? "web", at: r.created_at as string, consent: Boolean(r.consent), highStress: Boolean(r.high_stress) } : null,
    };
  });
}

// 入力の確認(氏名・生年月日は必須。生年月日は最初のログインの本人確認と、同姓同名の区別に使う)
export function checkPersonInput(input: { name?: unknown; birthDate?: unknown; dept?: unknown }): { ok: true; name: string; birthDate: string; dept: string | null } | { ok: false; error: string } {
  const rawName = typeof input.name === "string" ? input.name : "";
  if (!isValidPersonName(rawName)) return { ok: false, error: "氏名を入力してください" };
  const birthDate = typeof input.birthDate === "string" ? input.birthDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { ok: false, error: `${cleanPersonName(rawName)}さんの生年月日を入力してください` };
  const bad = birthDateError(birthDate);
  if (bad) return { ok: false, error: `${cleanPersonName(rawName)}さん: ${bad}` };
  const dept = typeof input.dept === "string" ? input.dept.trim().slice(0, 100) : "";
  return { ok: true, name: cleanPersonName(rawName), birthDate, dept: dept || null };
}

// メールなしの受検者を登録する(ログイン用のアカウントとプロフィール)。合言葉はまだ渡さない(発行は issuePasscode)
export async function createNoEmailPerson(
  admin: SupabaseClient,
  companyId: string,
  p: { name: string; birthDate: string; dept: string | null }
): Promise<{ ok: true; userId: string; loginId: string } | { ok: false; error: string }> {
  // 同じ企業に同じ氏名・生年月日の人がすでにいれば止める(二重登録を防ぐ)
  const { data: same } = await admin.from("profiles").select("user_id, birth_date, id_birth_date").eq("company_id", companyId).eq("name", p.name);
  if ((same ?? []).some((s) => s.id_birth_date === p.birthDate || s.birth_date === p.birthDate)) {
    return { ok: false, error: `${p.name}さん(${p.birthDate})はすでに登録されています` };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const loginId = makeLoginId(rand);
    const { data: clash } = await admin.from("profiles").select("user_id").eq("login_id", loginId).maybeSingle();
    if (clash) continue;
    // 最初のパスワードは誰にも見せない乱数にする(合言葉を発行するまでログインできない)
    const { data: created, error } = await admin.auth.admin.createUser({
      email: idEmail(loginId, idEmailDomain()),
      password: `${randomUUID()}${randomUUID()}`,
      email_confirm: true,
      user_metadata: { full_name: p.name, no_email: true },
    });
    if (error || !created.user) {
      if (/already|registered|exists/i.test(error?.message ?? "")) continue;
      return { ok: false, error: `登録できませんでした: ${error?.message ?? "unknown"}` };
    }
    const { error: profErr } = await admin.from("profiles").insert({
      user_id: created.user.id,
      role: "employee",
      name: p.name,
      dept: p.dept,
      company_id: companyId,
      login_id: loginId,
      id_birth_date: p.birthDate,
      birth_date: p.birthDate,
    });
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: `登録できませんでした: ${profErr.message}` };
    }
    return { ok: true, userId: created.user.id, loginId };
  }
  return { ok: false, error: "ログインIDを作れませんでした。もう一度お試しください" };
}

// 合言葉を発行する(出し直しも同じ)。前の合言葉は使えなくなり、最初のログインの本人確認もやり直しになる
export async function issuePasscode(admin: SupabaseClient, userId: string): Promise<{ ok: true; passcode: string } | { ok: false; error: string }> {
  const passcode = makePasscode(rand);
  const { error } = await admin.auth.admin.updateUserById(userId, { password: passcode });
  if (error) return { ok: false, error: `合言葉を発行できませんでした: ${error.message}` };
  await admin.from("profiles").update({ id_issued_at: new Date().toISOString(), id_confirmed_at: null, id_confirm_failures: 0 }).eq("user_id", userId);
  return { ok: true, passcode };
}
