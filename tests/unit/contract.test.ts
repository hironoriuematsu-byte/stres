import { describe, expect, it } from "vitest";
import {
  CONTRACT_TEMPLATE_VERSION,
  contractNo,
  contractText,
  DEFAULT_FIELDS,
  displayStatus,
  feeText,
  formatJst,
  isExpired,
  parseAccessCode,
  parseContractFields,
  renderContract,
  termEndDate,
  type ContractFields,
} from "@/lib/contract";
import { accessCodeHash, eventHash, newToken, safeEqualHex, serviceSignature, sha256, tokenHash, verifyChain, verifyServiceSignature } from "@/lib/contract-crypto";

const VALID: Record<string, unknown> = {
  partyName: "株式会社テスト",
  partyOfficeName: "本社",
  partyAddress: "京都市中京区1-1",
  partyRepTitle: "代表取締役",
  partyRepName: "山田 太郎",
  signerName: "鈴木 花子",
  signerTitle: "総務部長",
  signerEmail: "Hanako@Example.com",
  workers: "80",
  startDate: "2026-11-01",
  termMonths: "12",
  autoRenew: true,
  visitFrequency: "monthly",
  hoursPerVisit: "2",
  monthlyFee: "55000",
  paymentTiming: "next_month_end",
  includeStressCheck: true,
  specialTerms: "",
};

const fields = (): ContractFields => {
  const p = parseContractFields(VALID);
  if (!p.ok) throw new Error(p.error);
  return p.value;
};

describe("契約内容の入力チェック", () => {
  it("正しい入力を受け付け、数値・メールアドレスを整える", () => {
    const f = fields();
    expect(f.workers).toBe(80);
    expect(f.termMonths).toBe(12);
    expect(f.hoursPerVisit).toBe(2);
    expect(f.monthlyFee).toBe(55000);
    expect(f.signerEmail).toBe("hanako@example.com");
  });
  it("必須項目の不足を知らせる", () => {
    expect(parseContractFields({ ...VALID, partyName: "" })).toMatchObject({ ok: false, error: expect.stringContaining("会社名") });
    expect(parseContractFields({ ...VALID, signerEmail: "bad" })).toMatchObject({ ok: false, error: expect.stringContaining("メールアドレス") });
    expect(parseContractFields({ ...VALID, startDate: "2026-02-30" })).toMatchObject({ ok: false, error: expect.stringContaining("開始日") });
    expect(parseContractFields({ ...VALID, termMonths: "0" })).toMatchObject({ ok: false, error: expect.stringContaining("契約期間") });
    expect(parseContractFields({ ...VALID, hoursPerVisit: "1.25" })).toMatchObject({ ok: false, error: expect.stringContaining("訪問時間") });
    expect(parseContractFields({ ...VALID, monthlyFee: "" })).toMatchObject({ ok: false, error: expect.stringContaining("月額報酬") });
  });
  it("労働者数は空でもよい", () => {
    const p = parseContractFields({ ...VALID, workers: "" });
    expect(p.ok && p.value.workers).toBeNull();
  });
  it("アクセスコードは4〜8桁の数字か空", () => {
    expect(parseAccessCode("")).toEqual({ ok: true, value: "" });
    expect(parseAccessCode(" 123456 ")).toEqual({ ok: true, value: "123456" });
    expect(parseAccessCode("12")).toMatchObject({ ok: false });
    expect(parseAccessCode("abcd")).toMatchObject({ ok: false });
  });
});

describe("日付・番号・金額", () => {
  it("契約の終了日は n か月後の前日(月末は月末に合わせる)", () => {
    expect(termEndDate("2026-11-01", 12)).toBe("2027-10-31");
    expect(termEndDate("2026-01-31", 1)).toBe("2026-02-27"); // 1/31 の1か月後は 2/28 → その前日
    expect(termEndDate("2026-04-15", 6)).toBe("2026-10-14");
    expect(termEndDate("2024-02-29", 12)).toBe("2025-02-27");
  });
  it("契約番号は作成年と id の先頭8文字", () => {
    expect(contractNo("3f2a9c1e-1111-2222-3333-444444444444", "2026-10-24T01:00:00Z")).toBe("E2026-3F2A9C1E");
  });
  it("報酬の表記に消費税の内訳を含む", () => {
    expect(feeText(55000)).toBe("月額 55,000円(税込。うち消費税 5,000円)");
  });
  it("日本時間の日時表示", () => {
    expect(formatJst("2026-10-24T01:02:03Z")).toBe("2026年10月24日 10:02:03");
    expect(formatJst(null)).toBe("");
  });
});

