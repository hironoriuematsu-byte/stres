// ============================================================
// Web申込(顧問契約のない企業向けのクレジットカード決済プラン)の料金・受検期間・入力チェック。
// 画面(宣伝ページ・申込フォーム)とサーバー(決済の作成・開設処理)で同じ計算を使う。
// 金額はすべて税込・円。
// ============================================================

import { getFiscalYear } from "@/lib/fiscal";

// 料金は年度ごとにデータベース(plan_prices)で設定する(実施者の画面から、次の年度以降の料金を事前に変更できる)。
// ここの値は、データベースに設定がないとき(または読めないとき)の料金
export const UNIT_PRICE = 330; // 受検者1名あたり(税込)
export const MIN_TOTAL = 3300; // 最低料金(税込)
export const MIN_TOTAL_SEATS = Math.ceil(MIN_TOTAL / UNIT_PRICE); // 最低料金で受検できる人数(10名)

// お支払い方法の表示(Stripe の管理画面で有効にした支払い方法に合わせて変える)
export const PAYMENT_METHODS_TEXT = "クレジットカード";

// 年度の料金
export type Pricing = { unitPrice: number; minTotal: number };
export const DEFAULT_PRICING: Pricing = { unitPrice: UNIT_PRICE, minTotal: MIN_TOTAL };
export type PlanPriceRow = { fiscal_year: number; unit_price: number; min_total: number; note?: string | null };
// その年度の料金(その年度の設定がなければ、それより前で最も新しい年度の料金)
export function pricingFor(rows: PlanPriceRow[] | null | undefined, fiscalYear: number): Pricing {
  const r = (rows ?? []).filter((x) => x.fiscal_year <= fiscalYear).sort((a, b) => b.fiscal_year - a.fiscal_year)[0];
  return r ? { unitPrice: r.unit_price, minTotal: r.min_total } : DEFAULT_PRICING;
}
// 最低料金で受検できる人数
export const minSeats = (p: Pricing = DEFAULT_PRICING): number => Math.max(1, Math.ceil(p.minTotal / p.unitPrice));
// 次の年度以降に料金の改定が予定されていれば、最も近いものを返す(宣伝ページなどでの事前のお知らせ用)
export function upcomingPriceChange(rows: PlanPriceRow[] | null | undefined, currentYear: number): (PlanPriceRow & { pricing: Pricing }) | null {
  const cur = pricingFor(rows, currentYear);
  const next = (rows ?? [])
    .filter((x) => x.fiscal_year > currentYear && (x.unit_price !== cur.unitPrice || x.min_total !== cur.minTotal))
    .sort((a, b) => a.fiscal_year - b.fiscal_year)[0];
  return next ? { ...next, pricing: { unitPrice: next.unit_price, minTotal: next.min_total } } : null;
}
export const MAX_SEATS = 10000; // 人数の追加購入の上限
export const WEB_MAX_SEATS = 300; // Web申込(カード決済)は300名(99,000円)まで。超える場合は個別のお見積り(割引あり)
// 宣伝ページ・社内検討用資料に載せる料金の例(受検予定人数)
export const PRICE_EXAMPLES = [5, 10, 30, 50, 100, 300];
export const QUOTE_MAILTO = `mailto:support@mestate.jp?subject=${encodeURIComponent("ストレスチェック 300名を超える場合のお見積り")}`;
// 産業医面接指導(うえまつ産業医事務所が担当する場合。1回・オンライン可・意見書込み・税込)
export const INTERVIEW_FEE = 22000;

export const DEFAULT_PERIOD_DAYS = 28; // 受検期間の標準(4週間)
export const MAX_PERIOD_MONTHS = 3; // 締切を延ばせるのは開始から3か月まで(年度末を超えない)
export const MAX_START_AHEAD_DAYS = 180; // 開始日は申込日から半年先まで

