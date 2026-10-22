"use client";

import { useMemo, useState } from "react";
import { Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";
import type { InterviewRequest } from "@/lib/types";
import { businessDaysFrom } from "@/lib/jp-holidays";
import {
  DEFAULT_DURATION_MIN,
  DURATION_OPTIONS,
  OFFER_WINDOW_DAYS,
  defaultOfferDays,
  expandSlots,
  formatDateJa,
  formatSlot,
  jstDateOf,
  jstToday,
  timeOptions,
  toMinutes,
  type TimeRange,
} from "@/lib/interview-schedule";

type Range = { start: string; end: string };
const TIMES = timeOptions();

// 実施者(医師)向け: 面接指導の日程を決める
//   オンライン: 翌営業日から1週間分の営業日ごとに空いている時間帯を入れる → 15分刻みの候補を本人に送る
//   次回訪問:   訪問日を入れる → 本人と会社の担当者に案内する
export function InterviewScheduleEditor({
  request,
  meetRoomUrl,
  onChanged,
}: {
  request: InterviewRequest;
  meetRoomUrl: string | null;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"online" | "visit">(request.schedule_mode === "visit" ? "visit" : "online");
  const [duration, setDuration] = useState<number>(request.duration_min ?? DEFAULT_DURATION_MIN);
  const [from, setFrom] = useState(() => defaultOfferDays().from);
  const [ranges, setRanges] = useState<Record<string, Range[]>>({});
  const [visitDate, setVisitDate] = useState(request.schedule_mode === "visit" && request.scheduled_at ? jstDateOf(request.scheduled_at) : "");
  const [visitNote, setVisitNote] = useState(request.visit_note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const days = useMemo(() => businessDaysFrom(from, OFFER_WINDOW_DAYS), [from]);
  const flat: TimeRange[] = useMemo(
    () => days.flatMap((d) => (ranges[d] ?? []).filter((r) => toMinutes(r.end) - toMinutes(r.start) >= duration).map((r) => ({ date: d, ...r }))),
    [days, ranges, duration]
  );
  const count = useMemo(() => expandSlots(flat, duration).length, [flat, duration]);

  const setRange = (d: string, i: number, patch: Partial<Range>) =>
    setRanges((p) => ({ ...p, [d]: (p[d] ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addRange = (d: string) => setRanges((p) => ({ ...p, [d]: [...(p[d] ?? []), { start: "10:00", end: "12:00" }] }));
  const removeRange = (d: string, i: number) => setRanges((p) => ({ ...p, [d]: (p[d] ?? []).filter((_, j) => j !== i) }));
  const copyFirst = () => {
    const first = days.find((d) => (ranges[d] ?? []).length > 0);
    if (!first) return;
    setRanges((p) => Object.fromEntries(days.map((d) => [d, (p[first] ?? []).map((r) => ({ ...r }))])));
  };

  const call = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    const { ok, json } = await postJson<{ count?: number; error?: string }>("/api/interview/offer", { requestId: request.id, ...payload });
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: json.error ?? "保存できませんでした" });
    setMsg({ ok: true, text: done.replace("{n}", String(json.count ?? "")) });
    onChanged();
  };
  const sendOnline = () => {
    if (count === 0) return setMsg({ ok: false, text: "空いている時間帯を1つ以上入れてください" });
    call({ mode: "online", durationMin: duration, ranges: flat }, "候補{n}件を本人に送りました。本人が選ぶと日程が確定し、メールでお知らせします。");
  };
  const sendVisit = () => {
    if (!visitDate) return setMsg({ ok: false, text: "訪問日を入れてください" });
    call({ mode: "visit", visitDate, visitNote }, "次回訪問日の面談として、本人と会社の担当者に案内しました。");
  };
  const reset = () => {
    if (!window.confirm("候補・確定した日程を取り消して、申出受付の状態に戻します。よろしいですか？(確定していた場合は本人にお知らせします)")) return;
    call({ action: "reset" }, "日程を取り消しました。");
  };

  const scheduled = request.status === "scheduled" && request.scheduled_at;
  const offered = request.status === "pending" && request.schedule_mode === "online" && request.slots_offered_at;
  const label = { display: "block", fontSize: 12, fontWeight: 700, color: brand.ink, marginBottom: 4 } as const;
  const sel = { fontSize: 13, padding: "4px 6px", border: `1px solid ${brand.line}`, borderRadius: 6 } as const;

  return (
    <div style={{ background: "#FAFCFC", border: `1px solid ${brand.line}`, borderRadius: 10, padding: 14, display: "grid", gap: 12 }}>
      <strong style={{ fontSize: 14, color: brand.ink }}>面談の日程</strong>

      {(scheduled || offered) && (
        <div style={{ fontSize: 13, color: brand.ink, background: "#E2F3F1", borderRadius: 8, padding: "8px 12px", lineHeight: 1.7, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span>
            {scheduled
              ? request.schedule_mode === "visit"
                ? `次回訪問日 ${formatDateJa(jstDateOf(request.scheduled_at!))} に対面で実施${request.visit_note ? `(${request.visit_note})` : ""}`
                : `確定: ${formatSlot(request.scheduled_at!, request.duration_min)} オンライン${request.meet_url ? ` / ${request.meet_url}` : ""}`
              : `候補を送信済み(${new Date(request.slots_offered_at!).toLocaleDateString("ja-JP")})・本人の選択待ち`}
          </span>
          <button onClick={reset} disabled={busy} style={{ background: "none", border: 0, padding: 0, color: "#B02A2A", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
            {scheduled ? "取り消して出し直す" : "候補を出し直す"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13.5 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="radio" checked={mode === "online"} onChange={() => setMode("online")} /> オンラインで候補日時を出す
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="radio" checked={mode === "visit"} onChange={() => setMode("visit")} /> 次回訪問時に対面で行う
        </label>
      </div>

      {mode === "online" ? (
        <>
          {!meetRoomUrl && (
            <div style={{ fontSize: 12.5, color: "#8A6B2E", background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 8, padding: "8px 10px", lineHeight: 1.7 }}>
              この企業の産業医面談ルーム(Google Meet)のURLが未登録です。一覧の上の欄で先に登録してください(確定した面談にそのURLを付けて案内します)。
            </div>
          )}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <span style={label}>面談時間</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={sel}>
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}分
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span style={label}>この日から1週間分(営業日のみ)</span>
              <input type="date" value={from} min={jstToday()} onChange={(e) => e.target.value && setFrom(e.target.value)} style={sel} />
            </div>
            <button onClick={copyFirst} disabled={busy} style={{ background: "none", border: `1px solid ${brand.line}`, borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", color: brand.tealDark }}>
              最初に入れた日の時間帯を全部の日にコピー
            </button>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {days.map((d) => (
              <div key={d} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${brand.line}` }}>
                <span style={{ minWidth: 150, fontWeight: 700, color: brand.ink }}>{formatDateJa(d)}</span>
                {(ranges[d] ?? []).map((r, i) => (
                  <span key={i} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <select value={r.start} onChange={(e) => setRange(d, i, { start: e.target.value })} style={sel}>
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    〜
                    <select value={r.end} onChange={(e) => setRange(d, i, { end: e.target.value })} style={sel}>
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => removeRange(d, i)} style={{ background: "none", border: 0, color: "#B02A2A", cursor: "pointer", fontSize: 12 }}>
                      外す
                    </button>
                  </span>
                ))}
                <button onClick={() => addRange(d)} disabled={busy} style={{ background: "none", border: `1px dashed ${brand.line}`, borderRadius: 6, padding: "3px 8px", fontSize: 12, cursor: "pointer", color: brand.tealDark }}>
                  + 空いている時間帯
                </button>
              </div>
            ))}
            {days.length === 0 && <div style={{ fontSize: 13, color: "#8A9694" }}>この週に営業日がありません。開始日を変えてください。</div>}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={sendOnline} disabled={busy || count === 0 || !meetRoomUrl}>
              {busy ? "送っています…" : `候補を本人に送る(${count}件・${duration}分枠)`}
            </Btn>
            <span style={{ fontSize: 12, color: "#5B6B6A" }}>15分刻みの開始時刻が候補になります。すでに確定している面談と重なる時刻は自動で除きます。</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <span style={label}>次回の訪問日</span>
              <input type="date" value={visitDate} min={jstToday()} onChange={(e) => setVisitDate(e.target.value)} style={sel} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span style={label}>補足(任意。例: 午後の訪問、会議室で)</span>
              <input value={visitNote} onChange={(e) => setVisitNote(e.target.value.slice(0, 200))} style={{ ...sel, width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={sendVisit} disabled={busy || !visitDate}>
              {busy ? "送っています…" : "本人と会社の担当者に案内する"}
            </Btn>
            <span style={{ fontSize: 12, color: "#5B6B6A" }}>当日の時間と場所は、会社の担当者が本人と調整します(担当者にメールでお願いします)。</span>
          </div>
        </>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.ok ? brand.tealDark : "#B02A2A" }}>{msg.text}</div>}
    </div>
  );
}

// 一覧の「状況」欄に添える日程の短い表示
export function scheduleSummary(r: InterviewRequest): string | null {
  if (r.status === "scheduled" && r.scheduled_at) {
    return r.schedule_mode === "visit" ? `次回訪問日 ${formatDateJa(jstDateOf(r.scheduled_at))} に対面` : `${formatSlot(r.scheduled_at, r.duration_min)} オンライン`;
  }
  if (r.status === "pending" && r.schedule_mode === "online" && r.slots_offered_at) return "候補を送信済み・本人の選択待ち";
  return null;
}
