/**
 * 受け入れテスト(claude-code-spec.md 7章)
 *
 * 実際のSupabaseプロジェクト(0002_production.sql + 0003_app_fixes.sql 適用済み)に
 * 対して実行する統合テスト。以下の環境変数が必要:
 *
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY=eyJ...
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   (テスト用データの作成・削除に使用)
 *
 * 実行: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:acceptance
 *
 * テスト用の企業・ユーザー・結果を作成し、終了時に削除します。
 * 本番運用中のプロジェクトに対して実行しても既存データには触れませんが、
 * 検証用プロジェクトでの実行を推奨します。
 *
 * 注: テスト2の「メールが実際に着信する」ことは外部SMTPを含むため自動検証できません。
 *     ここでは通知先の選定ロジック(企業Xのjimu+office全員、企業Yのjimuは含まない)を検証します。
 *     実メールはResendダッシュボードのEmails一覧で確認してください。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getFiscalYear } from "@/lib/fiscal";

const URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasEnv = Boolean(URL && ANON && SERVICE);

const run = Math.random().toString(36).slice(2, 8);
const PW = "Test-" + run + "-Passw0rd!";
const FY = getFiscalYear();
const FY_OLD = 2001; // 集団分析テスト用の隔離年度

type TestUser = { id: string; email: string; client: SupabaseClient };

const admin = hasEnv
  ? createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  : (null as unknown as SupabaseClient);

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];

async function makeUser(
  label: string,
  role: "office" | "jimu" | "company" | "employee",
  companyId: string | null,
  opts: { attested?: boolean; dept?: string } = {}
): Promise<TestUser> {
  const email = `sc-test-${run}-${label}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const id = data.user.id;
  createdUserIds.push(id);

  const { error: pErr } = await admin.from("profiles").insert({
    user_id: id,
    role,
    name: `テスト${label}`,
    emp_id: label,
    dept: opts.dept ?? "総務部",
    company_id: companyId,
    no_personnel_authority: opts.attested ?? false,
    attested_at: opts.attested ? new Date().toISOString() : null,
  });
  if (pErr) throw new Error(`profile ${label}: ${pErr.message}`);

  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: PW });
  if (sErr) throw new Error(`signIn ${label}: ${sErr.message}`);
  return { id, email, client };
}

function highStressAnswers() {
  return { A: Array(17).fill(1), B: Array(29).fill(4), C: Array(9).fill(4), D: Array(2).fill(4) };
}

describe.skipIf(!hasEnv)("受け入れテスト(Supabase統合)", () => {
  let companyX: string;
  let companyY: string;
  let empA: TestUser; // 企業X 従業員(高ストレス)
  let empB: TestUser; // 企業Y 従業員
  let empC: TestUser; // 企業X 従業員(同意あり)
  let jimuX: TestUser; // 企業X 実施事務従事者(誓約済)
  let jimuX0: TestUser; // 企業X 実施事務従事者(未誓約)
  let jimuY: TestUser; // 企業Y 実施事務従事者(誓約済)
  let compX: TestUser; // 企業X 事業者担当者
  let office: TestUser; // 実施者

  beforeAll(async () => {
    // 企業X/Y
    const { data: cx, error: e1 } = await admin
      .from("companies")
      .insert({ name: `テスト企業X-${run}`, code: `TSTX${run}` })
      .select()
      .single();
    if (e1) throw e1;
    const { data: cy, error: e2 } = await admin
      .from("companies")
      .insert({ name: `テスト企業Y-${run}`, code: `TSTY${run}` })
      .select()
      .single();
    if (e2) throw e2;
    companyX = cx.id;
    companyY = cy.id;
    createdCompanyIds.push(companyX, companyY);

    empA = await makeUser("empA", "employee", companyX, { dept: "製造部" });
    empB = await makeUser("empB", "employee", companyY, { dept: "営業部" });
    empC = await makeUser("empC", "employee", companyX, { dept: "品質保証部" });
    jimuX = await makeUser("jimuX", "jimu", companyX, { attested: true });
    jimuX0 = await makeUser("jimuX0", "jimu", companyX, { attested: false });
    jimuY = await makeUser("jimuY", "jimu", companyY, { attested: true });
    compX = await makeUser("compX", "company", companyX);
    office = await makeUser("office", "office", null);

    // 企業Yの結果(empB・service roleでシード)
    await admin.from("results").insert({
      user_id: empB.id,
      company_id: companyY,
      dept: "営業部",
      fiscal_year: FY,
      answers: {},
      score_a: 30,
      score_b: 50,
      score_c: 15,
      score_d: 4,
      high_stress: false,
      consent: false,
    });

    // 企業Xの同意あり結果(empC・service roleでシード)
    await admin.from("results").insert({
      user_id: empC.id,
      company_id: companyX,
      dept: "品質保証部",
      fiscal_year: FY,
      answers: {},
      score_a: 30,
      score_b: 50,
      score_c: 15,
      score_d: 4,
      high_stress: false,
      consent: true,
    });
  }, 300_000);

  afterAll(async () => {
    if (!hasEnv) return;
    for (const t of ["interview_requests", "results", "access_logs"]) {
      await admin.from(t).delete().in("company_id", createdCompanyIds);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
    await admin.from("companies").delete().in("id", createdCompanyIds);
  }, 300_000);

  it("1. 従業員A(企業X)が受検→本人に結果表示、同年度2回目はブロック", async () => {
    const scores = { score_a: 60, score_b: 90, score_c: 30, score_d: 4 };
    const { error } = await empA.client.from("results").insert({
      user_id: empA.id,
      company_id: companyX,
      dept: "製造部",
      fiscal_year: FY,
      answers: highStressAnswers(),
      ...scores,
      high_stress: true,
      consent: false,
    });
    expect(error).toBeNull();

    // 本人に結果が見える
    const { data: mine } = await empA.client.from("results").select("*");
    expect(mine).toHaveLength(1);
    expect(mine![0].score_b).toBe(90);

    // 同年度2回目は unique 制約(23505)でブロック
    const { error: dup } = await empA.client.from("results").insert({
      user_id: empA.id,
      company_id: companyX,
      dept: "製造部",
      fiscal_year: FY,
      answers: highStressAnswers(),
      ...scores,
      high_stress: true,
      consent: false,
    });
    expect(dup).not.toBeNull();
    expect(dup!.code).toBe("23505");
  });

  it("2. 高ストレスの従業員Aが申出→通知先は企業Xのjimu+office、企業Yのjimuは含まれない", async () => {
    const { data: mine } = await empA.client.from("results").select("id").limit(1);
    const { error } = await empA.client.from("interview_requests").insert({
      result_id: mine![0].id,
      user_id: empA.id,
      company_id: companyX,
      message: "テスト申出",
      preferred: "平日午後",
    });
    expect(error).toBeNull();

    // Edge Function notify-interview と同一の通知先選定クエリを検証
    const { data: recipients } = await admin
      .from("profiles")
      .select("user_id, role, company_id")
      .or(`role.eq.office,and(role.eq.jimu,company_id.eq.${companyX})`);
    const ids = (recipients ?? []).map((r) => r.user_id);
    expect(ids).toContain(jimuX.id);
    expect(ids).toContain(office.id);
    expect(ids).not.toContain(jimuY.id);
    expect(ids).not.toContain(compX.id);
    expect(ids).not.toContain(empA.id);

    // 申出はトリガーによりアクセスログに自動記録される
    const { data: logs } = await admin
      .from("access_logs")
      .select("*")
      .eq("company_id", companyX)
      .eq("action", "interview_request_created");
    expect((logs ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("3. 企業Xのjimu(誓約済)は企業Xの全結果が見え、企業Yの結果は0件。未誓約jimuは0件", async () => {
    const { data: xRows } = await jimuX.client.from("results").select("*");
    // 企業Xの結果(empA + empC)が見える
    expect((xRows ?? []).length).toBe(2);
    expect((xRows ?? []).every((r) => r.company_id === companyX)).toBe(true);

    // 企業Yのデータは明示的に要求しても0件(RLS)
    const { data: yRows } = await jimuX.client.from("results").select("*").eq("company_id", companyY);
    expect(yRows).toHaveLength(0);

    // 企業YのjimuからはXの結果が0件
    const { data: fromY } = await jimuY.client.from("results").select("*").eq("company_id", companyX);
    expect(fromY).toHaveLength(0);

    // 未誓約のjimuは自社結果も0件
    const { data: unattested } = await jimuX0.client.from("results").select("*");
    expect(unattested).toHaveLength(0);
  });

  it("4. 企業Xのcompanyは同意あり結果のみ+集団分析のみ(他社の分析は拒否)", async () => {
    const { data: rows } = await compX.client.from("results").select("*");
    expect((rows ?? []).length).toBe(1); // empC(同意あり)のみ。empA(同意なし)は見えない
    expect(rows![0].consent).toBe(true);
    expect(rows![0].user_id).toBe(empC.id);

    // 氏名付きRPC(consented_results)も同意分のみ
    const { data: named, error: nErr } = await compX.client.rpc("consented_results", {
      target_company: companyX,
      target_year: FY,
    });
    expect(nErr).toBeNull();
    expect((named ?? []).length).toBe(1);

    // 自社の集団分析は呼べる(10名未満なので0行だがエラーにはならない)
    const { error: gaErr } = await compX.client.rpc("group_analysis", {
      target_company: companyX,
      target_year: FY,
    });
    expect(gaErr).toBeNull();

    // 他社(企業Y)の集団分析は permission denied
    const { error: gaY } = await compX.client.rpc("group_analysis", {
      target_company: companyY,
      target_year: FY,
    });
    expect(gaY).not.toBeNull();
  });

  it("5. 9名の部署は集団分析に出ず、10名の部署は出る", async () => {
    // FY_OLD(隔離年度)に 9名部署 + 10名部署 をシード
    const seeds: { dept: string; count: number }[] = [
      { dept: "九名部署", count: 9 },
      { dept: "十名部署", count: 10 },
    ];
    for (const s of seeds) {
      for (let i = 0; i < s.count; i++) {
        const { data, error } = await admin.auth.admin.createUser({
          email: `sc-test-${run}-${s.dept === "九名部署" ? "n9" : "n10"}-${i}@example.com`,
          password: PW,
          email_confirm: true,
        });
        if (error) throw error;
        createdUserIds.push(data.user.id);
        await admin.from("profiles").insert({
          user_id: data.user.id,
          role: "employee",
          name: `シード${s.dept}${i}`,
          company_id: companyX,
          dept: s.dept,
        });
        const { error: rErr } = await admin.from("results").insert({
          user_id: data.user.id,
          company_id: companyX,
          dept: s.dept,
          fiscal_year: FY_OLD,
          answers: {},
          score_a: 40,
          score_b: 60,
          score_c: 20,
          score_d: 4,
          high_stress: i === 0,
          consent: false,
        });
        if (rErr) throw rErr;
      }
    }

    const { data: ga, error } = await office.client.rpc("group_analysis", {
      target_company: companyX,
      target_year: FY_OLD,
    });
    expect(error).toBeNull();
    const depts = (ga ?? []).map((r: { dept: string }) => r.dept);
    expect(depts).toContain("十名部署");
    expect(depts).not.toContain("九名部署");
    const ten = (ga ?? []).find((r: { dept: string }) => r.dept === "十名部署");
    expect(Number(ten.n)).toBe(10);
  }, 300_000);

  it("6. CSV出力操作がアクセスログに残り、officeのみ閲覧できる", async () => {
    // jimuXがCSV出力ログを記録(フロントの export ボタンと同じRPC)
    const { error } = await jimuX.client.rpc("log_access", {
      p_action: "export_csv",
      p_target: `テスト企業X-${run}/${FY}`,
      p_company: companyX,
    });
    expect(error).toBeNull();

    // officeはログを閲覧できる
    const { data: logs } = await office.client
      .from("access_logs")
      .select("*")
      .eq("company_id", companyX)
      .eq("action", "export_csv");
    expect((logs ?? []).length).toBeGreaterThanOrEqual(1);

    // 従業員・jimuはログを閲覧できない(0件)
    const { data: byEmp } = await empA.client.from("access_logs").select("*");
    expect(byEmp).toHaveLength(0);
    const { data: byJimu } = await jimuX.client.from("access_logs").select("*");
    expect(byJimu).toHaveLength(0);
  });

  it("セキュリティ: 結果のスコア改ざん・削除は不可、consentのみ本人更新可", async () => {
    const { data: mine } = await empA.client.from("results").select("id, score_b, consent").limit(1);
    const id = mine![0].id;

    // score_b の更新は列権限で拒否される
    const { error: updErr } = await empA.client.from("results").update({ score_b: 1 }).eq("id", id);
    expect(updErr).not.toBeNull();

    // consent の更新は可能(同意の追加・撤回)
    const { error: cErr } = await empA.client.from("results").update({ consent: true }).eq("id", id);
    expect(cErr).toBeNull();
    const { data: after } = await empA.client.from("results").select("consent").eq("id", id).single();
    expect(after!.consent).toBe(true);

    // 削除はRLSポリシーがないため0件(行が残る)
    await empA.client.from("results").delete().eq("id", id);
    const { data: still } = await admin.from("results").select("id").eq("id", id);
    expect(still).toHaveLength(1);
  });

  it("セキュリティ: 自分のroleを昇格できない(列権限)", async () => {
    const { error } = await empA.client
      .from("profiles")
      .update({ role: "office" })
      .eq("user_id", empA.id);
    expect(error).not.toBeNull();

    const { data: p } = await admin.from("profiles").select("role").eq("user_id", empA.id).single();
    expect(p!.role).toBe("employee");
  });
});

describe.skipIf(hasEnv)("受け入れテスト(環境変数なし)", () => {
  it.skip("SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY を設定して実行してください", () => {});
});
