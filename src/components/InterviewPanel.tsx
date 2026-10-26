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
import { postJson } from "@/lib/api-client";
import { InterviewScheduleEditor, scheduleSummary } from "@/components/InterviewScheduleEditor";

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
  isOffice?: boolean; // 実施者(医師)の画面: 事前問診(AI)の要約・返信を表示する(会社の担当者には出さない)
}) {
  const [rows, setRows] = useState<InterviewRequest[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [err, setErr] = useState<string | null>(null);
  // Web申込の企業: 年度ごとの面接指導の担当(どの医師に申出が届くか)
  const [plans, setPlans] = useState<{ fiscal_year: number; interview_option: string | null }[] | null>(null);
  const [intakes, setIntakes] = useState<Record<string, IntakeRecord>>({});
  const [openIntake, setOpenIntake] = useState<string | null>(null);
  // 事前問診の案内・催促の記録(実施者のみ)
  const [invites, setInvites] = useState<Record<string, { last_sent_at: string | null; sent_count: number; declined_at: string | null }>>({});
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  // 会社の担当者(実施事務従事者)向け: 医師が共有した面談前の情報
  const [shares, setShares] = useState<Record<string, { company_share: string; company_shared_at: string }>>({});
  const [openShare, setOpenShare] = useState<string | null>(null);
  // 日程調整(実施者): 企業の産業医面談ルームのURLと、開いている申出の日程の編集
  const [meetRoom, setMeetRoom] = useState<string | null>(null);
  const [kenkoRoom, setKenkoRoom] = useState<string | null>(null); // 健康管理Webの面談ルーム(未登録のときに使う)
  const [roomInput, setRoomInput] = useState("");
  const [roomMsg, setRoomMsg] = useState<string | null>(null);
  const [openSchedule, setOpenSchedule] = useState<string | null>(null);

  const supabase = createClient();

  const reload = useCallback(async () => {
    const [{ data: irs, error: e1 }, { data: ps }, { data: co }, { data: eps }] = await Promise.all([
      supabase
        .from("interview_requests")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, name, emp_id, dept").eq("company_id", companyId),
      supabase.from("companies").select("web_signup, meet_room_url").eq("id", companyId).maybeSingle(),
      supabase.from("exam_plans").select("fiscal_year, interview_option").eq("company_id", companyId).order("fiscal_year", { ascending: false }),
    ]);
    const web = Boolean((co as { web_signup?: boolean } | null)?.web_signup);
    const room = ((co as { meet_room_url?: string | null } | null)?.meet_room_url ?? null) || null;
    setMeetRoom(room);
    setRoomInput(room ?? "");
    if (isOffice) {
      // 健康管理Webを使っていない環境では表がなく、エラーになるので無視する
      const { data: hr, error: hrErr } = await supabase.from("hm_meet_rooms").select("meeting_uri, enabled").eq("company_id", companyId).maybeSingle();
      const uri = !hrErr && hr?.enabled ? ((hr.meeting_uri as string | null) ?? "").trim() : "";
      setKenkoRoom(uri || null);
    }
    if (isOffice) {
      const { data: ins } = await supabase
        .from("interview_intakes")
        .select("*")
        .eq("company_id", companyId);
      const map: Record<string, IntakeRecord> = {};
      ((ins as IntakeRecord[] | null) ?? []).forEach((i) => (map[i.request_id] = i));
      setIntakes(map);
      const { data: invs } = await supabase
        .from("interview_intake_invites")
        .select("request_id, last_sent_at, sent_count, declined_at")
        .eq("company_id", companyId);
      const imap: Record<string, { last_sent_at: string | null; sent_count: number; declined_at: string | null }> = {};
      ((invs as { request_id: string; last_sent_at: string | null; sent_count: number; declined_at: string | null }[] | null) ?? []).forEach(
        (i) => (imap[i.request_id] = i)
      );
      setInvites(imap);
    } else {
      const { data: sh } = await supabase.rpc("intake_company_shares", { p_company: companyId });
      const smap: Record<string, { company_share: string; company_shared_at: string }> = {};
      ((sh as { request_id: string; company_share: string; company_shared_at: string }[] | null) ?? []).forEach((x) => (smap[x.request_id] = x));
      setShares(smap);
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

  // 事前問診の案内を送る(この機能の前に申出をした人への案内・個別の再送)
  const sendInvites = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length}件の申出者に、事前問診の案内メールを送りますか？`)) return;
    setInviting(true);
    setInviteMsg(null);
    const { ok, json } = await postJson<{ sent: number; skipped: string[] }>("/api/intake/invite", { requestIds: ids });
    setInviting(false);
    if (!ok) return setInviteMsg(json.error ?? "送れませんでした");
    const skipped = (json.skipped ?? []).length;
    setInviteMsg(`${json.sent}件に案内を送りました。${skipped > 0 ? `送らなかった申出: ${skipped}件(${[...new Set(json.skipped)].join("・")})` : ""}`);
    reload();
  };
  // まだ一度も案内していない、受付中の申出(事前問診未開始・「受けない」未選択)
  const notInvited = isOffice
    ? rows.filter((r) => (r.status === "pending" || r.status === "scheduled") && !intakes[r.id] && !invites[r.id]?.sent_count && !invites[r.id]?.declined_at)
    : [];

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
      {isOffice && (
        <div style={{ fontSize: 13, color: brand.ink, background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 8, padding: "10px 12px", lineHeight: 1.7, marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>この企業の産業医面談ルーム(Google Meet)のURL</div>
          <div style={{ fontSize: 12, color: "#5B6B6A", marginBottom: 6 }}>
            オンライン面談の日時が確定したとき、このURLを本人に案内します。Google Meet で会議を作り、そのリンクを貼り付けてください(企業ごとに1つ・使い回し)。
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              style={{ flex: 1, minWidth: 240, fontSize: 13, padding: "6px 8px", border: `1px solid ${brand.line}`, borderRadius: 6 }}
            />
            <button
              onClick={async () => {
                setRoomMsg(null);
                const { ok, json } = await postJson<{ url?: string | null; error?: string }>("/api/interview/room", { companyId, url: roomInput });
                if (!ok) return setRoomMsg(json.error ?? "保存できませんでした");
                setMeetRoom(json.url ?? null);
                setRoomMsg(json.url ? "保存しました。" : "URLを消しました。");
              }}
              disabled={(roomInput.trim() || "") === (meetRoom ?? "")}
              style={{ background: "#fff", border: `1px solid ${brand.teal}`, color: brand.tealDark, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              保存
            </button>
            {roomMsg && <span style={{ fontSize: 12, color: brand.tealDark }}>{roomMsg}</span>}
            {!meetRoom && !roomMsg && kenkoRoom && (
              <span style={{ fontSize: 12, color: brand.tealDark }}>未登録のため、健康管理Webの産業医面談ルーム({kenkoRoom})を使います</span>
            )}
            {!meetRoom && !roomMsg && !kenkoRoom && <span style={{ fontSize: 12, color: "#8A6B2E" }}>未登録(オンラインの候補日時を出す前に登録してください)</span>}
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>}
      {isOffice && (notInvited.length > 0 || inviteMsg) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          {notInvited.length > 0 && (
            <button
              onClick={() => sendInvites(notInvited.map((r) => r.id))}
              disabled={inviting}
              style={{ background: "#fff", border: `1px solid ${brand.teal}`, color: brand.tealDark, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {inviting ? "送っています…" : `事前問診の案内をまとめて送る(未案内 ${notInvited.length}件)`}
            </button>
          )}
          {inviteMsg && <span style={{ fontSize: 13, color: brand.tealDark }}>{inviteMsg}</span>}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["申出日", "氏名", "部署", "相談したいこと・連絡事項", ...(plans ? ["担当医"] : []), ...(isOffice ? ["事前問診"] : ["医師からの共有"]), "状況", "操作"].map((h) => (
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
                {!isOffice && (
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    {shares[r.id] ? (
                      <button
                        onClick={() => setOpenShare(openShare === r.id ? null : r.id)}
                        style={{ background: "none", border: 0, padding: 0, color: brand.tealDark, fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                      >
                        {openShare === r.id ? "閉じる" : "共有あり・見る"}
                      </button>
                    ) : (
                      <span style={{ color: "#8A9694" }}>—</span>
                    )}
                  </td>
                )}
                {isOffice && (
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    {intakes[r.id] ? (
                      <button
                        onClick={() => setOpenIntake(openIntake === r.id ? null : r.id)}
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}
                      >
                        <Badge tone={riskTone(intakes[r.id].risk_level)}>
                          {intakes[r.id].status === "in_progress"
                            ? intakes[r.id].summary
                              ? "回答途中・要約あり"
                              : "回答途中"
                            : intakes[r.id].reply_sent_at
                              ? "返信済み"
                              : "要約あり"}・{RISK_LABEL[intakes[r.id].risk_level]}
                        </Badge>
                        <span style={{ color: brand.tealDark, fontSize: 12, fontWeight: 700 }}>{openIntake === r.id ? "閉じる" : "確認"}</span>
                      </button>
                    ) : (
                      <div style={{ fontSize: 12, color: "#5B6B6A", lineHeight: 1.6 }}>
                        {invites[r.id]?.declined_at
                          ? "本人が「受けない」を選択"
                          : invites[r.id]?.sent_count
                            ? `未実施(案内済み${invites[r.id].sent_count > 1 ? `・催促${invites[r.id].sent_count - 1}回` : ""})`
                            : "未案内"}
                        {(r.status === "pending" || r.status === "scheduled") && !invites[r.id]?.declined_at && (
                          <button
                            onClick={() => sendInvites([r.id])}
                            disabled={inviting}
                            style={{ display: "block", background: "none", border: 0, padding: 0, color: brand.tealDark, fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                          >
                            {invites[r.id]?.sent_count ? "案内を再送" : "案内を送る"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
                <td style={{ padding: "9px 10px" }}>
                  <Badge tone={r.status === "pending" ? "orange" : r.status === "done" ? "teal" : "gray"}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                  {scheduleSummary(r) && <div style={{ fontSize: 12, color: brand.ink, marginTop: 4, lineHeight: 1.5 }}>{scheduleSummary(r)}</div>}
                  {!isOffice && r.status === "scheduled" && r.schedule_mode === "visit" && (
                    <div style={{ fontSize: 11.5, color: "#8A6B2E", marginTop: 2 }}>当日の時間と場所を本人に伝えてください</div>
                  )}
                </td>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {isOffice && (r.status === "pending" || r.status === "scheduled") && (
                    <button
                      onClick={() => setOpenSchedule(openSchedule === r.id ? null : r.id)}
                      style={{
                        background: openSchedule === r.id ? brand.teal : "#fff",
                        border: `1px solid ${brand.teal}`,
                        color: openSchedule === r.id ? "#fff" : brand.tealDark,
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        marginRight: 6,
                      }}
                    >
                      {openSchedule === r.id ? "日程を閉じる" : r.scheduled_at || r.slots_offered_at ? "日程" : "日程を決める"}
                    </button>
                  )}
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
              {!isOffice && openShare === r.id && shares[r.id] && (
                <tr>
                  <td colSpan={9} style={{ padding: "8px 10px 14px" }}>
                    <div style={{ background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>
                        医師からの共有({new Date(shares[r.id].company_shared_at).toLocaleDateString("ja-JP")})
                      </div>
                      <div style={{ fontSize: 13.5, color: "#2C3B39", lineHeight: 1.8, whiteSpace: "pre-wrap", marginTop: 6 }}>{shares[r.id].company_share}</div>
                      <div style={{ fontSize: 12, color: "#8A9694", marginTop: 6 }}>
                        本人の同意を得た範囲で、職場での配慮の準備のために共有された内容です。実施事務従事者として守秘義務があります。
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {isOffice && openSchedule === r.id && (
                <tr>
                  <td colSpan={9} style={{ padding: "8px 10px 14px" }}>
                    <InterviewScheduleEditor request={r} meetRoomUrl={meetRoom ?? kenkoRoom} onChanged={reload} />
                  </td>
                </tr>
              )}
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
