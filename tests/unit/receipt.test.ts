import { describe, expect, it } from "vitest";
import { receiptFromOrder } from "@/lib/receipt";

describe("領収書", () => {
  const base = { id: "3f2a9c1e-1111-2222-3333-444444444444", company_name: "株式会社テスト", fiscal_year: 2026 };
  it("新規申込: 人数分", () => {
    const r = receiptFromOrder({ ...base, kind: "new", seats: 30, amount: 9900, paid_at: "2026-10-31T16:00:00Z" }, "T7130003006446");
    expect(r.no).toBe("R2026-3F2A9C1E");
    expect(r.paidDate).toBe("2026-11-01"); // 日本時間
    expect(r.purpose).toBe("2026年度 ストレスチェック(受検者30名分・集団分析込み)");
    expect(r.registrationNo).toBe("T7130003006446");
  });
  it("新規申込: 最低料金", () => {
    const r = receiptFromOrder({ ...base, kind: "new", seats: 6, amount: 3300, paid_at: "2026-10-13T01:00:00Z" }, "T7130003006446");
    expect(r.purpose).toBe("2026年度 ストレスチェック(最低料金・受検者10名まで・集団分析込み)");
  });
  it("人数の追加", () => {
    const r = receiptFromOrder({ ...base, kind: "add_seats", seats: 5, amount: 1650, paid_at: "2026-10-13T01:00:00Z" }, "T7130003006446");
    expect(r.purpose).toBe("2026年度 ストレスチェック 受検人数の追加(5名分)");
  });
});
