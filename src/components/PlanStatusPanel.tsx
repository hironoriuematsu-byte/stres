"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { formatJpDate, interviewOptionLabel, jstDate, jstToday, priceAdd, UNIT_PRICE } from "@/lib/plan";

type Payment = { id: string; kind: "new" | "add_seats" | "renew"; seats: number; amount: number; paid_at: string };

export type PlanStatus = Status;

type Status = {
  seats: number;
  used: number;
  exam_start: string;
  exam_end: string;
  max_end: string;
  interview_option: string | null;
  workers: number | null;
};

// Web申込の企業向け: 受検期間・受検者数の確認、締切の変更、人数の追加購入。
// 受検期間の登録がない企業(これまでの契約企業)では何も表示しない
export function PlanStatusPanel({
  companyId,
  fiscalYear,
  canEdit,
  preview,
  previewPayments,
}: {
  companyId: string;
  fiscalYear: number;
  canEdit: boolean;
  preview?: Status; // 紹介用(デモ): データベースを読まずにこの内容を表示し、操作は保存しない
  previewPayments?: Payment[];
}) {
  const [st, setSt] = useState<Status | null>(preview ?? null);
  const [end, setEnd] = useState(preview?.exam_end ?? "");
  const [add, setAdd] = useState("5");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showNotice, setShowNotice] = useState(false);
  const [payments, setPayments] = useState<Payment[]>(previewPayments ?? []);

  const load = async () => {
    if (preview) return;
    const supabase = createClient();
    const [{ data }, { data: co }] = await Promise.all([
      supabase.rpc("exam_plan_status", { p_company: companyId, p_year: fiscalYear }),
      supabase.from("companies").select("web_signup").eq("id", companyId).maybeSingle(),
    ]);
    // 顧問契約に切り替えた企業では、受検期間・人数枠の欄を出さない(制限なし)
    const row = (co as { web_signup?: boolean } | null)?.web_signup ? ((data as Status[] | null)?.[0] ?? null) : null;
    setSt(row);
    if (row) setEnd(row.exam_end);
    // お支払いの記録(領収書のダウンロード用)
    if (row && canEdit) {
      const { data: ps } = await supabase
        .from("plan_orders")
        .select("id, kind, seats, amount, paid_at")
        .eq("company_id", companyId)
        .eq("fiscal_year", fiscalYear)
        .in("status", ["paid", "provisioned"])
        .order("paid_at");
      setPayments(((ps as Payment[]) ?? []).filter((p) => p.paid_at));
    }
  };

  useEffect(() => {
    if (preview) return;
    setSt(null);
    setMsg(null);
    load();
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("plan") === "added") {
      setMsg({ ok: true, text: "お手続きを受け付けました。お支払いが確認でき次第、人数枠に反映します(カードは1分ほど、コンビニ・銀行振込は入金後)。" });
    }
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("plan") === "ordered") {
      setMsg({ ok: true, text: "次の年度のお申込みを受け付けました。お支払いが確認でき次第、受検期間を反映します(カードは1分ほど、コンビニ・銀行振込は入金後)。" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fiscalYear]);

  if (!st) return null;

  const today = jstToday();
  const phase = today < st.exam_start ? "before" : today > st.exam_end ? "closed" : "open";
  const daysLeft = Math.round((Date.parse(st.exam_end) - Date.parse(today)) / 86400000);
  const full = st.used >= st.seats;
  const addN = Number(add.normalize("NFKC"));
  const addOk = Number.isInteger(addN) && addN >= 1 && addN <= 10000;

  const saveEnd = async () => {
    if (preview) {
      setMsg({ ok: true, text: `(デモ)締切日を${formatJpDate(end)}に変更しました。実際の画面では保存されます。` });
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_exam_end", { p_company: companyId, p_year: fiscalYear, p_end: end });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: `締切日を${formatJpDate(end)}に変更しました。` });
      load();
    }
  };

  const buySeats = async () => {
    // 桁の打ち間違いの確認: 追加後の人数枠が事業場の労働者数を超える場合は念のため確かめる
    if (st && st.workers && st.seats + addN > st.workers) {
      const ok = window.confirm(
        `追加後の受検人数(${st.seats + addN}名)が、お申込み時の事業場の労働者数(${st.workers}名)を超えます。\n` +
          `${addN}名・${priceAdd(addN).total.toLocaleString()}円の追加でよろしいですか？(お支払い後の返金はできません)`
      );
      if (!ok) return;
    }
    if (preview) {
      setMsg({ ok: true, text: "(デモ)実際の画面では、ここからクレジットカードの決済画面に進みます。" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/plan/add-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: addN, fiscalYear }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "決済画面を開けませんでした");
      window.location.href = json.url;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      setBusy(false);
    }
  };

  const pct = Math.min(100, Math.round((st.used / Math.max(1, st.seats)) * 100));
  const small = { fontSize: 12, color: "#5B6B6A", lineHeight: 1.7 } as const;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: 0 }}>{fiscalYear}年度の受検期間・受検者数</h3>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 999,
            padding: "3px 10px",
            background: phase === "open" ? "#E3F4F1" : phase === "before" ? "#FBF3E3" : "#EEF1F1",
            color: phase === "open" ? brand.tealDark : phase === "before" ? "#8A6B2E" : "#5B6B6A",
          }}
        >
          {phase === "open" ? `受検期間中(締切まであと${daysLeft}日)` : phase === "before" ? "受検期間前" : "受検期間は終了しました"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 12 }}>
        <div>
          <div style={small}>受検期間</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: brand.ink }}>
            {formatJpDate(st.exam_start)} 〜 {formatJpDate(st.exam_end)}
          </div>
          <div style={small}>締切は{formatJpDate(st.max_end)}まで延ばせます(無料)</div>
        </div>
        <div>
          <div style={small}>受検者数</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: full ? "#B02A2A" : brand.ink }}>
            {st.used}名 / {st.seats}名
          </div>
          <div style={{ height: 8, background: "#EEF1F1", borderRadius: 4, marginTop: 4 }}>
            <div style={{ width: `${pct}%`, height: 8, background: full ? "#D64545" : brand.teal, borderRadius: 4 }} />
          </div>
          {full && <div style={{ ...small, color: "#B02A2A" }}>人数枠に達しました。まだ受検する方がいる場合は人数を追加してください。</div>}
        </div>
        <div>
          <div style={small}>産業医面接指導の担当</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, lineHeight: 1.6 }}>{interviewOptionLabel(st.interview_option)}</div>
          {st.interview_option === "sanpo" && (
            <div style={small}>
              申出があったときは、最寄りの地域産業保健センターに面接指導をお申し込みください(連絡先は
              <a href="https://www.johas.go.jp/" target="_blank" rel="noreferrer" style={{ color: brand.tealDark }}>
                労働者健康安全機構
              </a>
              の各都道府県の産業保健総合支援センターのページに掲載されています)。
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${brand.line}` }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 6 }}>締切日の変更</div>
            <input
              type="date"
              value={end}
              min={st.exam_start}
              max={st.max_end}
              onChange={(e) => setEnd(e.target.value)}
              style={{ padding: "7px 10px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 8, marginRight: 8 }}
            />
            <Btn tone="ghost" onClick={saveEnd} disabled={busy || !end || end === st.exam_end} style={{ padding: "7px 14px", fontSize: 13 }}>
              変更する
            </Btn>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 6 }}>受検人数の追加(1名 {UNIT_PRICE}円・税込)</div>
            <input
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              inputMode="numeric"
              style={{ width: 70, padding: "7px 10px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 8, textAlign: "right" }}
            />
            <span style={{ fontSize: 13, margin: "0 8px 0 4px" }}>名</span>
            <Btn tone="orange" onClick={buySeats} disabled={busy || !addOk || phase === "closed"} style={{ padding: "7px 14px", fontSize: 13 }}>
              {addOk ? `${priceAdd(addN).total.toLocaleString()}円を支払って追加` : "追加する"}
            </Btn>
            {phase === "closed" && <div style={small}>受検期間の終了後は追加できません。締切を延ばしてから追加してください。</div>}
          </div>
        </div>
      )}

      {msg && <p style={{ fontSize: 13, color: msg.ok ? brand.tealDark : "#B02A2A", margin: "12px 0 0" }}>{msg.text}</p>}

      {canEdit && payments.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${brand.line}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 6 }}>お支払いの記録</div>
          <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap" }}>{formatJpDate(jstDate(p.paid_at))}</td>
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap" }}>{p.kind === "add_seats" ? "人数の追加" : "お申込み"} {p.seats}名</td>
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap", textAlign: "right" }}>{p.amount.toLocaleString()}円</td>
                  <td style={{ padding: "5px 0", whiteSpace: "nowrap" }}>
                    <a
                      href={preview ? "/demo/plan/receipt" : `/plan/receipt/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: brand.tealDark, fontWeight: 700 }}
                    >
                      領収書
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={small}>領収書(インボイス対応)は「印刷 / PDFとして保存」で保存できます。決済時には決済代行会社(Stripe)からもメールでお送りしています。</div>
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowNotice((v) => !v)}
            style={{ background: "none", border: "none", padding: 0, color: brand.tealDark, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {showNotice ? "▲" : "▼"} 従業員の皆さまへのお知らせ文の例(実施前の周知に使えます)
          </button>
          {showNotice && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                fontSize: 13,
                color: "#44534F",
                lineHeight: 1.8,
                background: "#F4FAF9",
                border: `1px solid ${brand.line}`,
                borderRadius: 10,
                padding: "12px 14px",
                margin: "8px 0 0",
              }}
            >
              {`ストレスチェック実施のお知らせ

労働安全衛生法に基づき、ストレスチェックを実施します。ご自身のストレスの状態に気づき、職場環境の改善につなげることが目的です。

■ 受検期間: ${formatJpDate(st.exam_start)} 〜 ${formatJpDate(st.exam_end)}
■ 受検方法: 配布する受検用URL(QRコード)から、スマートフォンまたはパソコンで回答してください(約10〜15分)。
■ 実施者: 医師(産業医) 上松 弘典(うえまつ産業医事務所)
■ 結果の取扱い:
 ・結果は受検後すぐにご本人に表示されます。
 ・個人の結果は、ご本人の同意がない限り会社に提供されません。
 ・高ストレスと判定された方は、医師による面接指導を申し出ることができます。
 ・受検しないこと、結果、面接指導の申出を理由に、不利益な取扱いをすることはありません。
 ・部署ごとの集計(10名未満の集団は除く)を職場環境の改善に活用します。個人が特定されることはありません。
 ・結果は実施者のもとで5年間保存されます。

ご不明な点は、ストレスチェック担当者までお問い合わせください。`}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
