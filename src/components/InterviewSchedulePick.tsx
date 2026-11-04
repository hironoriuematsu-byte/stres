"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";
import type { InterviewRequest } from "@/lib/types";
import {
  OFFER_MAX_DAYS_AHEAD,
  PROPOSAL_MAX,
  PROPOSAL_NOTE_MAX,
  formatDateJa,
  formatSlot,
  jstDateOf,
  jstToday,
  proposalFirstDate,
  proposalTimeOptions,
  validateProposals,
  type Proposal,
  type Slot,
} from "@/lib/interview-schedule";
import { isBusinessDay } from "@/lib/jp-holidays";

// 本人向け: 医師が出した候補日時から1つ選ぶ / 合う日時がなければ希望の日時を送る / 確定した日程とオンライン面談のURLを見る
export function InterviewSchedulePick({ request, onChanged }: { request: InterviewRequest; onChanged: () => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const offered = request.status === "pending" && request.schedule_mode === "online" && Boolean(request.slots_offered_at);
  // 希望の日時を送って、医師の承認を待っている
  const proposed = offered && Boolean(request.proposed_at);

  const load = useCallback(async () => {
    if (!offered) return setSlots([]);
    const { data } = await createClient()
      .from("interview_slots")
      .select("id, request_id, starts_at, duration_min, status")
      .eq("request_id", request.id)
      .eq("status", proposed ? "proposed" : "open")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at");
    setSlots((data as Slot[] | null) ?? []);
  }, [request.id, offered, proposed]);
  useEffect(() => {
    load();
  }, [load]);

  const choose = async () => {
    if (!picked) return;
    const s = slots?.find((x) => x.id === picked);
    if (!s || !window.confirm(`${formatSlot(s.starts_at, s.duration_min)} で確定します。よろしいですか？`)) return;
    setBusy(true);
    setErr(null);
    const { ok, json } = await postJson<{ error?: string }>("/api/interview/choose", { requestId: request.id, slotId: picked });
    setBusy(false);
    if (!ok) {
      setErr(json.error ?? "確定できませんでした");
      load();
      return;
    }
    onChanged();
  };
  const cancel = async () => {
    if (!window.confirm("確定した日程を取り消します。残っている候補から選び直せますが、候補がない場合は医師から改めて案内があります。よろしいですか？")) return;
    setBusy(true);
    setErr(null);
    const { ok, json } = await postJson<{ error?: string }>("/api/interview/choose", { requestId: request.id, action: "cancel" });
    setBusy(false);
    if (!ok) return setErr(json.error ?? "取り消せませんでした");
    onChanged();
  };
  // カレンダー用ファイルはログインの情報を付けて取り、ダウンロードする
  const downloadIcs = async () => {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    const res = await fetch(`/api/interview/ics?requestId=${encodeURIComponent(request.id)}`, { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} });
    if (!res.ok) return setErr("カレンダー用ファイルを作れませんでした");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const box = { marginTop: 10, background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "12px 14px" } as const;

  // 確定済み
  if (request.status === "scheduled" && request.scheduled_at) {
    if (request.schedule_mode === "visit") {
      return (
        <div style={box}>
          <div style={{ fontSize: 14, fontWeight: 700, color: brand.ink }}>面談は次回の産業医訪問日に行います</div>
          <div style={{ fontSize: 13.5, color: "#2C3B39", lineHeight: 1.8, marginTop: 4 }}>
            訪問日: <strong>{formatDateJa(jstDateOf(request.scheduled_at))}</strong>(対面)
            {request.visit_note && <>　{request.visit_note}</>}
            <br />
            当日の時間と場所は、会社のストレスチェック担当者からご連絡します。
          </div>
        </div>
      );
    }
    return (
      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 700, color: brand.ink }}>面談の日時が確定しました</div>
        <div style={{ fontSize: 13.5, color: "#2C3B39", lineHeight: 1.8, marginTop: 4 }}>
          日時: <strong>{formatSlot(request.scheduled_at, request.duration_min)}</strong>(オンライン)
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          {request.meet_url ? (
            <a href={request.meet_url} target="_blank" rel="noopener noreferrer">
              <Btn tone="orange">面談に参加する(Google Meet)</Btn>
            </a>
          ) : (
            <span style={{ fontSize: 13, color: "#8A6B2E" }}>面談のURLは別途お知らせします。</span>
          )}
          <button onClick={downloadIcs} style={{ background: "none", border: 0, padding: 0, color: brand.tealDark, fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
            カレンダーに追加
          </button>
          <button onClick={cancel} disabled={busy} style={{ background: "none", border: 0, padding: 0, color: "#8A9694", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            日程を取り消して選び直す
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#5B6B6A", lineHeight: 1.7, marginTop: 8 }}>
          時間になったらURLを開いてください。静かな場所で、カメラとマイクが使える端末(スマートフォンでも可)をご用意ください。
        </div>
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 6 }}>{err}</div>}
      </div>
    );
  }

  if (!offered) return null;
  if (proposing) {
    return (
      <ProposalForm
        request={request}
        onCancel={() => setProposing(false)}
        onDone={() => {
          setProposing(false);
          onChanged();
        }}
      />
    );
  }
  if (slots === null) return <div style={{ ...box, fontSize: 13, color: "#8A9694" }}>候補日時を読み込んでいます…</div>;
  const proposeLink = (text: string) => (
    <button
      onClick={() => setProposing(true)}
      style={{ background: "none", border: 0, padding: 0, color: brand.tealDark, fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
    >
      {text}
    </button>
  );

  // 希望の日時を送って、医師の承認待ち
  if (proposed) {
    return (
      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 700, color: brand.ink }}>希望の日時を送りました(医師の確認待ち)</div>
        <div style={{ fontSize: 13, color: "#2C3B39", lineHeight: 1.8, marginTop: 4 }}>
          医師が確認して1つを承認すると日程が確定し、メールでお知らせします。どれも都合がつかない場合は、医師から改めて候補をお送りします。
        </div>
        <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13.5, color: brand.ink, lineHeight: 1.8 }}>
          {slots.map((s) => (
            <li key={s.id}>{formatSlot(s.starts_at, s.duration_min)}</li>
          ))}
        </ul>
        {request.proposal_note && <div style={{ fontSize: 12.5, color: "#5B6B6A", marginTop: 4 }}>補足: {request.proposal_note}</div>}
        <div style={{ marginTop: 8 }}>{proposeLink("希望の日時を送り直す")}</div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div style={{ ...box, fontSize: 13, color: "#8A6B2E", lineHeight: 1.8 }}>
        候補日時がなくなりました。医師から改めて候補をお知らせします。
        <div style={{ marginTop: 6 }}>{proposeLink("希望の日時を送る")}</div>
      </div>
    );
  }
  const byDate = new Map<string, Slot[]>();
  for (const s of slots) {
    const d = jstDateOf(s.starts_at);
    byDate.set(d, [...(byDate.get(d) ?? []), s]);
  }
  const timeOf = (iso: string) => formatSlot(iso, null).split(" ")[1];

  return (
    <div style={{ ...box, borderColor: "#F0D9A8", background: "#FFF8EE" }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: brand.ink }}>面談の候補日時が届いています。都合のよい日時を1つ選んでください</div>
      <div style={{ fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.7, margin: "4px 0 8px" }}>
        オンライン面談({request.duration_min ?? 30}分)です。選んだ時点で確定し、面談のURLをお知らせします。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {[...byDate.entries()].map(([d, list]) => (
          <div key={d}>
            <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 4 }}>{formatDateJa(d)}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {list.map((s) => {
                const on = picked === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => setPicked(s.id)}
                    style={{
                      fontSize: 13.5,
                      padding: "6px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      border: `1px solid ${on ? brand.teal : brand.line}`,
                      background: on ? brand.teal : "#fff",
                      color: on ? "#fff" : brand.ink,
                    }}
                  >
                    {timeOf(s.starts_at)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn tone="orange" onClick={choose} disabled={busy || !picked}>
          {busy ? "確定しています…" : "この日時で確定する"}
        </Btn>
      </div>
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 6 }}>{err}</div>}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed #F0D9A8`, fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.7 }}>
        どの候補も都合が合わない場合は、{proposeLink("希望の日時を送る")}
        (候補より後の日から{PROPOSAL_MAX}つまで選べます。医師が確認して確定します)
      </div>
    </div>
  );
}

