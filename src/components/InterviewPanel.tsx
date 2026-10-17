"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { InterviewRequest, Profile, STATUS_LABEL } from "@/lib/types";
import { logAccess } from "@/lib/log";
import { LoadingCard } from "@/components/LoadingCard";
import { fiscalYearOf, interviewDoctorLabel, jstDate } from "@/lib/plan";
import { getFiscalYear } from "@/lib/fiscal";
import { IntakeReview, riskTone, type IntakeRecord } from "@/components/IntakeReview";
import { RISK_LABEL } from "@/lib/intake";

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
  isOffice = false,
}: {
  companyId: string;
  companyName: string;
  isOffice?: boolean; // 実施者(医師)の画面: 事前ヒアリング(AI)の要約・返信を表示する(会社の担当者には出さない)
}) {
  const [rows, setRows] = useState<InterviewRequest[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [err, setErr] = useState<string | null>(null);
  // Web申込の企業: 年度ごとの面接指導の担当(どの医師に申出が届くか)
  const [plans, setPlans] = useState<{ fiscal_year: number; interview_option: string | null }[] | null>(null);
  const [intakes, setIntakes] = useState<Record<string, IntakeRecord>>({});
  const [openIntake, setOpenIntake] = useState<string | null>(null);

  const supabase = createClient();

  const reload = useCallback(async () => {
    const [{ data: irs, error: e1 }, { data: ps }, { data: co }, { data: eps }] = await Promise.all([
      supabase
        .from("interview_requests")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, name, emp_id, dept").eq("company_id", companyId),
      supabase.from("companies").select("web_signup").eq("id", companyId).maybeSingle(),
      supabase.from("exam_plans").select("fiscal_year, interview_option").eq("company_id", companyId).order("fiscal_year", { ascending: false }),
    ]);
    const web = Boolean((co as { web_signup?: boolean } | null)?.web_signup);
    if (isOffice) {
      const { data: ins } = await supabase
        .from("interview_intakes")
        .select("id, request_id, company_id, status, risk_level, messages, summary, reply_draft, reply, reply_sent_at")
        .eq("company_id", companyId);
      const map: Record<string, IntakeRecord> = {};
      ((ins as IntakeRecord[] | null) ?? []).forEach((i) => (map[i.request_id] = i));
      setIntakes(map);
    }
    setPlans(web ? ((eps as { fiscal_year: number; interview_option: string | null }[] | null) ?? []) : null);
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

  if (rows === null) return <LoadingCard />;

  // 申出の年度の担当(その年度の申込がなければ直近の年度)
  const optionOf = (createdAt: string): string | null =>
    plans?.find((p) => p.fiscal_year <= fiscalYearOf(jstDate(createdAt)))?.interview_option ?? null;
  const currentOption = plans ? (plans.find((p) => p.fiscal_year <= getFiscalYear())?.interview_option ?? null) : null;

  return (
    <Card>
      <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 12px" }}>
        <span style={{ color: brand.tealDark }}>{companyName}</span> 面接指導の申出一覧
      </h3>
      {plans && (
        <div style={{ fontSize: 13, color: brand.ink, background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 8, padding: "10px 12px", lineHeight: 1.7, marginBottom: 12 }}>
          医師面接指導の担当: <strong>{interviewDoctorLabel(currentOption)}</strong>
          <div style={{ fontSize: 12, color: "#5B6B6A" }}>
            {currentOption === "mestate"
              ? "申出は、うえまつ産業医事務所(実施者)と会社の担当者に通知されます。日程は当事務所からご連絡します。"
              : currentOption === "sanpo"
                ? "申出は会社の担当者にだけ通知されます。最寄りの地域産業保健センターに面接指導をお申し込みください。"
                : "申出は会社の担当者にだけ通知されます。自社の産業医など、会社で手配した医師と日程を調整してください。"}
            担当の変更は、メニュー画面の受検期間の欄からできます。
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["申出日", "氏名", "部署", "相談したいこと・連絡事項", ...(plans ? ["担当医"] : []), ...(isOffice ? ["事前ヒアリング"] : []), "状況", "操作"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
              <tr style={{ borderBottom: `1px solid ${brand.line}` }}>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {new Date(r.created_at).toLocaleDateString("ja-JP")}
                </td>
                {/* 氏名は折り返さず1行に収める(部署・相談内容の列を折り返す) */}
                <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink, whiteSpace: "nowrap" }}>
                  {people[r.user_id]?.name ?? "(不明)"}
                </td>
                <td style={{ padding: "9px 10px", maxWidth: 220 }}>{people[r.user_id]?.dept ?? ""}</td>
                <td style={{ padding: "9px 10px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[r.message, r.preferred].filter(Boolean).join(" / ") || "—"}
                </td>
                {plans && <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{interviewDoctorLabel(optionOf(r.created_at))}</td>}
                {isOffice && (
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    {intakes[r.id] ? (
                      <button
                        onClick={() => setOpenIntake(openIntake === r.id ? null : r.id)}
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}
                      >
                        <Badge tone={riskTone(intakes[r.id].risk_level)}>
                          {intakes[r.id].status === "in_progress" ? "聞き取り中" : intakes[r.id].reply_sent_at ? "返信済み" : "要約あり"}・{RISK_LABEL[intakes[r.id].risk_level]}
                        </Badge>
                        <span style={{ color: brand.tealDark, fontSize: 12, fontWeight: 700 }}>{openIntake === r.id ? "閉じる" : "確認"}</span>
                      </button>
                    ) : (
                      <span style={{ color: "#8A9694" }}>—</span>
                    )}
                  </td>
                )}
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
              {isOffice && openIntake === r.id && intakes[r.id] && (
                <tr>
                  <td colSpan={9} style={{ padding: "8px 10px 14px" }}>
                    <IntakeReview intake={intakes[r.id]} personName={people[r.user_id]?.name ?? "(不明)"} onChanged={reload} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
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
