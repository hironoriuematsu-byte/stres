import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

type DeptStat = { department: string; n: number; high_count: number; avg_b: number | null };
type ConsentedRow = {
  id: string;
  taken_at: string;
  full_name: string;
  employee_no: string;
  department: string;
  high_stress: boolean;
};

export default async function CompanyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/company");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "company_hr") {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>アクセス権がありません</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7 }}>
          このページは企業人事担当者(company_hr)ロールのアカウントのみ閲覧できます。ロールの付与については管理者にお問い合わせください。
        </p>
      </Card>
    );
  }

  const [{ data: deptStats }, { data: consentedRows }] = await Promise.all([
    supabase.rpc("get_department_stats"),
    supabase
      .from("results")
      .select("id, taken_at, full_name, employee_no, department, high_stress")
      .eq("consent_to_company", true)
      .order("taken_at", { ascending: false }),
  ]);

  const byDept = (deptStats as DeptStat[]) ?? [];
  const consented = (consentedRows as ConsentedRow[]) ?? [];
  const totalN = byDept.reduce((s, d) => s + Number(d.n), 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge tone="gray">企業担当者ビュー</Badge>
            <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 2px" }}>集団分析(部署別)</h2>
            <p style={{ fontSize: 13, color: "#5B6B6A", margin: 0 }}>個人が特定されない集計情報です。受検合計 {totalN} 名。</p>
          </div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                {["部署", "受検者数", "高ストレス者数", "高ストレス率", "B領域平均点"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 10px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byDept.map((d) => (
                <tr key={d.department} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>
                    {d.department}
                    {Number(d.n) < 10 && <span style={{ color: brand.orange, fontWeight: 400 }}>(10名未満※)</span>}
                  </td>
                  <td style={{ padding: "9px 10px" }}>{d.n}</td>
                  <td style={{ padding: "9px 10px" }}>{d.high_count}</td>
                  <td style={{ padding: "9px 10px" }}>{Math.round((Number(d.high_count) / Number(d.n)) * 100)}%</td>
                  <td style={{ padding: "9px 10px" }}>{d.avg_b != null ? Number(d.avg_b).toFixed(1) : "—"}</td>
                </tr>
              ))}
              {byDept.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                    まだ受検データがありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#8A9694", marginTop: 12, lineHeight: 1.7 }}>
          ※ 実運用では10名未満の集団の集計結果は、個人特定のおそれがあるため原則として事業者へ提供しません(プロトタイプのため表示しています)。
        </p>
      </Card>

      <Card>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 4px" }}>本人同意のある個人結果({consented.length} 件)</h2>
        <p style={{ fontSize: 13, color: "#5B6B6A", margin: "0 0 12px", lineHeight: 1.7 }}>
          労働安全衛生法第66条の10に基づき、本人の同意がある結果のみ表示されます。同意のない結果はここには一切表示されません。
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                {["実施日", "氏名", "社員番号", "部署", "判定"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 10px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consented.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <td style={{ padding: "9px 10px" }}>{new Date(r.taken_at).toLocaleDateString("ja-JP")}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>{r.full_name}</td>
                  <td style={{ padding: "9px 10px" }}>{r.employee_no}</td>
                  <td style={{ padding: "9px 10px" }}>{r.department}</td>
                  <td style={{ padding: "9px 10px" }}>
                    {r.high_stress ? <Badge tone="red">高ストレス</Badge> : <Badge tone="gray">高ストレスに該当せず</Badge>}
                  </td>
                </tr>
              ))}
              {consented.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                    同意のある結果はまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
