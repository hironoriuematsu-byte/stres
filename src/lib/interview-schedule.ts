// 面接指導の日程調整(画面とサーバーで共通の定義)
//   オンライン: 医師が日ごとの空き時間帯を入れる → 15分刻みの候補 → 本人が1つ選んで確定
//   次回訪問:   医師が訪問日を入れる → 本人と会社の担当者に案内(時間は担当者が調整)
//   本人の希望: 候補に都合の合う日時がないとき、本人が候補の最終日より後の営業日から希望日時を5つまで送る → 医師が1つ承認して確定

import { businessDaysFrom, isBusinessDay, nextBusinessDay } from "@/lib/jp-holidays";

export type ScheduleMode = "online" | "visit";
export type SlotStatus = "open" | "chosen" | "withdrawn" | "proposed" | "declined";
export type Slot = { id: string; request_id: string; starts_at: string; duration_min: number; status: SlotStatus; proposed_by_user?: boolean };
export type Proposal = { date: string; start: string }; // 本人の希望日時(日本時間)
export type TimeRange = { date: string; start: string; end: string }; // date: YYYY-MM-DD, start/end: HH:MM(日本時間)

export const SLOT_STEP_MIN = 15; // 候補の刻み
export const DURATION_OPTIONS = [15, 30, 45, 60] as const;
export const DEFAULT_DURATION_MIN = 30;
export const OFFER_WINDOW_DAYS = 7; // 翌営業日から1週間分
export const OFFER_MAX_DAYS_AHEAD = 60; // 候補にできるのは今日からこの日数まで
export const DAY_START = "08:00"; // 時間帯の選択肢の範囲
export const DAY_END = "20:00";
export const MAX_SLOTS = 200;
export const PROPOSAL_MAX = 5; // 本人が送れる希望日時の数
export const PROPOSAL_NOTE_MAX = 200;

