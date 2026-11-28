"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";

type Data = {
  fiscalYear: number;
  registered: number;
  members: { user_id: string; name: string; dept: string | null }[];
  last: { at: string; role: string | null; target: string | null } | null;
  canSend: boolean;
  block: string | null;
};

// 未受検者へのリマインド(実施者・実施事務従事者)。アカウント登録済みで当年度の結果がない人にメールを送る
export function ExamReminderPanel({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const {
      data: { session },
    } = await createClient().auth.getSession();
    const res = await fetch(`/api/exam/unexamined?companyId=${encodeURIComponent(companyId)}`, {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(json.error ?? "読み込めませんでした");
    setData(json as Data);
  }, [companyId]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!data) return;
    if (!window.confirm(`未受検の ${data.members.length}名に、受検のお願いのメールを送ります。よろしいですか？\n(同じ企業へは24時間に1回まで送れます)`)) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    const { ok, json } = await postJson<{ count?: number; error?: string }>("/api/exam/remind", { companyId });
    setBusy(false);
    if (!ok) return setErr(json.error ?? "送れませんでした");
    setMsg(`${json.count}名にリマインドのメールを送っています(数分で届きます)。`);
    load();
  };

  return (
    <Card>
      <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>未受検の方へのリマインド</h3>
      <p style={{ fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 10px" }}>
        {companyName}で<strong>アカウントを登録済み</strong>の従業員のうち、今年度まだ受検していない方に、受検のお願いのメールを送ります。
        QRコードから登録していない方には届きません(その方には配布URL・QRコードをあらためて案内してください)。
      </p>
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 8 }}>{err}</div>}
      {!data ? (
        !err && <div style={{ fontSize: 13, color: "#8A9694" }}>読み込んでいます…</div>
      ) : (
        <>
          <div style={{ fontSize: 14, color: brand.ink, marginBottom: 8 }}>
            {data.fiscalYear}年度: 登録済み <strong>{data.registered}名</strong> のうち、未受検 <strong style={{ color: brand.tealDark }}>{data.members.length}名</strong>
            {data.members.length > 0 && (
              <button
                onClick={() => setShowList((v) => !v)}
                style={{ marginLeft: 10, background: "none", border: 0, padding: 0, color: brand.tealDark, fontSize: 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
              >
                {showList ? "閉じる" : "対象の方を見る"}
              </button>
            )}
          </div>
          {showList && (
            <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 13, lineHeight: 1.8, maxHeight: 240, overflowY: "auto" }}>
              {data.members.map((m) => (
                <li key={m.user_id}>
                  {m.name}
                  {m.dept && <span style={{ color: "#8A9694" }}>({m.dept})</span>}
                </li>
              ))}
            </ul>
          )}
          {data.block ? (
            <div style={{ fontSize: 13, color: "#8A6B2E" }}>{data.block}。リマインドは送れません。</div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Btn tone="orange" onClick={send} disabled={busy || data.members.length === 0 || !data.canSend}>
                {busy ? "送っています…" : `未受検の${data.members.length}名にリマインドを送る`}
              </Btn>
              {data.last && (
                <span style={{ fontSize: 12, color: "#5B6B6A" }}>
                  前回の送信: {new Date(data.last.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  ({data.last.role === "office" ? "実施者" : "担当者"}
                  {data.last.target?.match(/count=(\d+)/)?.[1] ? `・${data.last.target.match(/count=(\d+)/)![1]}名` : ""})
                  {!data.canSend && " — 24時間たつと再び送れます"}
                </span>
              )}
            </div>
          )}
          {msg && <div style={{ fontSize: 13, color: brand.tealDark, marginTop: 8 }}>{msg}</div>}
        </>
      )}
    </Card>
  );
}
