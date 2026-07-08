"use client";

import { useState } from "react";
import { Badge, Btn, Card, brand } from "@/components/ui";

export type ResultRow = {
  id: string;
  taken_at: string;
  full_name: string;
  employee_no: string;
  department: string;
  score_a: number;
  score_b: number;
  score_c: number;
  score_ac: number;
  high_stress: boolean;
  consent_to_company: boolean;
};

export function OfficeTable({ rows }: { rows: ResultRow[] }) {
  const [onlyHigh, setOnlyHigh] = useState(false);

  const shown = onlyHigh ? rows.filter((r) => r.high_stress) : rows;
  const highCount = rows.filter((r) => r.high_stress).length;

  return (
    <Card style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Badge tone="orange">実施者ビュー</Badge>
          <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 2px" }}>全受検者結果</h2>
          <p style={{ fontSize: 13, color: "#5B6B6A", margin: 0 }}>
            受検 {rows.length} 名 / 高ストレス {highCount} 名({rows.length ? Math.round((highCount / rows.length) * 100) : 0}%)
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn tone="ghost" onClick={() => setOnlyHigh(!onlyHigh)} style={{ padding: "8px 14px", fontSize: 13 }}>
            {onlyHigh ? "全員を表示" : "高ストレス者のみ"}
          </Btn>
        </div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["実施日", "氏名", "社員番号", "部署", "A", "B", "C", "A+C", "判定", "会社提供同意"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${brand.line}`, background: r.high_stress ? "#FDF6F6" : "#fff" }}>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{new Date(r.taken_at).toLocaleDateString("ja-JP")}</td>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>{r.full_name}</td>
                <td style={{ padding: "9px 10px" }}>{r.employee_no}</td>
                <td style={{ padding: "9px 10px" }}>{r.department}</td>
                <td style={{ padding: "9px 10px" }}>{r.score_a}</td>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: r.score_b >= 77 ? "#B02A2A" : brand.ink }}>{r.score_b}</td>
                <td style={{ padding: "9px 10px" }}>{r.score_c}</td>
                <td style={{ padding: "9px 10px" }}>{r.score_ac}</td>
                <td style={{ padding: "9px 10px" }}>
                  {r.high_stress ? <Badge tone="red">高ストレス</Badge> : <Badge tone="gray">—</Badge>}
                </td>
                <td style={{ padding: "9px 10px" }}>
                  {r.consent_to_company ? <Badge>同意あり</Badge> : <Badge tone="gray">同意なし</Badge>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                  該当する結果がありません。受検が完了するとここに表示されます。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#8A9694", marginTop: 14, lineHeight: 1.7 }}>
        実施者は全結果を閲覧できます。高ストレス者には面接指導の申出勧奨を検討してください。結果の保存は5年間が推奨されています(実施者による保存)。
      </p>
    </Card>
  );
}
