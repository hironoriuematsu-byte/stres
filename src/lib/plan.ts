// ============================================================
// Web申込(顧問契約のない企業向けのクレジットカード決済プラン)の料金・受検期間・入力チェック。
// 画面(宣伝ページ・申込フォーム)とサーバー(決済の作成・開設処理)で同じ計算を使う。
// 金額はすべて税込・円。
// ============================================================

import { getFiscalYear } from "@/lib/fiscal";

// 導入記念価格(1シーズン運用してから見直す)
export const UNIT_PRICE = 330; // 受検者1名あたり(税込)
export const MIN_TOTAL = 5500; // 最低料金(税込)
export const MIN_TOTAL_SEATS = Math.ceil(MIN_TOTAL / UNIT_PRICE); // 最低料金で受検できる人数(17名)
export const MAX_SEATS = 10000;
// 産業医面接指導(うえまつ産業医事務所が担当する場合。1回・オンライン可・意見書込み・税込)
export const INTERVIEW_FEE = 22000;

export const DEFAULT_PERIOD_DAYS = 28; // 受検期間の標準(4週間)
export const MAX_PERIOD_MONTHS = 3; // 締切を延ばせるのは開始から3か月まで(年度末を超えない)
export const MAX_START_AHEAD_DAYS = 180; // 開始日は申込日から半年先まで

export type InterviewOption = "own" | "mestate" | "sanpo";
export const INTERVIEW_OPTIONS: { value: InterviewOption; label: string; desc: string }[] = [
  {
    value: "mestate",
    label: "うえまつ産業医事務所の医師が行う(有料)",
    desc: `申出があった方ごとに1回 ${INTERVIEW_FEE.toLocaleString()}円(税込)。オンライン可・意見書込み。実施後にご請求します。`,
  },
  {
    value: "own",
    label: "自社の産業医が行う",
    desc: "申出があったときは会社の担当者に通知が届きます。自社の産業医と日程を調整してください。",
  },
  {
    value: "sanpo",
    label: "地域産業保健センター(無料)を利用する(50人未満の事業場)",
    desc: "申出があったときは、最寄りの地域産業保健センターへの申込方法をご案内します。",
  },
];

export const interviewOptionLabel = (v: string | null | undefined): string =>
  INTERVIEW_OPTIONS.find((o) => o.value === v)?.label ?? "未選択";

// ---- 料金 ----

export type PriceLine = { name: string; unitAmount: number; quantity: number };

// 新規申込の料金。人数×単価が最低料金に満たないときは最低料金(1行)にする
export function priceNew(seats: number): { total: number; lines: PriceLine[] } {
  const byUnit = seats * UNIT_PRICE;
  if (byUnit >= MIN_TOTAL) {
    return {
      total: byUnit,
      lines: [{ name: "ストレスチェック(受検者1名あたり・集団分析込み)", unitAmount: UNIT_PRICE, quantity: seats }],
    };
  }
  return {
    total: MIN_TOTAL,
    lines: [
      {
        name: `ストレスチェック 最低料金(${MIN_TOTAL_SEATS}名分まで・集団分析込み)`,
        unitAmount: MIN_TOTAL,
        quantity: 1,
      },
    ],
  };
}

// 人数の追加購入(最低料金なし)
export function priceAdd(seats: number): { total: number; lines: PriceLine[] } {
  return {
    total: seats * UNIT_PRICE,
    lines: [{ name: "ストレスチェック 受検人数の追加(1名あたり)", unitAmount: UNIT_PRICE, quantity: seats }],
  };
}

// 税込金額に含まれる消費税(10%)
export const taxIncluded = (total: number): number => Math.floor((total * 10) / 110);

// 最低料金の範囲で受検できる人数(新規申込で購入人数が少ないときは、最低料金分まで受検枠を付ける)
export const seatsGranted = (seats: number): number => Math.max(seats, MIN_TOTAL_SEATS);

// ---- 日付(日本時間の YYYY-MM-DD) ----

