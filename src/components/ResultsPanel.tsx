"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Profile, ResultRow } from "@/lib/types";
import { downloadCsv, resultsCsv } from "@/lib/csv";
import { logAccess } from "@/lib/log";
import { getFiscalYear } from "@/lib/fiscal";

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
  const [otherYears, setOtherYears] = useState<Record<number, number>>({});
  const [interviewResultIds, setInterviewResultIds] = useState<Set<string>>(new Set());
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deptEdit, setDeptEdit] = useState("");
  const [deptBusy, setDeptBusy] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    setRows(null);
    setErr(null);
    (async () => {
      const [{ data: rs, error: e1 }, { data: ps }, { data: allYears }, { data: irs }] = await Promise.all([
        supabase
          .from("results")
          .select("*")
          .eq("company_id", companyId)
          .eq("fiscal_year", fiscalYear)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("company_id", companyId),
        // 年度の取り違えに気づけるよう、この企業のデータがある年度を集計する
        supabase.from("results").select("fiscal_year").eq("company_id", companyId),
        // CSVサマリー用: 面接指導の申出(結果IDで年度を突き合わせる)
        supabase.from("interview_requests").select("result_id").eq("company_id", companyId),
      ]);
      if (e1) {
        setErr(e1.message);
        setRows([]);
        return;
      }
      const map: Record<string, Profile> = {};
      ((ps as Profile[]) ?? []).forEach((p) => (map[p.user_id] = p));
      setPeople(map);
      const yearCounts: Record<number, number> = {};
      ((allYears as { fiscal_year: number }[]) ?? []).forEach((r) => {
        yearCounts[r.fiscal_year] = (yearCounts[r.fiscal_year] ?? 0) + 1;
      });
      setOtherYears(yearCounts);
      setInterviewResultIds(new Set(((irs as { result_id: string }[]) ?? []).map((x) => x.result_id)));
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
      })),
      {
        companyName,
        fiscalYear,
        // 表示中の年度の結果に紐づく申出のみを数える
        interviewCount: rows.filter((r) => interviewResultIds.has(r.id)).length,
      }
    );
    downloadCsv(`stresscheck_${companyName}_${fiscalYear}.csv`, content);
    logAccess(supabase, "export_csv", `${companyName}/${fiscalYear}`, companyId);
  };

  const showDetail = (r: ResultRow) => {
    const next = openDetail === r.id ? null : r.id;
    setOpenDetail(next);
    setDeptEdit(r.dept);
    if (next) logAccess(supabase, "view_result_detail", r.id, companyId);
  };

  // 部署名の表記ゆれ修正(集団分析で同一部署として集計できるようにする)
  const saveDept = async (r: ResultRow) => {
    const next = deptEdit.trim();
    if (!next || next === r.dept) return;
    setDeptBusy(true);
    const { error } = await supabase.rpc("update_employee_dept", {
      p_user: r.user_id,
      p_year: r.fiscal_year,
      p_dept: next,
    });
    setDeptBusy(false);
    if (error) {
      alert("部署名を変更できませんでした: " + error.message);
      return;
    }
    setRows((prev) =>
      (prev ?? []).map((x) => (x.user_id === r.user_id && x.fiscal_year === r.fiscal_year ? { ...x, dept: next } : x))
    );
    setPeople((prev) =>
      prev[r.user_id] ? { ...prev, [r.user_id]: { ...prev[r.user_id], dept: next } } : prev
    );
  };

  // 再受験対応: 当年度かつ本人の直近の結果のみ削除可(制約はDB関数側で強制)
  const deleteForRetake = async (r: ResultRow) => {
    const name = people[r.user_id]?.name ?? "(不明)";
    if (
      !confirm(
        `${name} さんの ${r.fiscal_year}年度の結果を削除します。\n\n` +
          "・この操作は元に戻せません(紐づく面接指導の申出も削除されます)\n" +
          "・削除後、本人は同年度内に再受検できます\n" +
          "・削除の操作はアクセスログに記録されます\n\n" +
          "本人からの再受験の申出に基づく削除ですか?"
      )
    ) {
      return;
    }
    const { error } = await supabase.rpc("delete_result_for_retake", { p_result: r.id });
    if (error) {
      alert("削除できませんでした: " + error.message);
      return;
    }
    setOpenDetail(null);
    setRows((prev) => (prev ?? []).filter((x) => x.id !== r.id));
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
      {rows.length === 0 && Object.keys(otherYears).length > 0 && (
        <div
          style={{
            fontSize: 13,
            color: "#8A6B2E",
            background: "#FBF3E3",
            border: "1px solid #EFD9A8",
            borderRadius: 10,
            padding: "10px 14px",
            marginTop: 12,
            lineHeight: 1.7,
          }}
        >
          {fiscalYear}年度のデータはありませんが、この企業には別の年度のデータがあります:{" "}
          {Object.entries(otherYears)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(([y, n]) => `${y}年度(${n}件)`)
            .join("、")}
          。右上の年度セレクタを切り替えてください。
        </div>
      )}
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
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: brand.ink }}>部署名の修正:</span>
                        <input
                          value={deptEdit}
                          onChange={(e) => setDeptEdit(e.target.value)}
                          placeholder="例: 営業部"
                          style={{
                            padding: "5px 10px",
                            fontSize: 13,
                            border: `1px solid ${brand.line}`,
                            borderRadius: 8,
                            width: 180,
                          }}
                        />
                        <button
                          onClick={() => saveDept(r)}
                          disabled={deptBusy || !deptEdit.trim() || deptEdit.trim() === r.dept}
                          style={{
                            background: "#fff",
                            border: `1px solid ${brand.teal}`,
                            color: brand.tealDark,
                            borderRadius: 8,
                            padding: "5px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {deptBusy ? "変更中…" : "変更を保存"}
                        </button>
                        <span style={{ fontSize: 11, color: "#8A9694" }}>
                          表記ゆれ(例: 営業/営業部)を統一すると集団分析で同じ部署として集計されます(操作はログに記録されます)
                        </span>
                      </div>
                      {r.fiscal_year === getFiscalYear() && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteForRetake(r);
                          }}
                          style={{
                            marginLeft: 12,
                            background: "#fff",
                            border: "1px solid #D64545",
                            color: "#B02A2A",
                            borderRadius: 8,
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          再受験のため削除
                        </button>
                      )}
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
        行をクリックすると詳細を表示します(詳細の閲覧はアクセスログに記録されます)。結果は5年間保存され、原則削除・改変はできません。例外として、本人から誤回答による再受験の申出があった場合のみ、当年度かつ直近の結果を「再受験のため削除」できます(操作はログに記録されます)。
      </p>
    </Card>
  );
}
