"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";
import type { InterviewRequest } from "@/lib/types";
import { formatDateJa, formatSlot, jstDateOf, type Slot } from "@/lib/interview-schedule";

// 本人向け: 医師が出した候補日時から1つ選ぶ / 確定した日程とオンライン面談のURLを見る
export function InterviewSchedulePick({ request, onChanged }: { request: InterviewRequest; onChanged: () => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const offered = request.status === "pending" && request.schedule_mode === "online" && Boolean(request.slots_offered_at);

  const load = useCallback(async () => {
    if (!offered) return setSlots([]);
    const { data } = await createClient()
      .from("interview_slots")
      .select("id, request_id, starts_at, duration_min, status")
      .eq("request_id", request.id)
      .eq("status", "open")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at");
    setSlots((data as Slot[] | null) ?? []);
  }, [request.id, offered]);
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
  if (slots === null) return <div style={{ ...box, fontSize: 13, color: "#8A9694" }}>候補日時を読み込んでいます…</div>;
  if (slots.length === 0) {
    return <div style={{ ...box, fontSize: 13, color: "#8A6B2E" }}>候補日時がなくなりました。医師から改めて候補をお知らせします。</div>;
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
    </div>
  );
}
