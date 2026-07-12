"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card, ScoreBar } from "@/components/ui";
import { brand } from "@/lib/brand";
import { InterviewRequest, ResultRow, STATUS_LABEL } from "@/lib/types";

export function MyPage({
  name,
  companyId,
  companyName,
}: {
  name: string;
  companyId: string;
  companyName: string;
}) {
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [requests, setRequests] = useState<InterviewRequest[]>([]);
  const [showForm, setShowForm] = useState<string | null>(null); // result_id
  const [message, setMessage] = useState("");
  const [preferred, setPreferred] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const supabase = createClient();

  const reload = useCallback(async () => {
    const [{ data: rs }, { data: irs }] = await Promise.all([
      supabase.from("results").select("*").order("fiscal_year", { ascending: false }),
      supabase.from("interview_requests").select("*").order("created_at", { ascending: false }),
    ]);
    setResults((rs as ResultRow[]) ?? []);
    setRequests((irs as InterviewRequest[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleConsent = async (r: ResultRow) => {
    setBusy(true);
    const { error } = await supabase.from("results").update({ consent: !r.consent }).eq("id", r.id);
    setBusy(false);
    if (error) {
      setNotice("同意状態の変更に失敗しました: " + error.message);
      return;
    }
    setNotice(!r.consent ? "会社への提供に同意しました。" : "会社への提供同意を撤回しました。");
    reload();
  };

  const submitRequest = async (r: ResultRow) => {
    setBusy(true);
    const { data: inserted, error } = await supabase
      .from("interview_requests")
      .insert({
        result_id: r.id,
        user_id: r.user_id,
        company_id: companyId,
        message: message || null,
        preferred: preferred || null,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      setNotice("申出の送信に失敗しました: " + error.message);
      return;
    }

    // 実施者・実施事務従事者へのメール通知(失敗しても申出自体は有効)
    let notified = true;
    try {
      const res = await fetch("/api/notify-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: inserted.id }),
      });
      const body = await res.json().catch(() => ({}));
      notified = res.ok && (body.sent ?? 0) > 0;
    } catch {
      notified = false;
    }

    setBusy(false);
    setNotice(
      notified
        ? "面接指導の申出を送信し、実施者へ通知しました。連絡があるまでお待ちください。"
        : "面接指導の申出は受け付けられました(通知メールの送信に失敗した可能性があります。実施者は画面上で申出を確認できます)。"
    );
    setShowForm(null);
    setMessage("");
    setPreferred("");
    reload();
  };

  if (results === null) {
    return <Card style={{ maxWidth: 720, margin: "0 auto" }}>読み込み中…</Card>;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge>従業員マイページ</Badge>
            <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 2px" }}>
              {name ? `${name} さん` : "受検者ページ"}
            </h2>
            {companyName && <p style={{ fontSize: 13, color: "#5B6B6A", margin: 0 }}>{companyName}</p>}
          </div>
          <Link href="/exam">
            <Btn>ストレスチェックを受検する</Btn>
          </Link>
        </div>
        {notice && (
          <div
            style={{
              fontSize: 13,
              color: brand.tealDark,
              background: "#E2F3F1",
              borderRadius: 10,
              padding: "10px 14px",
              marginTop: 12,
            }}
          >
            {notice}
          </div>
        )}
      </Card>

      {results.length === 0 && (
        <Card>
          <p style={{ fontSize: 14, color: "#5B6B6A", margin: 0 }}>
            受検結果はまだありません。「ストレスチェックを受検する」から回答してください。
          </p>
        </Card>
      )}

      {results.map((r) => {
        const req = requests.find((q) => q.result_id === r.id);
        return (
          <Card key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ fontSize: 17, color: brand.ink, margin: 0 }}>{r.fiscal_year}年度の結果</h3>
              {r.high_stress ? <Badge tone="red">高ストレス</Badge> : <Badge tone="gray">高ストレスに該当せず</Badge>}
            </div>
            <p style={{ fontSize: 12, color: "#8A9694", margin: "4px 0 14px" }}>
              {new Date(r.created_at).toLocaleDateString("ja-JP")} 実施 / 部署: {r.dept}
            </p>
            <ScoreBar label="A. 仕事のストレス要因" value={r.score_a} max={68} />
            <ScoreBar label="B. 心身のストレス反応" value={r.score_b} max={116} threshold={77} />
            <ScoreBar label="C. 周囲のサポート(点が高いほど乏しい)" value={r.score_c} max={36} />

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                background: "#F4FAF9",
                border: `1px solid ${brand.line}`,
                borderRadius: 10,
                padding: 12,
                cursor: "pointer",
                marginTop: 10,
              }}
            >
              <input type="checkbox" checked={r.consent} disabled={busy} onChange={() => toggleConsent(r)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13, color: brand.ink, lineHeight: 1.7 }}>
                この結果を会社の担当者へ提供することに同意する(いつでも変更できます)
              </span>
            </label>

            {r.high_stress && (
              <div style={{ marginTop: 14 }}>
                {req ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: brand.ink,
                      background: "#FCEADC",
                      borderRadius: 10,
                      padding: "10px 14px",
                      lineHeight: 1.7,
                    }}
                  >
                    面接指導の申出済み({new Date(req.created_at).toLocaleDateString("ja-JP")})/ 状況:{" "}
                    <strong>{STATUS_LABEL[req.status]}</strong>
                  </div>
                ) : showForm === r.id ? (
                  <div style={{ border: `1px solid ${brand.line}`, borderRadius: 10, padding: 14 }}>
                    <h4 style={{ fontSize: 14, color: brand.ink, margin: "0 0 10px" }}>面接指導の申出</h4>
                    <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 4 }}>
                      連絡事項(任意)
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "8px 10px",
                        fontSize: 14,
                        border: `1px solid ${brand.line}`,
                        borderRadius: 8,
                        marginBottom: 10,
                        fontFamily: "inherit",
                      }}
                    />
                    <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 4 }}>
                      面談の希望日時(任意)
                    </label>
                    <input
                      value={preferred}
                      onChange={(e) => setPreferred(e.target.value)}
                      placeholder="例: 平日の午後、7月中 など"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "8px 10px",
                        fontSize: 14,
                        border: `1px solid ${brand.line}`,
                        borderRadius: 8,
                        marginBottom: 12,
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn tone="ghost" onClick={() => setShowForm(null)} style={{ padding: "8px 14px", fontSize: 13 }}>
                        キャンセル
                      </Btn>
                      <Btn tone="orange" onClick={() => submitRequest(r)} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
                        {busy ? "送信中…" : "申出を送信する"}
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <Btn tone="orange" onClick={() => setShowForm(r.id)}>
                    産業医面接指導を申し出る
                  </Btn>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