// 医師面接指導の担当。申込時に選べるのは「自社で医師を探して依頼」か「うえまつ産業医事務所に依頼」の2つ
// ("sanpo" = 地域産業保健センターは以前の選択肢。過去の申込の表示のためだけに残す)
export type InterviewOption = "own" | "mestate" | "sanpo";
export const INTERVIEW_OPTIONS: { value: InterviewOption; label: string; desc: string }[] = [
  {
    value: "own",
    label: "自社で医師を探して依頼する",
    desc: "申出の通知は会社の担当者だけに届きます。自社の産業医など、会社で手配した医師に面接指導をご依頼ください。",
  },
  {
    value: "mestate",
    label: `うえまつ産業医事務所に依頼する(1回 ${INTERVIEW_FEE.toLocaleString()}円・税込)`,
    desc: "オンライン可・意見書込み。申出の通知は当事務所(実施者)と会社の担当者に届き、日程は当事務所からご連絡します。料金は面接指導の実施後に、請求書をメールでお送りします。",
  },
];

export const interviewOptionLabel = (v: string | null | undefined): string =>
  INTERVIEW_OPTIONS.find((o) => o.value === v)?.label ?? (v === "sanpo" ? "地域産業保健センターを利用する" : "未選択");

// 面接指導を行う医師(申出一覧などでの短い表示)
export const interviewDoctorLabel = (v: string | null | undefined): string =>
  v === "mestate" ? "うえまつ産業医事務所の医師" : v === "own" ? "自社で依頼する医師" : v === "sanpo" ? "地域産業保健センターの医師" : "未選択";

// 面接指導の申出を実施者(うえまつ産業医事務所)にも知らせるか。
// Web申込の企業は「うえまつ産業医事務所に依頼」を選んだときだけ。「自社で医師を探して依頼」のときは会社の担当者のみ
export const interviewNotifiesOffice = (webSignup: boolean, option: string | null | undefined): boolean =>
  !webSignup || option === "mestate" || !option;

// 医師面接指導の担当の選び方のチェック(申込時・変更時の共通)。workers は以前の選択肢の名残で、今は使わない
export function interviewOptionError(option: string | null | undefined, _workers?: number | null): string | null {
  if (!option || !INTERVIEW_OPTIONS.some((o) => o.value === option)) return "医師面接指導の担当を選んでください";
  return null;
}

// ---- 料金 ----

export type PriceLine = { name: string; unitAmount: number; quantity: number };

// 新規申込の料金。人数×単価が最低料金に満たないときは最低料金(1行)にする
export function priceNew(seats: number, p: Pricing = DEFAULT_PRICING): { total: number; lines: PriceLine[] } {
  const byUnit = seats * p.unitPrice;
  if (byUnit >= p.minTotal) {
    return {
      total: byUnit,
      lines: [{ name: "ストレスチェック(受検者1名あたり・集団分析込み)", unitAmount: p.unitPrice, quantity: seats }],
    };
  }
  return {
    total: p.minTotal,
    lines: [
      {
        name: `ストレスチェック 最低料金(${minSeats(p)}名分まで・集団分析込み)`,
        unitAmount: p.minTotal,
        quantity: 1,
      },
    ],
  };
}

// 人数の追加購入(最低料金なし)
export function priceAdd(seats: number, p: Pricing = DEFAULT_PRICING): { total: number; lines: PriceLine[] } {
  return {
    total: seats * p.unitPrice,
    lines: [{ name: "ストレスチェック 受検人数の追加(1名あたり)", unitAmount: p.unitPrice, quantity: seats }],
  };
}

// 人数枠のお知らせ: 8割に達したら "near"、満員なら "full"
export function seatAlertLevel(used: number, seats: number): "near" | "full" | null {
  if (seats <= 0) return null;
  if (used >= seats) return "full";
  if (used >= Math.ceil(seats * 0.8)) return "near";
  return null;
}

// 税込金額に含まれる消費税(10%)
export const taxIncluded = (total: number): number => Math.floor((total * 10) / 110);

// 最低料金の範囲で受検できる人数(新規申込で購入人数が少ないときは、最低料金分まで受検枠を付ける)
export const seatsGranted = (seats: number, p: Pricing = DEFAULT_PRICING): number => Math.max(seats, minSeats(p));

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

// ---- 入力のそろえ方 ----