const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function jstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function parseDate(s: string): Date | null {
  const m = RE_DATE.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? d : null;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(s: string, days: number): string {
  const d = parseDate(s)!;
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

// 日付の年度(4月始まり)
export function fiscalYearOf(s: string): number {
  const d = parseDate(s)!;
  return getFiscalYear(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// 締切を延ばせる最終日: 開始日から3か月(の前日)と、その年度の末日(3/31)の早い方
export function maxEndOf(start: string): string {
  const d = parseDate(start)!;
  const threeMonths = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + MAX_PERIOD_MONTHS, d.getUTCDate() - 1));
  const fyEnd = new Date(Date.UTC(fiscalYearOf(start) + 1, 2, 31));
  return fmt(threeMonths < fyEnd ? threeMonths : fyEnd);
}

// 標準の締切日: 開始から4週間後(延ばせる最終日を超えない)
export function defaultEndOf(start: string): string {
  const end = addDays(start, DEFAULT_PERIOD_DAYS - 1);
  const max = maxEndOf(start);
  return end < max ? end : max;
}

// 表示用: 2026-10-13 → 2026年10月13日
export function formatJpDate(s: string | null | undefined): string {
  if (!s) return "";
  const m = RE_DATE.exec(s);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : s;
}

export function periodError(start: string, end: string, today: string = jstToday()): string | null {
  if (!parseDate(start)) return "開始日を正しく入力してください";
  if (!parseDate(end)) return "締切日を正しく入力してください";
  if (start < today) return "開始日は今日以降の日付を指定してください";
  if (start > addDays(today, MAX_START_AHEAD_DAYS)) return "開始日は半年以内の日付を指定してください";
  if (end < start) return "締切日は開始日以降の日付を指定してください";
  const max = maxEndOf(start);
  if (end > max) {
    return `締切日は${formatJpDate(max)}までの日付を指定してください(受検期間は最長3か月で、年度をまたげません)`;
  }
  return null;
}

// ---- 申込フォームの入力 ----

export type ApplyInput = {
  companyName: string;
  officeName: string;
  address: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  workers: number; // 事業場の労働者数
  seats: number; // 受検予定人数
  questionnaire: "57" | "80";
  examStart: string;
  examEnd: string;
  interviewOption: InterviewOption;
  agreeTerms: boolean; // 利用規約(業務委託の内容を含む)への同意
  agreeProcedure: boolean; // 実施方法の決定・周知を事業者が行うことの確認
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFKC").trim().slice(0, max) : "");
const int = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.normalize("NFKC").trim()) : NaN;
  return Number.isInteger(n) ? n : NaN;
};

export function parseApplyInput(
  raw: Record<string, unknown>,
  today: string = jstToday()
): { ok: true; value: ApplyInput } | { ok: false; error: string } {
  const v: ApplyInput = {
    companyName: str(raw.companyName, 100),
    officeName: str(raw.officeName, 100),
    address: str(raw.address, 200),
    contactName: str(raw.contactName, 60),
    contactEmail: str(raw.contactEmail, 200).toLowerCase(),
    contactPhone: str(raw.contactPhone, 30),
    workers: int(raw.workers),
    seats: int(raw.seats),
    questionnaire: raw.questionnaire === "80" ? "80" : "57",
    examStart: str(raw.examStart, 10),
    examEnd: str(raw.examEnd, 10),
    interviewOption: (["own", "mestate", "sanpo"] as const).find((o) => o === raw.interviewOption) as InterviewOption,
    agreeTerms: raw.agreeTerms === true,
    agreeProcedure: raw.agreeProcedure === true,
  };
  if (!v.companyName) return { ok: false, error: "会社名を入力してください" };
  if (!v.address) return { ok: false, error: "事業場の所在地を入力してください" };
  if (!v.contactName) return { ok: false, error: "ご担当者の氏名を入力してください" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contactEmail)) return { ok: false, error: "メールアドレスを正しく入力してください" };
  if (!/^[0-9+\-() ]{10,}$/.test(v.contactPhone)) return { ok: false, error: "電話番号を正しく入力してください" };
  if (!(v.workers >= 1 && v.workers <= 100000)) return { ok: false, error: "事業場の労働者数を入力してください" };
  if (!(v.seats >= 1 && v.seats <= MAX_SEATS)) return { ok: false, error: `受検予定人数は1〜${MAX_SEATS}名で入力してください` };
  const pe = periodError(v.examStart, v.examEnd, today);
  if (pe) return { ok: false, error: pe };
  if (!v.interviewOption) return { ok: false, error: "産業医面接指導の担当を選んでください" };
  if (v.interviewOption === "sanpo" && v.workers >= 50) {
    return {
      ok: false,
      error: "地域産業保健センターは50人未満の事業場が対象です。50人以上の事業場は、自社の産業医または当事務所をお選びください",
    };
  }
  if (!v.agreeTerms) return { ok: false, error: "利用規約への同意が必要です" };
  if (!v.agreeProcedure) return { ok: false, error: "実施方法の決定と従業員への周知についてご確認ください" };
  return { ok: true, value: v };
}