const RE_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const toMinutes = (hhmm: string): number => {
  const m = RE_TIME.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
export const fromMinutes = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// 日本時間の日付と時刻を ISO 文字列にする
export const jstIso = (date: string, hhmm: string): string => new Date(`${date}T${hhmm}:00+09:00`).toISOString();

// 日本時間の「今日」(YYYY-MM-DD)
export const jstToday = (now: Date = new Date()): string => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

// 候補を出す既定の期間: 翌営業日から1週間分の営業日
export function defaultOfferDays(now: Date = new Date()): { from: string; days: string[] } {
  const from = nextBusinessDay(jstToday(now));
  return { from, days: businessDaysFrom(from, OFFER_WINDOW_DAYS) };
}

// 時間帯の選択肢(15分刻み)
export function timeOptions(): string[] {
  const out: string[] = [];
  for (let m = toMinutes(DAY_START); m <= toMinutes(DAY_END); m += SLOT_STEP_MIN) out.push(fromMinutes(m));
  return out;
}

// 時間帯の入力を確かめる(形・刻み・順序・日付の範囲)。問題があれば理由を返す
export function validateRanges(ranges: TimeRange[], durationMin: number, now: Date = new Date()): string | null {
  if (!DURATION_OPTIONS.includes(durationMin as (typeof DURATION_OPTIONS)[number])) return "面談時間の指定が不正です";
  if (ranges.length === 0) return "空いている時間帯を1つ以上入れてください";
  const today = jstToday(now);
  const limit = new Date(`${today}T00:00:00+09:00`);
  limit.setUTCDate(limit.getUTCDate() + OFFER_MAX_DAYS_AHEAD);
  for (const r of ranges) {
    if (!RE_DATE.test(r.date) || Number.isNaN(new Date(`${r.date}T00:00:00Z`).getTime())) return "日付の形式が不正です";
    if (r.date <= today) return "候補にできるのは明日以降の日付です";
    if (new Date(`${r.date}T00:00:00+09:00`) > limit) return `候補にできるのは${OFFER_MAX_DAYS_AHEAD}日先までです`;
    const s = toMinutes(r.start);
    const e = toMinutes(r.end);
    if (Number.isNaN(s) || Number.isNaN(e)) return "時刻の形式が不正です";
    if (s % SLOT_STEP_MIN !== 0 || e % SLOT_STEP_MIN !== 0) return `時刻は${SLOT_STEP_MIN}分単位で入れてください`;
    if (e - s < durationMin) return `${r.date} の時間帯が面談時間(${durationMin}分)より短いです`;
  }
  return null;
}

// 時間帯を候補(開始時刻の ISO 文字列)に広げる。15分刻みで、面談時間が時間帯に収まる開始時刻だけ
export function expandSlots(ranges: TimeRange[], durationMin: number): string[] {
  const out = new Set<string>();
  for (const r of ranges) {
    const s = toMinutes(r.start);
    const e = toMinutes(r.end);
    for (let m = s; m + durationMin <= e; m += SLOT_STEP_MIN) out.add(jstIso(r.date, fromMinutes(m)));
  }
  return [...out].sort();
}

// 本人が希望日時を選べる最初の日: 医師の候補の最終日(なければ今日)の翌営業日。今日より前にはしない
export function proposalFirstDate(lastOfferedDate: string | null, now: Date = new Date()): string {
  const today = jstToday(now);
  const base = lastOfferedDate && lastOfferedDate > today ? lastOfferedDate : today;
  return nextBusinessDay(base);
}

// 本人の希望日時を確かめる(数・形・刻み・営業日・選べる期間・面談時間が時間帯に収まるか・重複)。問題があれば理由を返す
export function validateProposals(
  proposals: Proposal[],
  durationMin: number,
  firstDate: string,
  now: Date = new Date()
): string | null {
  if (proposals.length === 0) return "希望の日時を1つ以上選んでください";
  if (proposals.length > PROPOSAL_MAX) return `希望の日時は${PROPOSAL_MAX}つまでです`;
  const today = jstToday(now);
  const limit = new Date(`${today}T00:00:00+09:00`);
  limit.setUTCDate(limit.getUTCDate() + OFFER_MAX_DAYS_AHEAD);
  const seen = new Set<string>();
  for (const p of proposals) {
    if (!RE_DATE.test(p.date) || Number.isNaN(new Date(`${p.date}T00:00:00Z`).getTime())) return "日付の形式が不正です";
    if (p.date < firstDate) return `希望の日時は ${formatDateJa(firstDate)} 以降の日にしてください`;
    if (new Date(`${p.date}T00:00:00+09:00`) > limit) return `希望の日時は${OFFER_MAX_DAYS_AHEAD}日先までにしてください`;
    if (!isBusinessDay(p.date)) return `${formatDateJa(p.date)} は土日・祝日のため選べません`;
    const s = toMinutes(p.start);
    if (Number.isNaN(s) || s % SLOT_STEP_MIN !== 0) return `時刻は${SLOT_STEP_MIN}分単位で選んでください`;
    if (s < toMinutes(DAY_START) || s + durationMin > toMinutes(DAY_END)) return `時刻は${DAY_START}〜${DAY_END}の間で選んでください`;
    const key = jstIso(p.date, p.start);
    if (seen.has(key)) return "同じ日時が2回選ばれています";
    seen.add(key);
  }
  // 選んだ日時どうしが重ならないように(例: 30分の面談で 10:00 と 10:15)
  const keys = [...seen].sort();
  for (let i = 1; i < keys.length; i++) {
    if (overlaps(keys[i - 1], durationMin, keys[i], durationMin)) return "時間が重なっている希望があります。間をあけて選んでください";
  }
  return null;
}

// 希望日時の開始時刻の選択肢(面談時間が DAY_END までに収まるもの)
export function proposalTimeOptions(durationMin: number): string[] {
  return timeOptions().filter((t) => toMinutes(t) + durationMin <= toMinutes(DAY_END));
}

// 2つの面談の時間が重なるか
export function overlaps(aStart: string, aMin: number, bStart: string, bMin: number): boolean {
  const a0 = new Date(aStart).getTime();
  const a1 = a0 + aMin * 60_000;
  const b0 = new Date(bStart).getTime();
  const b1 = b0 + bMin * 60_000;
  return a0 < b1 && b0 < a1;
}

// 既に確定している面談と重なる候補を除く
export function excludeBooked(starts: string[], durationMin: number, booked: { starts_at: string; duration_min: number }[]): string[] {
  return starts.filter((s) => !booked.some((b) => overlaps(s, durationMin, b.starts_at, b.duration_min)));
}

// 表示用: 2026年10月28日(火) 10:00〜10:30
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
export function formatSlot(startsAt: string, durationMin?: number | null): string {
  const d = new Date(startsAt);
  const j = new Date(d.getTime() + 9 * 3600_000);
  const date = `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日(${DOW[j.getUTCDay()]})`;
  const t = `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
  if (!durationMin) return `${date} ${t}`;
  const e = new Date(d.getTime() + durationMin * 60_000 + 9 * 3600_000);
  return `${date} ${t}〜${String(e.getUTCHours()).padStart(2, "0")}:${String(e.getUTCMinutes()).padStart(2, "0")}`;
}
export function formatDateJa(ymd: string): string {
  const j = new Date(`${ymd}T00:00:00Z`);
  return `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日(${DOW[j.getUTCDay()]})`;
}
// 日本時間の日付(YYYY-MM-DD)を取り出す
export const jstDateOf = (iso: string): string => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

// Google Meet などのURLか
export const validMeetUrl = (s: string): boolean => /^https:\/\/[^\s]+$/.test(s) && s.length <= 500;