describe("契約書の文面", () => {
  it("条文に入力した条件が反映される", () => {
    const doc = renderContract(fields(), { contractNo: "E2026-TEST0001" });
    const text = contractText(doc);
    expect(doc.title).toBe("産業医業務委託契約書");
    expect(doc.templateVersion).toBe(CONTRACT_TEMPLATE_VERSION);
    expect(text).toContain("株式会社テスト 本社(京都市中京区1-1) 労働者数 約80名");
    expect(text).toContain("月1回、1回あたり2時間");
    expect(text).toContain("月額 55,000円(税込。うち消費税 5,000円)");
    expect(text).toContain("2026年11月1日から2027年10月31日までの12か月間");
    expect(text).toContain("翌月末日までに");
    expect(text).toContain("さらに1年間更新");
    expect(text).toContain("ストレスチェックの実施者としての業務");
    expect(text).toContain("甲: 京都市中京区1-1 / 株式会社テスト 本社 / 代表取締役 山田 太郎");
    expect(text).toContain("乙: 〒604-8221");
    expect(text).not.toContain("特記事項");
  });
  it("2か月に1回・自動更新なし・特記事項あり", () => {
    const f: ContractFields = { ...fields(), visitFrequency: "bimonthly", autoRenew: false, includeStressCheck: false, specialTerms: "初回訪問は11月中に行う。\n\n駐車場を1台分用意する。" };
    const doc = renderContract(f, { contractNo: "E2026-TEST0002" });
    const text = contractText(doc);
    expect(text).toContain("2か月に1回、1回あたり2時間");
    expect(text).toContain("少なくとも2か月に1回行う");
    expect(text).toContain("甲乙協議のうえ定める。");
    expect(text).not.toContain("実施者としての業務");
    const special = doc.articles.find((a) => a.title === "特記事項");
    expect(special?.items).toEqual(["初回訪問は11月中に行う。", "駐車場を1台分用意する。"]);
    // 条番号は通し(特記事項の次が協議・管轄)
    const idx = doc.articles.findIndex((a) => a.title === "特記事項");
    expect(doc.articles[idx + 1].title).toBe("協議および管轄");
    expect(doc.articles.map((a) => a.no)).toEqual(doc.articles.map((_, i) => i + 1));
  });
  it("同じ内容からは同じ文面・同じハッシュになる", () => {
    const a = contractText(renderContract(fields(), { contractNo: "E2026-TEST0001" }));
    const b = contractText(renderContract(fields(), { contractNo: "E2026-TEST0001" }));
    expect(sha256(a)).toBe(sha256(b));
    const c = contractText(renderContract({ ...fields(), monthlyFee: 55001 }, { contractNo: "E2026-TEST0001" }));
    expect(sha256(c)).not.toBe(sha256(a));
  });
  it("既定値は下書きとして成立しない(入力が必要)", () => {
    expect(parseContractFields(DEFAULT_FIELDS as unknown as Record<string, unknown>).ok).toBe(false);
  });
});

describe("状態", () => {
  it("署名待ちで期限を過ぎたら期限切れ", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    expect(isExpired("sent", "2026-11-19T00:00:00Z", now)).toBe(true);
    expect(isExpired("sent", "2026-11-21T00:00:00Z", now)).toBe(false);
    expect(isExpired("signed", "2026-11-19T00:00:00Z", now)).toBe(false);
    expect(displayStatus("sent", "2026-11-19T00:00:00Z", now)).toBe("expired");
    expect(displayStatus("draft", null, now)).toBe("draft");
  });
});

describe("改ざん検知", () => {
  const base = { contract_id: "c1", actor: "office", actor_name: "A", actor_email: "a@example.com", ip: "1.2.3.4", detail: null };
  const e1 = { ...base, seq: 1, event: "created", at: "2026-10-24T00:00:00Z" };
  const e2 = { ...base, seq: 2, event: "sent", at: "2026-10-24T00:01:00Z", detail: { document_hash: "x" } };
  const e3 = { ...base, seq: 3, event: "signed", actor: "party", at: "2026-10-24T00:02:00Z" };

  it("記録の連鎖: 正しい並びは検証に通り、改変すると通らない", () => {
    const h1 = eventHash(null, e1);
    const h2 = eventHash(h1, e2);
    const h3 = eventHash(h2, e3);
    const chain = [
      { ...e1, prev_hash: null, hash: h1 },
      { ...e2, prev_hash: h1, hash: h2 },
      { ...e3, prev_hash: h2, hash: h3 },
    ];
    expect(verifyChain(chain)).toBe(true);
    expect(verifyChain([chain[0], { ...chain[1], actor_email: "evil@example.com" }, chain[2]])).toBe(false); // 内容の改変
    expect(verifyChain([chain[0], chain[2]])).toBe(false); // 途中を抜く
    expect(verifyChain([chain[2], chain[0], chain[1]])).toBe(true); // 並び順は seq で整える
  });
  it("データベースから読み戻した形(マイクロ秒・+00:00・キーの順番の違い)でも同じハッシュになる", () => {
    const h = eventHash("p", { ...e2, detail: { b: 1, a: { d: true, c: "x" } } });
    expect(eventHash("p", { ...e2, at: "2026-10-24T00:01:00.000000+00:00", detail: { a: { c: "x", d: true }, b: 1 } })).toBe(h);
    expect(eventHash("p", { ...e2, at: "2026-10-24T00:01:01Z", detail: { b: 1, a: { d: true, c: "x" } } })).not.toBe(h);
  });
  it("トークンはハッシュだけを保存し、元の値から同じハッシュになる", () => {
    const t = newToken();
    expect(t.token.length).toBeGreaterThanOrEqual(40);
    expect(tokenHash(t.token)).toBe(t.hash);
    expect(newToken().hash).not.toBe(t.hash);
  });
  it("アクセスコードのハッシュは契約ごとに違う", () => {
    expect(accessCodeHash("c1", "1234")).not.toBe(accessCodeHash("c2", "1234"));
    expect(safeEqualHex(accessCodeHash("c1", "1234"), accessCodeHash("c1", "1234"))).toBe(true);
    expect(safeEqualHex(accessCodeHash("c1", "1234"), accessCodeHash("c1", "1235"))).toBe(false);
  });
  it("事業者署名: 秘密鍵で検証でき、鍵が無ければ付かない", () => {
    const sig = serviceSignature("doc", "done", "secret-1");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyServiceSignature("doc", "done", sig!, "secret-1")).toBe(true);
    expect(verifyServiceSignature("doc", "done", sig!, "secret-2")).toBe(false);
    expect(verifyServiceSignature("doc2", "done", sig!, "secret-1")).toBe(false);
    expect(serviceSignature("doc", "done", undefined)).toBeNull();
  });
});
