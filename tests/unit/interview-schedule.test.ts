import { describe, expect, it } from "vitest";
import { businessDaysFrom, isBusinessDay, isJpHoliday, jpHolidays, nextBusinessDay } from "@/lib/jp-holidays";
import {
  defaultOfferDays,
  excludeBooked,
  expandSlots,
  formatDateJa,
  formatSlot,
  jstDateOf,
  overlaps,
  proposalFirstDate,
  proposalTimeOptions,
  timeOptions,
  validateProposals,
  validateRanges,
} from "@/lib/interview-schedule";

describe("祝日・営業日", () => {
  it("2026年の祝日(固定日・ハッピーマンデー・春分秋分・振替休日・国民の休日)", () => {
    const h = jpHolidays(2026);
    expect(h.has("2026-01-01")).toBe(true); // 元日
    expect(h.has("2026-01-12")).toBe(true); // 成人の日(第2月曜)
    expect(h.has("2026-02-11")).toBe(true);
    expect(h.has("2026-02-23")).toBe(true);
    expect(h.has("2026-03-20")).toBe(true); // 春分の日
    expect(h.has("2026-05-03")).toBe(true);
    expect(h.has("2026-05-06")).toBe(true); // 5/3が日曜 → 5/6 振替休日
    expect(h.has("2026-07-20")).toBe(true); // 海の日(第3月曜)
    expect(h.has("2026-09-21")).toBe(true); // 敬老の日
    expect(h.has("2026-09-22")).toBe(true); // 国民の休日(敬老の日と秋分の日の間)
    expect(h.has("2026-09-23")).toBe(true); // 秋分の日
    expect(h.has("2026-10-12")).toBe(true); // スポーツの日
    expect(h.has("2026-11-23")).toBe(true);
    expect(isJpHoliday("2026-10-22")).toBe(false);
  });
  it("営業日は土日・祝日・年末年始を除く", () => {
    expect(isBusinessDay("2026-10-22")).toBe(true); // 木
    expect(isBusinessDay("2026-10-24")).toBe(false); // 土
    expect(isBusinessDay("2026-10-25")).toBe(false); // 日
    expect(isBusinessDay("2026-11-23")).toBe(false); // 祝日
    expect(isBusinessDay("2026-12-29")).toBe(false);
    expect(isBusinessDay("2027-01-03")).toBe(false);
    expect(isBusinessDay("2027-01-04")).toBe(true);
  });
  it("翌営業日と1週間分の営業日", () => {
    expect(nextBusinessDay("2026-10-23")).toBe("2026-10-26"); // 金 → 月
    expect(nextBusinessDay("2026-12-28")).toBe("2027-01-04"); // 年末年始をまたぐ
    expect(businessDaysFrom("2026-10-26", 7)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(businessDaysFrom("2026-11-02", 7)).toEqual(["2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06"]); // 11/3 文化の日を除く
  });
});

describe("面接指導の日程調整", () => {
  const now = new Date("2026-10-22T03:00:00Z"); // 日本時間 10/22(木) 12:00
  it("候補を出す既定の期間は、翌営業日から1週間分の営業日", () => {
    expect(defaultOfferDays(now)).toEqual({ from: "2026-10-23", days: ["2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"] });
  });
  it("時間帯を15分刻みの候補に広げる(面談時間が収まる開始時刻だけ)", () => {
    const s = expandSlots([{ date: "2026-10-28", start: "10:00", end: "11:00" }], 30);
    expect(s).toEqual(["2026-10-28T01:00:00.000Z", "2026-10-28T01:15:00.000Z", "2026-10-28T01:30:00.000Z"]); // 10:00, 10:15, 10:30(JST)
    expect(expandSlots([{ date: "2026-10-28", start: "10:00", end: "10:30" }], 30)).toHaveLength(1);
    expect(expandSlots([{ date: "2026-10-28", start: "10:00", end: "10:30" }], 45)).toHaveLength(0);
    // 同じ時刻は1つにまとめる
    expect(expandSlots([{ date: "2026-10-28", start: "10:00", end: "10:30" }, { date: "2026-10-28", start: "10:00", end: "10:30" }], 15)).toHaveLength(2);
  });
  it("入力の確認: 刻み・順序・日付の範囲・面談時間", () => {
    const ok = [{ date: "2026-10-28", start: "10:00", end: "12:00" }];
    expect(validateRanges(ok, 30, now)).toBeNull();
    expect(validateRanges([], 30, now)).toMatch(/1つ以上/);
    expect(validateRanges(ok, 20, now)).toMatch(/面談時間/);
    expect(validateRanges([{ date: "2026-10-28", start: "10:10", end: "12:00" }], 30, now)).toMatch(/15分単位/);
    expect(validateRanges([{ date: "2026-10-28", start: "12:00", end: "12:15" }], 30, now)).toMatch(/短い/);
    expect(validateRanges([{ date: "2026-10-22", start: "10:00", end: "12:00" }], 30, now)).toMatch(/明日以降/);
    expect(validateRanges([{ date: "2027-01-15", start: "10:00", end: "12:00" }], 30, now)).toMatch(/60日先/);
    expect(validateRanges([{ date: "2026/10/28", start: "10:00", end: "12:00" }], 30, now)).toMatch(/日付の形式/);
  });
  it("確定済みの面談と重なる候補を除く", () => {
    expect(overlaps("2026-10-28T01:00:00Z", 30, "2026-10-28T01:15:00Z", 30)).toBe(true);
    expect(overlaps("2026-10-28T01:00:00Z", 30, "2026-10-28T01:30:00Z", 30)).toBe(false);
    const s = expandSlots([{ date: "2026-10-28", start: "10:00", end: "11:30" }], 30); // 10:00〜11:00 の5件
    const left = excludeBooked(s, 30, [{ starts_at: "2026-10-28T01:30:00Z", duration_min: 30 }]); // 10:30〜11:00 が埋まっている
    expect(left).toEqual(["2026-10-28T01:00:00.000Z", "2026-10-28T02:00:00.000Z"]); // 10:00 と 11:00 だけ
  });
  it("表示は日本時間", () => {
    expect(formatSlot("2026-10-28T01:00:00Z", 30)).toBe("2026年10月28日(水) 10:00〜10:30");
    expect(formatSlot("2026-10-28T01:00:00Z")).toBe("2026年10月28日(水) 10:00");
    expect(formatDateJa("2026-10-28")).toBe("2026年10月28日(水)");
    expect(jstDateOf("2026-10-27T15:00:00Z")).toBe("2026-10-28"); // 日本時間では翌日
    expect(timeOptions()[0]).toBe("08:00");
    expect(timeOptions().at(-1)).toBe("20:00");
  });
});

describe("本人の希望日時", () => {
  const now = new Date("2026-11-04T01:00:00Z"); // 2026-11-04(水) 10:00 JST

  it("選べる最初の日は、医師の候補の最終日の翌営業日(候補がなければ明日以降の営業日)", () => {
    expect(proposalFirstDate("2026-11-06", now)).toBe("2026-11-09"); // 金 → 次の月曜
    expect(proposalFirstDate("2026-11-20", now)).toBe("2026-11-24"); // 金 → 11/23 は祝日 → 火
    expect(proposalFirstDate(null, now)).toBe("2026-11-05");
    expect(proposalFirstDate("2026-10-30", now)).toBe("2026-11-05"); // 候補が過去なら今日の翌営業日
  });

  it("5つまで・候補の後の営業日・15分刻み・時間内・重ならないものを受け付ける", () => {
    const first = "2026-11-09";
    const ok = [
      { date: "2026-11-09", start: "10:00" },
      { date: "2026-11-09", start: "14:00" },
      { date: "2026-11-10", start: "09:30" },
      { date: "2026-11-11", start: "17:00" },
      { date: "2026-11-12", start: "19:30" },
    ];
    expect(validateProposals(ok, 30, first, now)).toBeNull();
    expect(validateProposals([], 30, first, now)).toMatch(/1つ以上/);
    expect(validateProposals([...ok, { date: "2026-11-13", start: "10:00" }], 30, first, now)).toMatch(/5つまで/);
    expect(validateProposals([{ date: "2026-11-06", start: "10:00" }], 30, first, now)).toMatch(/以降の日/);
    expect(validateProposals([{ date: "2026-11-14", start: "10:00" }], 30, first, now)).toMatch(/土日・祝日/);
    expect(validateProposals([{ date: "2026-11-23", start: "10:00" }], 30, first, now)).toMatch(/土日・祝日/);
    expect(validateProposals([{ date: "2026-11-09", start: "10:10" }], 30, first, now)).toMatch(/15分単位/);
    expect(validateProposals([{ date: "2026-11-09", start: "19:45" }], 30, first, now)).toMatch(/20:00/);
    expect(validateProposals([{ date: "2027-02-01", start: "10:00" }], 30, first, now)).toMatch(/60日先/);
    expect(
      validateProposals(
        [
          { date: "2026-11-09", start: "10:00" },
          { date: "2026-11-09", start: "10:00" },
        ],
        30,
        first,
        now
      )
    ).toMatch(/2回/);
    expect(
      validateProposals(
        [
          { date: "2026-11-09", start: "10:00" },
          { date: "2026-11-09", start: "10:15" },
        ],
        30,
        first,
        now
      )
    ).toMatch(/重なって/);
  });

  it("開始時刻の選択肢は面談時間が20:00までに収まるもの", () => {
    expect(proposalTimeOptions(30).at(-1)).toBe("19:30");
    expect(proposalTimeOptions(60).at(-1)).toBe("19:00");
    expect(proposalTimeOptions(30)[0]).toBe("08:00");
  });
});
