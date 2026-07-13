"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Profile, ROLE_LABEL, Role } from "@/lib/types";

type LogRow = {
  id: number;
  user_id: string;
  role: string | null;
  action: string;
  target: string | null;
  company_id: string | null;
  created_at: string;
};

const ACTION_LABEL: Record<string, string> = {
  view_results: "結果一覧の表示",
  view_result_detail: "個人結果詳細の表示",
  export_csv: "CSV出力",
  view_interview: "申出一覧の表示",
  invite_user: "ユーザー招待",
  interview_request_created: "面接指導の申出",
  delete_result_for_retake: "結果削除(再受験対応)",
  view_group_report: "集団分析報告書の表示",
};

export function AccessLogsPanel() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const supabase = createClient();

  const load = async () => {
    let q = supabase.from("access_logs").select("*").order("created_at", { ascending: false }).limit(300);
    if (from) q = q.gte("created_at", `${from}T00:00:00+09:00`);
    if (to) q = q.lte("created_at", `${to}T23:59:59+09:00`);
    const [{ data: logs }, { data: ps }] = await Promise.all([q, supabase.from("profiles").select("*")]);
    const map: Record<string, Profile> = {};
    ((ps as Profile[]) ?? []).forEach((p) => (map[p.user_id] = p));
    setPeople(map);
    setRows((logs as LogRow[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows === null) return <Card>読み込み中…</Card>;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontSize: 17, color: brand.ink, margin: 0 }}>アクセスログ(最新300件)</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${brand.line}`, borderRadius: 8 }} />
          〜
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${brand.line}`, borderRadius: 8 }} />
          <Btn tone="ghost" onClick={load} style={{ padding: "7px 14px", fontSize: 13 }}>
            絞り込み
          </Btn>
        </div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["日時", "ユーザー", "ロール", "操作", "対象"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  {new Date(r.created_at).toLocaleString("ja-JP")}
                </td>
                <td style={{ padding: "8px 10px", fontWeight: 700, color: brand.ink }}>
                  {people[r.user_id]?.name ?? r.user_id.slice(0, 8)}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {r.role && r.role in ROLE_LABEL ? ROLE_LABEL[r.role as Role] : r.role ?? ""}
                </td>
                <td style={{ padding: "8px 10px" }}>{ACTION_LABEL[r.action] ?? r.action}</td>
                <td style={{ padding: "8px 10px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.target ?? ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                  ログはありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#8A9694", marginTop: 10 }}>ログは削除できません(監査証跡として保全されます)。</p>
    </Card>
  );
}
