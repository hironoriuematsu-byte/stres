"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Profile, ROLE_LABEL, Role } from "@/lib/types";
import { LoadingCard } from "@/components/LoadingCard";
import { hmActionLabel, hmIsView } from "@/lib/hm-log-labels";

// ストレスチェックWebのログ(access_logs)と健康管理Webのログ(hm_access_logs)を同じ形にして並べる
type Site = "stres" | "hm";
type LogRow = {
  key: string;
  site: Site;
  user_id: string;
  role: string | null;
  action: string;
  target: string | null;
  company_id: string | null;
  created_at: string;
  // 健康管理Webのログだけ: 対象の表・記録と補足
  hm?: { table: string | null; target_id: string | null; detail: Record<string, unknown> | null };
};
type HmLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  company_id?: string | null; // 健康管理Webの SQL 0152 の実行後
  created_at: string;
};
const LIMIT = 300;

const ACTION_LABEL: Record<string, string> = {
  view_results: "結果一覧の表示",
  view_result_detail: "個人結果詳細の表示",
  export_csv: "CSV出力",
  view_interview: "申出一覧の表示",
  invite_user: "ユーザー招待",
  interview_request_created: "面接指導の申出",
  delete_result_for_retake: "結果削除(再受検対応)",
  view_group_report: "集団分析報告書の表示",
  update_dept: "部署名の修正",
  company_created: "企業の追加",
  company_renamed: "企業名の変更",
  view_campaign: "配布URL・QRの表示",
  issue_campaign: "配布URLの発行",
  rotate_campaign: "配布URLの再発行",
  campaign_activated: "配布の再開",
  campaign_deactivated: "配布の停止",
  change_role: "ロール変更",
  dept_master_added: "部署の追加",
  dept_master_renamed: "部署名の変更(マスタ)",
  dept_master_removed: "部署の削除(マスタ)",
  company_hm_changed: "健康管理Webの併用設定の変更",
  no_email_person_created: "メールのない方の登録",
  no_email_passcode_issued: "ログインID・合言葉の発行",
  no_email_person_removed: "メールのない方の登録の取り消し",
  paper_result_registered: "紙の回答の登録",
  paper_ai_read: "紙の回答のAI読み取り",
  paper_consent_recorded: "紙の同意書の記録(同意)",
  paper_consent_withdrawn: "紙の同意の取り消し",
  hm_view_high_stress: "高ストレス者一覧の閲覧(健康管理Web)",
  hm_view_stress_history: "受検歴の閲覧(健康管理Web)",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 補足欄が結果IDを指していればそのIDを返す("report:ID" は結果票ページ、IDだけは一覧の詳細)
function resultIdOf(target: string | null): string | null {
  if (!target) return null;
  const t = target.startsWith("report:") ? target.slice(7) : target;
  return UUID_RE.test(t) ? t : null;
}

// 閲覧(view_*)か操作(データの作成・変更・出力)かの分類
type LogKind = "all" | "view" | "operation";
const kindOf = (r: LogRow): Exclude<LogKind, "all"> =>
  (r.site === "hm" ? hmIsView(r.action) : r.action.startsWith("view_")) ? "view" : "operation";

export function AccessLogsPanel() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [companies, setCompanies] = useState<Record<string, string>>({});
  // 個人結果の閲覧ログは結果IDで記録されているため、誰の何年度の結果かを表示用に引く
  const [resultInfo, setResultInfo] = useState<Record<string, { user_id: string; fiscal_year: number }>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<LogKind>("all");
  const [site, setSite] = useState<"all" | Site>("all");
  // 健康管理Webのログの対象(カルテ・面談・健診)が誰の記録かを表示用に引く
  const [hmNames, setHmNames] = useState<Record<string, string>>({});

  const supabase = createClient();

  const load = async () => {
    let q = supabase.from("access_logs").select("*").order("created_at", { ascending: false }).limit(LIMIT);
    if (from) q = q.gte("created_at", `${from}T00:00:00+09:00`);
    if (to) q = q.lte("created_at", `${to}T23:59:59+09:00`);
    // 健康管理Webを使っていない環境では表がないので、読めなければ空にする
    let hq = supabase.from("hm_access_logs").select("*").order("created_at", { ascending: false }).limit(LIMIT);
    if (from) hq = hq.gte("created_at", `${from}T00:00:00+09:00`);
    if (to) hq = hq.lte("created_at", `${to}T23:59:59+09:00`);
    const [{ data: logs }, { data: hmLogs, error: hmErr }, { data: ps }, { data: cs }] = await Promise.all([
      q,
      hq,
      supabase.from("profiles").select("user_id, name, company_id, role"),
      supabase.from("companies").select("id, name"),
    ]);
    const map: Record<string, Profile> = {};
    ((ps as Profile[]) ?? []).forEach((p) => (map[p.user_id] = p));
    setPeople(map);
    const cmap: Record<string, string> = {};
    ((cs as { id: string; name: string }[]) ?? []).forEach((c) => (cmap[c.id] = c.name));
    setCompanies(cmap);
    const stresRows: LogRow[] = ((logs as (Omit<LogRow, "key" | "site"> & { id: number })[]) ?? []).map((r) => ({
      ...r,
      key: `s${r.id}`,
      site: "stres",
    }));
    const hmRows: LogRow[] = (hmErr ? [] : ((hmLogs as HmLogRow[]) ?? []))
      .filter((r) => r.user_id)
      .map((r) => ({
        key: `h${r.id}`,
        site: "hm",
        user_id: r.user_id as string,
        role: map[r.user_id as string]?.role ?? null,
        action: r.action,
        target: null,
        company_id: r.company_id ?? null,
        created_at: r.created_at,
        hm: { table: r.target_table, target_id: r.target_id, detail: r.detail },
      }));
    const logRows = [...stresRows, ...hmRows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    // 健康管理Webのログの対象: カルテ・面談・健診が誰の記録か
    const idsOf = (table: string) =>
      Array.from(new Set(hmRows.filter((r) => r.hm?.table === table && r.hm.target_id).map((r) => r.hm!.target_id as string)));
    const names: Record<string, string> = {};
    const [persons, interviews, checkups] = await Promise.all([
      idsOf("hm_persons").length ? supabase.from("hm_persons").select("id, full_name").in("id", idsOf("hm_persons").slice(0, 200)) : null,
      idsOf("hm_interviews").length ? supabase.from("hm_interviews").select("id, target_name").in("id", idsOf("hm_interviews").slice(0, 200)) : null,
      idsOf("hm_checkups").length
        ? supabase.from("hm_checkups").select("id, target_name, fiscal_year").in("id", idsOf("hm_checkups").slice(0, 200))
        : null,
    ]);
    ((persons?.data as { id: string; full_name: string }[] | null) ?? []).forEach((x) => (names[x.id] = `${x.full_name}さん`));
    ((interviews?.data as { id: string; target_name: string }[] | null) ?? []).forEach((x) => (names[x.id] = `${x.target_name}さん`));
    ((checkups?.data as { id: string; target_name: string; fiscal_year: number }[] | null) ?? []).forEach(
      (x) => (names[x.id] = `${x.target_name}さん ${x.fiscal_year}年度`)
    );
    setHmNames(names);
    // 補足欄に結果ID(そのまま、または report:ID)が入っている行の結果をまとめて引く
    const ids = Array.from(
      new Set(logRows.map((r) => resultIdOf(r.target)).filter((x): x is string => x !== null))
    );
    const rmap: Record<string, { user_id: string; fiscal_year: number }> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data: rs } = await supabase
        .from("results")
        .select("id, user_id, fiscal_year")
        .in("id", ids.slice(i, i + 200));
      ((rs as { id: string; user_id: string; fiscal_year: number }[]) ?? []).forEach(
        (r) => (rmap[r.id] = { user_id: r.user_id, fiscal_year: r.fiscal_year })
      );
    }
    setResultInfo(rmap);
    setRows(logRows);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows === null) return <LoadingCard />;

  const shown = rows.filter((r) => (kind === "all" || kindOf(r) === kind) && (site === "all" || r.site === site));

  // どの企業に関する操作かを示す。ログに企業が記録されていなければ、操作した方の所属企業を出す
  const companyOf = (r: LogRow): string => {
    const id = r.company_id ?? people[r.user_id]?.company_id ?? null;
    return (id && companies[id]) || "—";
  };
  // 「対象」は企業列と重なる部分(企業名)を省き、年度などの補足だけを短く出す。
  // 「report:<id>」のような内部の識別子は読みやすい表記にする
  const targetLabel = (r: LogRow): string => {
    if (r.site === "hm") {
      const h = r.hm!;
      const parts: string[] = [];
      // 申出者のストレスチェック結果の表示は、対象に本人のアカウントが入っている
      if (h.target_id) parts.push(hmNames[h.target_id] ?? (h.table === "results" && people[h.target_id] ? `${people[h.target_id].name}さん` : ""));
      const d = h.detail ?? {};
      if (typeof d.file_name === "string") parts.push(d.file_name);
      if (typeof d.reason === "string") parts.push(`理由: ${d.reason}`);
      if (typeof d.recipients === "number") parts.push(`${d.recipients}名に送信`);
      return parts.filter(Boolean).join(" / ");
    }
    const t = r.target ?? "";
    if (!t) return "";
    // 個人結果の閲覧: 結果IDを「誰の何年度の結果か」に置き換える
    const rid = resultIdOf(t);
    if (rid) {
      const info = resultInfo[rid];
      const isReport = t.startsWith("report:");
      if (!info) return isReport ? "結果票(削除済みの結果)" : "詳細(削除済みの結果)";
      const who = people[info.user_id]?.name ?? "(氏名不明)";
      return `${who}さん ${info.fiscal_year}年度${isReport ? " 結果票(印刷用)" : " 詳細"}`;
    }
    const company = companyOf(r);
    if (company !== "—") {
      if (t === company) return "";
      if (t.startsWith(company + "/")) {
        const rest = t.slice(company.length + 1);
        return /^\d{4}$/.test(rest) ? `${rest}年度` : rest;
      }
    }
    return t;
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontSize: 17, color: brand.ink, margin: 0 }}>アクセスログ(各サイトの最新{LIMIT}件)</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${brand.line}`, borderRadius: 8 }} />
          〜
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${brand.line}`, borderRadius: 8 }} />
          <Btn tone="ghost" onClick={load} style={{ padding: "7px 14px", fontSize: 13 }}>
            絞り込み
          </Btn>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {(
          [
            ["all", "両方のサイト"],
            ["stres", "ストレスチェックWeb"],
            ["hm", "健康管理Web"],
          ] as const
        ).map(([k, label]) => (
          <FilterChip key={k} on={site === k} onClick={() => setSite(k)}>
            {label}
          </FilterChip>
        ))}
        <span style={{ width: 10 }} />
        {(
          [
            ["all", "すべて"],
            ["view", "閲覧ログ"],
            ["operation", "操作ログ"],
          ] as const
        ).map(([k, label]) => (
          <FilterChip key={k} on={kind === k} onClick={() => setKind(k)}>
            {label}
          </FilterChip>
        ))}
      </div>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["日時", "サイト", "ユーザー", "ロール", "企業", "種別", "内容", "補足"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} style={{ borderBottom: `1px solid ${brand.line}` }}>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  {new Date(r.created_at).toLocaleString("ja-JP")}
                </td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontSize: 12, color: r.site === "hm" ? "#8A5A12" : brand.tealDark }}>
                  {r.site === "hm" ? "健康管理Web" : "ストレスチェック"}
                </td>
                {/* 氏名は折り返さず1行で出す(表全体は横スクロール可) */}
                <td style={{ padding: "8px 10px", fontWeight: 700, color: brand.ink, whiteSpace: "nowrap" }}>
                  {people[r.user_id]?.name ?? r.user_id.slice(0, 8)}
                </td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  {r.role && r.role in ROLE_LABEL ? ROLE_LABEL[r.role as Role] : r.role ?? ""}
                </td>
                <td style={{ padding: "8px 10px", fontWeight: 700, color: brand.tealDark, whiteSpace: "nowrap" }}>
                  {companyOf(r)}
                </td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  {kindOf(r) === "view" ? (
                    <Badge tone="gray">閲覧</Badge>
                  ) : (
                    <Badge tone="orange">操作</Badge>
                  )}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  {r.site === "hm" ? hmActionLabel(r.action, r.hm?.table ?? null) : ACTION_LABEL[r.action] ?? r.action}
                </td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#5B6B6A" }}>
                  {targetLabel(r)}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                  ログはありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#8A9694", marginTop: 10, lineHeight: 1.7 }}>
        「閲覧」は結果一覧・詳細・報告書・カルテ・面談記録などの表示やファイルのダウンロード、「操作」はCSV出力・招待・配布URL発行・企業追加・結果削除・ロール変更・議事録や健診・面談記録の作成/更新/削除などのデータに影響する行為です。
        健康管理Webのログも同じ表に並びます(企業欄は、健康管理Webの SQL 0152 の実行後に出ます)。ログは削除できません(監査証跡として保全されます)。
      </p>
    </Card>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: on ? brand.teal : "#fff",
        color: on ? "#fff" : brand.tealDark,
        border: `1px solid ${brand.teal}`,
        borderRadius: 999,
        padding: "6px 14px",
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
