import { describe, expect, it } from "vitest";
import { EXAM_REMIND_AFTER_DAYS, MANUAL_REMIND_INTERVAL_HOURS, canSendAgain, shouldRemindExam } from "@/lib/exam-reminder";

describe("受検の催促(1回だけ)", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const started = { started_at: "2026-10-16T00:00:00Z", reminded_at: null };
  it("受検の画面を開いてから3日たって、結果がなければ催促する", () => {
    expect(EXAM_REMIND_AFTER_DAYS).toBe(3);
    expect(shouldRemindExam(started, false, now, null)).toBe(true);
    expect(shouldRemindExam(started, false, now, "2026-10-31")).toBe(true);
  });
  it("3日たっていない・回答済み・送信済み・受検期間が終わっていれば催促しない", () => {
    expect(shouldRemindExam({ ...started, started_at: "2026-10-18T00:00:00Z" }, false, now, null)).toBe(false);
    expect(shouldRemindExam(started, true, now, null)).toBe(false);
    expect(shouldRemindExam({ ...started, reminded_at: "2026-10-19T00:00:00Z" }, false, now, null)).toBe(false);
    expect(shouldRemindExam(started, false, now, "2026-10-19")).toBe(false);
  });
  it("受検期間の最終日(日本時間)までは催促する", () => {
    expect(shouldRemindExam(started, false, new Date("2026-10-19T14:00:00Z"), "2026-10-19")).toBe(true); // 日本時間 10/19 23時
  });
});

describe("未受検者へのリマインド(画面から送る)", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  it("同じ企業へは24時間に1回まで", () => {
    expect(MANUAL_REMIND_INTERVAL_HOURS).toBe(24);
    expect(canSendAgain(null, now)).toBe(true);
    expect(canSendAgain("2026-10-24T12:00:00Z", now)).toBe(true);
    expect(canSendAgain("2026-10-24T13:00:00Z", now)).toBe(false);
  });
});
