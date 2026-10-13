import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  MIN_TOTAL,
  MIN_TOTAL_SEATS,
  UNIT_PRICE,
  addDays,
  defaultEndOf,
  fiscalYearOf,
  maxEndOf,
  parseApplyInput,
  periodError,
  priceAdd,
  priceNew,
  seatsGranted,
  taxIncluded,
} from "@/lib/plan";
import { encodeForm, verifyStripeSignature } from "@/lib/stripe";

describe("料金", () => {
  it("人数×330円。3,300円(10名分)に満たないときは最低料金", () => {
    expect(UNIT_PRICE).toBe(330);
    expect(MIN_TOTAL).toBe(3300);
    expect(priceNew(3).total).toBe(3300);
    expect(priceNew(3).lines).toHaveLength(1);
    expect(priceNew(3).lines[0].quantity).toBe(1);
    expect(priceNew(9).total).toBe(3300);
    expect(priceNew(10).total).toBe(3300);
    expect(priceNew(10).lines[0]).toMatchObject({ unitAmount: 330, quantity: 10 });
    expect(priceNew(11).total).toBe(3630);
    expect(priceNew(100).total).toBe(33000);
  });
  it("最低料金のときは10名分の受検枠を付ける", () => {
    expect(MIN_TOTAL_SEATS).toBe(10);
    expect(seatsGranted(5)).toBe(10);
    expect(seatsGranted(30)).toBe(30);
  });
  it("追加購入は最低料金なし", () => {
    expect(priceAdd(3).total).toBe(990);
  });
  it("税込金額に含まれる消費税", () => {
    expect(taxIncluded(3300)).toBe(300);
    expect(taxIncluded(33000)).toBe(3000);
  });
});

describe("受検期間", () => {
  it("年度", () => {
    expect(fiscalYearOf("2026-04-01")).toBe(2026);
    expect(fiscalYearOf("2027-03-31")).toBe(2026);
  });
  it("延ばせる最終日は開始から3か月、ただし年度末まで", () => {
    expect(maxEndOf("2026-10-13")).toBe("2027-01-12");
    expect(maxEndOf("2027-02-01")).toBe("2027-03-31");
    expect(maxEndOf("2026-04-01")).toBe("2026-06-30");
  });
  it("標準は4週間", () => {
    expect(defaultEndOf("2026-10-13")).toBe("2026-11-09");
    expect(defaultEndOf("2027-03-20")).toBe("2027-03-31");
  });
  it("期間のチェック", () => {
    const today = "2026-10-13";
    expect(periodError("2026-10-13", "2026-11-09", today)).toBeNull();
    expect(periodError("2026-10-12", "2026-11-09", today)).toMatch(/今日以降/);
    expect(periodError("2026-10-20", "2026-10-19", today)).toMatch(/開始日以降/);
    expect(periodError("2026-10-13", "2027-01-13", today)).toMatch(/2027年1月12日まで/);
    expect(periodError("2026-10-13", "2026-02-30", today)).toMatch(/締切日/);
    expect(periodError(addDays(today, 181), addDays(today, 190), today)).toMatch(/半年以内/);
  });
});

describe("申込フォームの入力", () => {
  const base = {
    companyName: "株式会社テスト",
    officeName: "本社",
    address: "京都市中京区",
    contactName: "山田 太郎",
    contactEmail: "Taro@Example.co.jp",
    contactPhone: "075-000-0000",
    workers: "30",
    seats: "28",
    questionnaire: "57",
    examStart: "2026-10-20",
    examEnd: "2026-11-16",
    interviewOption: "sanpo",
    agreeTerms: true,
    agreeProcedure: true,
  };
  it("正しい入力", () => {
    const r = parseApplyInput(base, "2026-10-13");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.seats).toBe(28);
      expect(r.value.contactEmail).toBe("taro@example.co.jp");
    }
  });
  it("全角数字も受け付ける", () => {
    const r = parseApplyInput({ ...base, seats: "２８" }, "2026-10-13");
    expect(r.ok && r.value.seats).toBe(28);
  });
  it("50人以上の事業場は地域産業保健センターを選べない", () => {
    const r = parseApplyInput({ ...base, workers: "60" }, "2026-10-13");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/50人未満/);
  });
  it("同意が無いと申し込めない", () => {
    expect(parseApplyInput({ ...base, agreeTerms: false }, "2026-10-13").ok).toBe(false);
    expect(parseApplyInput({ ...base, agreeProcedure: false }, "2026-10-13").ok).toBe(false);
  });
  it("人数・メールの誤り", () => {
    expect(parseApplyInput({ ...base, seats: "0" }, "2026-10-13").ok).toBe(false);
    expect(parseApplyInput({ ...base, contactEmail: "abc" }, "2026-10-13").ok).toBe(false);
  });
});

describe("Stripe", () => {
  it("form-encoded の入れ子", () => {
    const s = encodeForm({ a: 1, line_items: [{ quantity: 2, price_data: { currency: "jpy" } }], m: ["card"] }).join("&");
    expect(decodeURIComponent(s)).toBe("a=1&line_items[0][quantity]=2&line_items[0][price_data][currency]=jpy&m[0]=card");
  });
  it("Webhook の署名を確かめる", () => {
    const secret = "whsec_test";
    const payload = '{"id":"evt_1"}';
    const t = 1_800_000_000;
    const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, t + 10)).toBe(true);
    expect(verifyStripeSignature(payload + " ", `t=${t},v1=${sig}`, secret, 300, t + 10)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${t},v1=${sig}`, "whsec_other", 300, t + 10)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret, 300, t + 1000)).toBe(false);
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
  });
});