// 本人が希望の日時を送る(医師の候補の最終日より後の営業日から5つまで)
function ProposalForm({ request, onCancel, onDone }: { request: InterviewRequest; onCancel: () => void; onDone: () => void }) {
  const duration = request.duration_min ?? 30;
  const times = proposalTimeOptions(duration);
  const [firstDate, setFirstDate] = useState<string | null>(null);
  const [rows, setRows] = useState<Proposal[]>(() => Array.from({ length: PROPOSAL_MAX }, () => ({ date: "", start: "" })));
  const [note, setNote] = useState(request.proposal_note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 医師の候補の最終日を調べ、その翌営業日から選べるようにする
  useEffect(() => {
    (async () => {
      const { data } = await createClient()
        .from("interview_slots")
        .select("starts_at")
        .eq("request_id", request.id)
        .eq("proposed_by_user", false)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setFirstDate(proposalFirstDate(data?.starts_at ? jstDateOf(data.starts_at as string) : null));
    })();
  }, [request.id]);

  const maxDate = (() => {
    const d = new Date(`${jstToday()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + OFFER_MAX_DAYS_AHEAD);
    return d.toISOString().slice(0, 10);
  })();
  const filled = rows.filter((r) => r.date && r.start);
  const setRow = (i: number, patch: Partial<Proposal>) => setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!firstDate) return;
    const bad = validateProposals(filled, duration, firstDate);
    if (bad) return setErr(bad);
    if (filled.length < PROPOSAL_MAX && !window.confirm(`希望の日時が${filled.length}つです。できれば${PROPOSAL_MAX}つ選んでいただくと日程が決まりやすくなります。このまま送りますか？`)) return;
    setBusy(true);
    setErr(null);
    const { ok, json } = await postJson<{ error?: string }>("/api/interview/propose", { requestId: request.id, proposals: filled, note });
    setBusy(false);
    if (!ok) return setErr(json.error ?? "送れませんでした");
    onDone();
  };

  const sel = { fontSize: 14, padding: "6px 8px", border: `1px solid ${brand.line}`, borderRadius: 6, background: "#fff" } as const;
  return (
    <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${brand.teal}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: brand.ink }}>希望の日時を送る</div>
      <div style={{ fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.7, margin: "4px 0 10px" }}>
        {firstDate ? <strong>{formatDateJa(firstDate)}</strong> : "…"} 以降の平日(土日・祝日を除く)から、都合のよい日時をできるだけ{PROPOSAL_MAX}つ選んでください。
        オンライン面談({duration}分)です。医師が確認して1つを承認すると確定し、メールでお知らせします。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r, i) => {
          const holiday = r.date && !isBusinessDay(r.date);
          return (
            <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: brand.ink, width: 52 }}>希望{i + 1}</span>
              <input
                type="date"
                value={r.date}
                min={firstDate ?? undefined}
                max={maxDate}
                onChange={(e) => setRow(i, { date: e.target.value })}
                style={sel}
                aria-label={`希望${i + 1}の日付`}
              />
              <select value={r.start} onChange={(e) => setRow(i, { start: e.target.value })} style={sel} aria-label={`希望${i + 1}の開始時刻`}>
                <option value="">時刻</option>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {t}〜
                  </option>
                ))}
              </select>
              {holiday && <span style={{ fontSize: 12, color: "#B02A2A" }}>土日・祝日は選べません</span>}
            </div>
          );
        })}
      </div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: brand.ink, margin: "10px 0 4px" }}>日程についての補足(任意。例: 15時以降なら可)</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, PROPOSAL_NOTE_MAX))}
        style={{ ...sel, width: "100%", boxSizing: "border-box" }}
      />
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <Btn tone="orange" onClick={submit} disabled={busy || !firstDate || filled.length === 0}>
          {busy ? "送っています…" : `希望の日時を送る(${filled.length}件)`}
        </Btn>
        <button onClick={onCancel} disabled={busy} style={{ background: "none", border: 0, padding: 0, color: "#8A9694", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          やめる
        </button>
      </div>
    </div>
  );
}
