"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Profile, ResultRow } from "@/lib/types";
import { downloadCsv, resultsCsv } from "@/lib/csv";
import { logAccess } from "@/lib/log";

// office / jimu 共通: 結果一覧(高ストレスフィルタ・CSV出力・詳細閲覧ログ)
export function ResultsPanel({
  companyId,
  companyName,
  fiscalYear,
}: {
  companyId: string;
  companyName: string;
  fiscalYear: number;
}) {
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    setRows(null);
    setErr(null);
    (async () => {
      const [{ data: rs, error: e1 }, { data: ps }] = await Promise.all([
        supabase
          .from("results")
          .select("*")
          .eq("company_id", companyId)
          .eq("fiscal_year", fiscalYear)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("company_id", companyId),
      ]);
      if (e1) {
        setErr(e1.message);
        setRows([]);
        return;
      }
      const map: Record<string, Profile> = {};
      ((ps as Profile[]) ?? []).forEach((p) => (map[p.user_id] = p));
      setPeople(map);
      setRows((rs as ResultRow[]) ?? []);
      logAccess(supabase, "view_results", `${companyName}/${fiscalYear}`, companyId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fiscalYear]);

  if (rows === null) return <Card>読み込み中…</Card>;

  const shown = onlyHigh ? rows.filter((r) => r.high_stress) : rows;
  const highCount = rows.filter((r) => r.high_stress).length;

  const exportCsv = () => {
    const content = resultsCsv(
      rows.map((r) => ({
        created_at: r.created_at,
        fiscal_year: r.fiscal_year,
        name: people[r.user_id]?.name ?? "",
        emp_id: people[r.user_id]?.emp_id ?? "",
        dept: r.dept,
        score_a: r.score_a,
        score_b: r.score_b,
        score_c: r.score_c,
        score_d: r.score_d,
        high_stress: r.high_stress,
        consent: r.consent,
      }))
    );
    downloadCsv(`stresscheck_${companyName}_${fiscalYear}.csv`, content);
    logAccess(supabase, "export_csv", `${companyName}/${fiscalYear}`, companyId);
  };

  const showDetail = (r: ResultRow) => {
    const next = openDetail === r.id ? null : r.id;
    setOpenDetail(next);
    if (next) logAccess(supabase, "view_result_detail", r.id, companyId);
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 2px" }}>結果一覧({fiscalYear}年度)</h3>
          <p style={{ fontSize: 13, color: "#5B6B6A", margin: 0 }}>
            受検 {rows.length} 名 / 高ストレス {highCount} 名({rows.length ? Math.round((highCount / rows.length) * 100) : 0}%)
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn tone="ghost" onClick={() => setOnlyHigh(!onlyHigh)} style={{ padding: "8px 14px", fontSize: 13 }}>
            {onlyHigh ? "全員を表示" : "高ストレス者のみ"}
          </Btn>
          <Btn tone="ghost" onClick={exportCsv} style={{ padding: "8px 14px", fontSize: 13 }}>
            CSV出力
          </Btn>
        </div>
      </div>
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 10 }}>{err}</div>}
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["実施日", "氏名", "社員番号", "部署", "A", "B", "C", "判定", "同意"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <>
                <tr
                  key={r.id}
                  onClick={() => showDetail(r)}
                  style={{
                    borderBottom: `1px solid ${brand.line}`,
                    background: r.high_stress ? "#FDF6F6" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    {new Date(r.created_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>
                    {people[r.user_id]?.name ?? "(不明)"}
                  </td>
                  <td style={{ padding: "9px 10px" }}>{people[r.user_id]?.emp_id ?? ""}</td>
                  <td style={{ padding: "9px 10px" }}>{r.dept}</td>
                  <td style={{ padding: "9px 10px" }}>{r.score_a}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: r.score_b >= 77 ? "#B02A2A" : brand.ink }}>
                    {r.score_b}
                  </td>
                  <td style={{ padding: "9px 10px" }}>{r.score_c}</td>
                  <td style={{ padding: "9px 10px" }}>
                    {r.high_stress ? <Badge tone="red">高ストレス</Badge> : <Badge tone="gray">—</Badge>}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    {r.consent ? <Badge>同意あり</Badge> : <Badge tone="gray">同意なし</Badge>}
                  </td>
                </tr>
                {openDetail === r.id && (
                  <tr key={r.id + "_d"}>
                    <td colSpan={9} style={{ padding: "10px 14px", background: "#F4FAF9", fontSize: 13, color: brand.ink, lineHeight: 1.9 }}>
                      <strong>詳細</strong> — A(仕事のストレス要因): {r.score_a}/68、B(心身のストレス反応): {r.score_b}
                      /116(基準77)、C(周囲のサポート): {r.score_c}/36、D(満足度): {r.score_d}/8、A+C: {r.score_a + r.score_c}
                      (基準76・B63以上のとき)。判定: {r.high_stress ? "高ストレス" : "高ストレスに該当せず"}{" "}
                      <a
                        href={`/report/${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: brand.tealDark, fontWeight: 700 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        📄 結果票を開く(印刷・PDF)
                      </a>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                  該当する結果がありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#8A9694", marginTop: 12, lineHeight: 1.7 }}>
        行をクリックすると詳細を表示します(詳細の閲覧はアクセスログに記録されます)。結果は5年間保存され、削除・改変はできません。
      </p>
    </Card>
  );
}