const str = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFKC").trim().slice(0, max) : "");
const int = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.normalize("NFKC").trim()) : NaN;
  return Number.isInteger(n) ? n : NaN;
};

// 登録番号(インボイス。T+13桁)または法人番号(13桁)を、比較用の13桁にそろえる。
// 法人の登録番号は「T + 法人番号」なので、どちらで入力されても同じ会社として見分けられる。
// 空なら null、形式が違えば "invalid"
export function normalizeBizId(raw: unknown): string | null | "invalid" {
  const s = typeof raw === "string" ? raw.normalize("NFKC").replace(/[\s\-ー－]/g, "").toUpperCase() : "";
  if (!s) return null;
  const m = /^T?(\d{13})$/.exec(s);
  return m ? m[1] : "invalid";
}

// 事業場名を比較用にそろえる(空白・全角半角・大文字小文字の違いを無視)
export const officeKey = (name: string): string => name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

// ---- 会社の登録(宣伝ページから。支払いはログイン後の画面で行う) ----

export type SignupInput = {
  companyName: string;
  bizId: string | null; // 13桁(登録番号のTは除く)。どちらも無い場合は null
  officeName: string;
  address: string;
  workers: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  password: string;
};

export function parseSignupInput(raw: Record<string, unknown>): { ok: true; value: SignupInput } | { ok: false; error: string } {
  const biz = normalizeBizId(raw.bizId);
  const v: SignupInput = {
    companyName: str(raw.companyName, 100),
    bizId: biz === "invalid" ? null : biz,
    officeName: str(raw.officeName, 100),
    address: str(raw.address, 200),
    workers: int(raw.workers),
    contactName: str(raw.contactName, 60),
    contactEmail: str(raw.contactEmail, 200).toLowerCase(),
    contactPhone: str(raw.contactPhone, 30),
    password: typeof raw.password === "string" ? raw.password : "",
  };
  if (!v.companyName) return { ok: false, error: "会社名を入力してください" };
  if (biz === "invalid") {
    return { ok: false, error: "登録番号(インボイス)は「T」と数字13桁、法人番号は数字13桁で入力してください" };
  }
  if (!biz && raw.noBizId !== true) {
    return {
      ok: false,
      error: "登録番号(インボイス)または法人番号を入力してください(どちらもお持ちでない場合は「どちらも持っていない」にチェック)",
    };
  }
  if (!v.officeName) return { ok: false, error: "事業場名を入力してください(事業場が1つの場合は「本社」など)" };
  if (!v.address) return { ok: false, error: "事業場の所在地を入力してください" };
  if (!(v.workers >= 1 && v.workers <= 100000)) return { ok: false, error: "事業場の労働者数を入力してください" };
  if (!v.contactName) return { ok: false, error: "ご担当者の氏名を入力してください" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contactEmail)) return { ok: false, error: "メールアドレスを正しく入力してください" };
  if (!/^[0-9+\-() ]{10,}$/.test(v.contactPhone)) return { ok: false, error: "電話番号を正しく入力してください" };
  if (v.password.length < 8) return { ok: false, error: "パスワードは8文字以上で入力してください" };
  if (raw.agreeTerms !== true) return { ok: false, error: "利用規約と個人情報の取扱いへの同意が必要です" };
  return { ok: true, value: v };
}

// ---- 年度の申込(ログイン後の画面から。初年度も2年目以降も同じ) ----

export type OrderInput = {
  workers: number;
  seats: number;
  examStart: string;
  examEnd: string;
  interviewOption: InterviewOption;
  questionnaire: Questionnaire;
};

// 調査票(57項目の職業性ストレス簡易調査票 / 80項目の新職業性ストレス簡易調査票)。料金は同じ
export type Questionnaire = "57" | "80";
export const QUESTIONNAIRE_OPTIONS: { value: Questionnaire; label: string; desc: string }[] = [
  { value: "57", label: "57項目版(標準)", desc: "厚生労働省の標準の調査票です。回答時間の目安は10分ほどです。" },
  {
    value: "80",
    label: "80項目版",
    desc: "57項目に、働きがい・職場の一体感・上司や会社の支援などを加えた調査票です。職場環境の改善に役立てやすくなります。回答時間の目安は15分ほどです。",
  },
];
export const questionnaireLabel = (q: string | null | undefined): string => (q === "80" ? "80項目版" : "57項目版");

