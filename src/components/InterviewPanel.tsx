"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { InterviewRequest, Profile, STATUS_LABEL } from "@/lib/types";
import { logAccess } from "@/lib/log";

const NEXT_STATUS: Record<string, InterviewRequest["status"][]> = {
  pending: ["scheduled", "cancelled"],
  scheduled: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

// office / jimu 共通: 面接指導申出一覧(状態更新)
export function InterviewPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [rows, setRows] = useState<InterviewRequest[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [err, setErr] = useState<string | null>(null);

  const supabase = createClient();

  const reload = useCallback(async () => {
    const [{ data: irs, error: e1 }, { data: ps }] = await Promise.all([
      supabase
        .from("interview_requests")
        .select("*")
        .eq("company_id", companyId)
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
    setRows((irs as InterviewRequest[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    reload().then(() => {
      logAccess(supabase, "view_interview", companyName, companyId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const updateStatus = async (r: InterviewRequest, status: InterviewRequest["status"]) => {
    const { error } = await supabase.from("interview_requests").update({ status }).eq("id", r.id);
    if (error) {
      setErr(error.message);
      return;
    }
    reload();
  };

  if (rows === null) return <Card>読み込み中…</Card>;

  return (
    <Card>
      <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 12px" }}>面接指導の申出一覧</h3>
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["申出日", "氏名", "部署", "連絡事項", "希望日時", "状況", "操作"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {new Date(r.created_at).toLocaleDateString("ja-JP")}
                </td>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>
                  {people[r.user_id]?.name ?? "(不明)"}
                </td>
                <td style={{ padding: "9px 10px" }}>{people[r.user_id]?.dept ?? ""}</td>
                <td style={{ padding: "9px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.message ?? "—"}
                </td>
                <td style={{ padding: "9px 10px" }}>{r.preferred ?? "—"}</td>
                <td style={{ padding: "9px 10px" }}>
                  <Badge tone={r.status === "pending" ? "orange" : r.status === "done" ? "teal" : "gray"}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </td>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {NEXT_STATUS[r.status].map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(r, s)}
                      style={{
                        background: "#fff",
                        border: `1px solid ${brand.teal}`,
                        color: brand.tealDark,
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        marginRight: 6,
                      }}
                    >
                      {STATUS_LABEL[s]}にする
                    </button>
                  ))}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                  申出はまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
