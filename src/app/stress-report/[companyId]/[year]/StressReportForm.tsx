"use client";

import React, { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { IMPLEMENTER } from "@/lib/org";
import { PrintHeader } from "@/components/PrintHeader";

export type ReportInfo = {
  company_id: string;
  industry: string | null;
  postal_code: string | null;
  address: string | null;
  tel: string | null;
  representative: string | null;
  labor_insurance_no: string | null;
  implementer_type: number;
  interviewer_type: number;
};

export type ReportSummary = {
  examined: number;
  last_exam_at: string | null;
  interviewed: number;
  group_analysis_done: boolean;
};

// 元号表記(令和 = 西暦 - 2018)。報告書の記入枠は「元号 年 月」
function reiwa(year: number): string {
  const r = year - 2018;
  return r === 1 ? "令和元年" : `令和${r}年`;
}

const IMPLEMENTER_OPTIONS = [
  { v: 1, label: "1: 事業場選任の産業医" },
  { v: 2, label: "2: 事業場所属の医師、保健師、歯科医師、看護師、精神保健福祉士又は公認心理師（1以外）" },
  { v: 3, label: "3: 外部委託先の医師、保健師、歯科医師、看護師、精神保健福祉士又は公認心理師" },
];
const INTERVIEWER_OPTIONS = [
  { v: 1, label: "1: 事業場選任の産業医" },
  { v: 2, label: "2: 事業場所属の医師（1以外の医師に限る）" },
  { v: 3, label: "3: 外部委託先の医師" },
];

// 様式第6号の3 の記載項目を、転記しやすい順に表示する。
// 自動で求まる項目(検査を受けた労働者数 など)と、事業場ごとに保存する項目(所在地 など)、
// その場で入力する項目(在籍労働者数)を分けて表示し、印刷・PDF保存できる。
export function StressReportForm({
  companyId,
  companyName,
  fiscalYear,
  initialInfo,
  summary,
  notApplied,
  canEdit,
}: {
  companyId: string;
  companyName: string;
  fiscalYear: number;
  initialInfo: ReportInfo | null;
  summary: ReportSummary | null;
  notApplied: boolean;
  canEdit: boolean;
}) {
  const [info, setInfo] = useState<ReportInfo>(
    initialInfo ?? {
      company_id: companyId,
      industry: "",
      postal_code: "",
      address: "",
      tel: "",
      representative: "",
      labor_insurance_no: "",
      implementer_type: 1,
      interviewer_type: 1,
    }
  );
  const [headcount, setHeadcount] = useState("");
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lastExam = summary?.last_exam_at ? new Date(summary.last_exam_at) : null;
  // 対象年は検査の実施年(暦年)。1年を通して実施した場合は報告日に最も近い実施年月を書く
  const targetYear = lastExam ? lastExam.getFullYear() : fiscalYear;
  const examMonth = lastExam ? `${reiwa(lastExam.getFullYear())}${lastExam.getMonth() + 1}月` : "—";
  const rd = new Date(reportDate + "T00:00:00");
  const reportDateLabel = isNaN(rd.getTime()) ? "" : `${reiwa(rd.getFullYear())}${rd.getMonth() + 1}月${rd.getDate()}日`;

  const set = (patch: Partial<ReportInfo>) => {
    setInfo((p) => ({ ...p, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("company_report_info").upsert(
      {
        company_id: companyId,
        industry: info.industry?.trim() || null,
        postal_code: info.postal_code?.trim() || null,
        address: info.address?.trim() || null,
        tel: info.tel?.trim() || null,
        representative: info.representative?.trim() || null,
        labor_insurance_no: info.labor_insurance_no?.trim() || null,
        implementer_type: info.implementer_type,
        interviewer_type: info.interviewer_type,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );
    if (error) setErr(`保存に失敗しました: ${error.message}`);
    else setSaved(true);
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${brand.line}`,
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 14,
    background: "#fff",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "#5B6B6A", display: "block", marginBottom: 2 };
  const valueStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: brand.ink };
  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "220px 1fr",
    gap: 8,
    padding: "8px 0",
    borderBottom: `1px solid ${brand.line}`,
    alignItems: "center",
  };

  const Row = ({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) => (
    <div style={rowStyle}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: "#8A9694" }}>{note}</div>}
      </div>
      <div>{children}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <style>{`
        @media print {
          /* 画面のヘッダ(ロゴ・アカウント設定など)やフッタ、ボタン類は印刷しない。報告書の枠内だけを印刷する */
          header, footer, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .report-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
          input, select, textarea { border: none !important; background: transparent !important; padding: 0 !important; font-weight: 700; }
          select { appearance: none; -webkit-appearance: none; }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        <a href={`/group-report/${companyId}/${fiscalYear}`} style={{ fontSize: 13, color: brand.tealDark }}>
          ← 集団分析報告書
        </a>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => window.print()}>🖨 印刷 / PDF保存</Btn>
      </div>

      <div className="report-sheet" style={{ background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 12, padding: "20px 24px" }}>
        <PrintHeader
          title="心理的な負担の程度を把握するための検査結果等報告書 記載項目（様式第６号の３ 転記用）"
          companyName={companyName}
          meta={`${fiscalYear}年度のストレスチェック`}
          note={`実施者: ${IMPLEMENTER.full} / 実施事務局: ${IMPLEMENTER.officeName}`}
        />

        {notApplied && (
          <p className="no-print" style={{ color: "#B02A2A", fontSize: 13, background: "#FDE3E3", padding: "8px 12px", borderRadius: 8 }}>
            データベースの更新（0021）が未適用のため、自動の集計と事業場情報の保存ができません。実施者にご連絡ください。
          </p>
        )}
        {!notApplied && summary && summary.examined === 0 && (
          <p className="no-print" style={{ color: "#B02A2A", fontSize: 13 }}>
            この年度の受検結果がありません。年度をご確認ください。
          </p>
        )}

        <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "16px 0 4px" }}>自動で集計した項目</h2>
        <Row label="対象年" note="検査の実施年（暦年）">
          <span style={valueStyle}>{reiwa(targetYear)}分</span>
          <span style={{ fontSize: 12, color: "#8A9694", marginLeft: 8 }}>（西暦{targetYear}年）</span>
        </Row>
        <Row label="検査実施年月" note="報告日に最も近い実施年月（最後に受検した方の実施月）">
          <span style={valueStyle}>{examMonth}</span>
        </Row>
        <Row label="検査を受けた労働者数" note="報告対象期間内に受検した実人数（複数回受検は1名）">
          <span style={valueStyle}>{summary ? `${summary.examined} 人` : "—"}</span>
        </Row>
        <Row label="面接指導を受けた労働者数" note="申出のうち、医師による面接指導を実施済み（実施済にした申出）の実人数">
          <span style={valueStyle}>{summary ? `${summary.interviewed} 人` : "—"}</span>
        </Row>
        <Row label="集団ごとの分析の実施の有無" note="集団分析報告書を開いた記録があれば「1: 行った」">
          <span style={valueStyle}>
            {summary ? (summary.group_analysis_done ? "1: 検査結果の集団ごとの分析を行った" : "2: 検査結果の集団ごとの分析を行っていない") : "—"}
          </span>
        </Row>
        <Row label="産業医（氏名）" note="検査を実施した者が 1 または面接指導を実施した医師が 1 のとき">
          <span style={valueStyle}>{IMPLEMENTER.name}</span>
        </Row>
        <Row label="産業医（所属機関の名称及び所在地）">
          <span style={valueStyle}>{IMPLEMENTER.officeName}</span>
          <div style={{ fontSize: 13, color: brand.ink }}>{IMPLEMENTER.officeAddress}</div>
        </Row>

        <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "20px 0 4px" }}>
          事業場の情報（保存されます）
        </h2>
        <Row label="事業場の名称">
          <span style={valueStyle}>{companyName}</span>
        </Row>
        <Row label="事業の種類" note="日本標準産業分類の中分類（例: 情報サービス業）">
          <input style={inputStyle} value={info.industry ?? ""} onChange={(e) => set({ industry: e.target.value })} disabled={!canEdit} />
        </Row>
        <Row label="郵便番号">
          <input style={{ ...inputStyle, width: 160 }} value={info.postal_code ?? ""} onChange={(e) => set({ postal_code: e.target.value })} placeholder="例: 604-8172" disabled={!canEdit} />
        </Row>
        <Row label="事業場の所在地">
          <input style={inputStyle} value={info.address ?? ""} onChange={(e) => set({ address: e.target.value })} disabled={!canEdit} />
        </Row>
        <Row label="電話">
          <input style={{ ...inputStyle, width: 220 }} value={info.tel ?? ""} onChange={(e) => set({ tel: e.target.value })} placeholder="例: 075-000-0000" disabled={!canEdit} />
        </Row>
        <Row label="労働保険番号" note="14桁（府県・所掌・管轄・基幹番号・枝番号）">
          <input style={{ ...inputStyle, width: 280 }} value={info.labor_insurance_no ?? ""} onChange={(e) => set({ labor_insurance_no: e.target.value })} placeholder="例: 26-1-01-123456-000" disabled={!canEdit} />
        </Row>
        <Row label="事業者職氏名" note="例: 代表取締役 ○○ ○○">
          <input style={inputStyle} value={info.representative ?? ""} onChange={(e) => set({ representative: e.target.value })} disabled={!canEdit} />
        </Row>
        <Row label="検査を実施した者" note="該当する番号。2名以上のときは代表者">
          <select style={inputStyle} value={info.implementer_type} onChange={(e) => set({ implementer_type: Number(e.target.value) })} disabled={!canEdit}>
            {IMPLEMENTER_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </Row>
        <Row label="面接指導を実施した医師" note="該当する番号">
          <select style={inputStyle} value={info.interviewer_type} onChange={(e) => set({ interviewer_type: Number(e.target.value) })} disabled={!canEdit}>
            {INTERVIEWER_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </Row>
        {canEdit && (
          <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <Btn onClick={save} disabled={saving || notApplied}>{saving ? "保存中…" : "事業場の情報を保存"}</Btn>
            {saved && <span style={{ fontSize: 13, color: brand.tealDark }}>保存しました。</span>}
            {err && <span style={{ fontSize: 13, color: "#B02A2A" }}>{err}</span>}
          </div>
        )}

        <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "20px 0 4px" }}>報告のたびに記入する項目</h2>
        <Row label="在籍労働者数" note="検査実施年月の末日現在の常時使用する労働者数">
          <input type="number" style={{ ...inputStyle, width: 160 }} value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="例: 120" />
          <span style={{ fontSize: 13, marginLeft: 6 }}>人</span>
        </Row>
        <Row label="報告日">
          <input type="date" className="no-print" style={{ ...inputStyle, width: 180 }} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          <span style={valueStyle}>{reportDateLabel}</span>
        </Row>
        <Row label="提出先">
          <span style={{ fontSize: 14 }}>事業場の所在地を管轄する労働基準監督署長</span>
        </Row>

        <p style={{ fontSize: 12, color: "#8A9694", marginTop: 16, lineHeight: 1.7 }}>
          この画面は報告書（様式第６号の３）への転記用です。記入枠はOCRで読み取られるため、報告書本体には黒のボールペンで
          大きめのアラビア数字を枠内に記入してください。電子申請（e-Gov）の場合は同じ項目を入力します。
          1年を通して順次検査を実施した場合は、期間内の実施状況をまとめて報告します。
        </p>
      </div>
    </div>
  );
}