export function parseOrderInput(
  raw: Record<string, unknown>,
  today: string = jstToday()
): { ok: true; value: OrderInput } | { ok: false; error: string } {
  const v = {
    workers: int(raw.workers),
    seats: int(raw.seats),
    examStart: str(raw.examStart, 10),
    examEnd: str(raw.examEnd, 10),
    interviewOption: (["own", "mestate"] as const).find((o) => o === raw.interviewOption) as InterviewOption,
    questionnaire: (raw.questionnaire === "80" ? "80" : "57") as Questionnaire,
  };
  if (!(v.workers >= 1 && v.workers <= 100000)) return { ok: false, error: "事業場の労働者数を入力してください" };
  if (!(v.seats >= 1)) return { ok: false, error: "受検予定人数を入力してください" };
  // 桁の打ち間違い(30名を300名など)を防ぐ: 受検するのは事業場で働く方なので、労働者数を超えることはない
  if (v.seats > v.workers) {
    return { ok: false, error: `受検予定人数(${v.seats}名)が事業場の労働者数(${v.workers}名)を超えています。人数をご確認ください` };
  }
  if (v.seats > WEB_MAX_SEATS) {
    return {
      ok: false,
      error: `受検予定人数が${WEB_MAX_SEATS}名を超える場合は、個別にお見積りします(割引があります)。support@mestate.jp までお問い合わせください`,
    };
  }
  const pe = periodError(v.examStart, v.examEnd, today);
  if (pe) return { ok: false, error: pe };
  const ie = interviewOptionError(v.interviewOption, v.workers);
  if (ie) return { ok: false, error: ie };
  if (raw.agreeProcedure !== true) return { ok: false, error: "実施方法の決定と従業員への周知についてご確認ください" };
  if (raw.agreeTerms !== true) return { ok: false, error: "利用規約への同意が必要です" };
  return { ok: true, value: v };
}

// ---- 売上明細(実施者の画面からCSVで一括ダウンロード) ----

export type SalesOrder = {
  id: string;
  kind: "new" | "add_seats" | "renew";
  status: string;
  company_name: string;
  office_name: string | null;
  contact_name: string;
  contact_email: string;
  fiscal_year: number;
  seats: number;
  amount: number;
  created_at: string;
  paid_at: string | null;
  stripe_payment_intent: string | null;
  stripe_invoice_id: string | null;
};

// 日時(UTC)を日本時間の日付(YYYY-MM-DD)にする
export const jstDate = (ts: string): string => new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export const SALES_HEADERS = [
  "売上日(決済日)",
  "区分",
  "会社名",
  "事業場名",
  "担当者",
  "メールアドレス",
  "年度",
  "人数",
  "金額(税込)",
  "うち消費税(10%)",
  "税抜金額",
  "申込ID",
  "Stripe決済ID",
  "Stripe請求書ID",
];

// 支払い済みの申込を、決済日が from〜to(日本時間・両端を含む。空なら制限なし)のものだけ行にする
export function salesRows(orders: SalesOrder[], from = "", to = ""): (string | number)[][] {
  return orders
    .filter((o) => (o.status === "provisioned" || o.status === "paid") && o.paid_at)
    .map((o) => ({ o, day: jstDate(o.paid_at!) }))
    .filter(({ day }) => (!from || day >= from) && (!to || day <= to))
    .sort((a, b) => (a.o.paid_at! < b.o.paid_at! ? -1 : 1))
    .map(({ o, day }) => {
      const tax = taxIncluded(o.amount);
      return [
        day,
        o.kind === "new" ? "初年度" : o.kind === "renew" ? "継続" : "人数追加",
        o.company_name,
        o.office_name ?? "",
        o.contact_name,
        o.contact_email,
        o.fiscal_year,
        o.seats,
        o.amount,
        tax,
        o.amount - tax,
        o.id,
        o.stripe_payment_intent ?? "",
        o.stripe_invoice_id ?? "",
      ];
    });
}
