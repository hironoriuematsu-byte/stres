import { describe, expect, it } from "vitest";
import {
  CONTRACT_TEMPLATE_VERSION,
  contractNo,
  contractText,
  DEFAULT_FIELDS,
  displayStatus,
  eventLabel,
  feeText,
  formatJst,
  isExpired,
  partyLabels,
  parseAccessCode,
  parseContractFields,
  renderContract,
  termEndDate,
  type ContractFields,
} from "@/lib/contract";
import { accessCodeHash, eventHash, newToken, safeEqualHex, serviceSignature, sha256, tokenHash, verifyChain, verifyServiceSignature } from "@/lib/contract-crypto";

const VALID: Record<string, unknown> = {
  kind: "appointed",
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
  feePeriod: "monthly",
  fee: "55000",
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
    expect(f.fee).toBe(55000);
    expect(f.kind).toBe("appointed");
    expect(f.feePeriod).toBe("monthly");
    expect(f.signerEmail).toBe("hanako@example.com");
  });
  it("必須項目の不足を知らせる", () => {
    expect(parseContractFields({ ...VALID, partyName: "" })).toMatchObject({ ok: false, error: expect.stringContaining("会社名") });
    expect(parseContractFields({ ...VALID, signerEmail: "bad" })).toMatchObject({ ok: false, error: expect.stringContaining("メールアドレス") });
    expect(parseContractFields({ ...VALID, startDate: "2026-02-30" })).toMatchObject({ ok: false, error: expect.stringContaining("開始日") });
    expect(parseContractFields({ ...VALID, termMonths: "0" })).toMatchObject({ ok: false, error: expect.stringContaining("契約期間") });
    expect(parseContractFields({ ...VALID, hoursPerVisit: "1.25" })).toMatchObject({ ok: false, error: expect.stringContaining("訪問時間") });
    expect(parseContractFields({ ...VALID, fee: "" })).toMatchObject({ ok: false, error: expect.stringContaining("月額の報酬") });
  });
  it("初版の形(kind なし・monthlyFee)の下書きも読める", () => {
    const { kind, fee, feePeriod, ...old } = VALID;
    void kind; void fee; void feePeriod;
    const p = parseContractFields({ ...old, monthlyFee: "40000" });
    expect(p.ok && p.value).toMatchObject({ kind: "appointed", fee: 40000, feePeriod: "monthly" });
  });
  it("選任契約の訪問は月1回・2か月に1回のみ。顧問契約は3か月に1回・訪問なしも選べる", () => {
    expect(parseContractFields({ ...VALID, visitFrequency: "quarterly" })).toMatchObject({ ok: false, error: expect.stringContaining("選任契約") });
    const p = parseContractFields({ ...VALID, kind: "advisory", visitFrequency: "on_request", hoursPerVisit: "" });
    expect(p.ok && p.value).toMatchObject({ kind: "advisory", visitFrequency: "on_request", hoursPerVisit: 0 });
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
    expect(feeText(600000, "yearly")).toBe("年額 600,000円(税込。うち消費税 54,545円)");
    expect(feeText(45000, "monthly", "excluded")).toBe("月額 45,000円(消費税別)");
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
    expect(doc.title).toBe("産業医選任契約書");
    expect(doc.templateVersion).toBe(CONTRACT_TEMPLATE_VERSION);
    expect(text).toContain("株式会社テスト 本社(京都市中京区1-1)\n労働者数: 約80名");
    expect(text).toContain("月1回、1回あたり2時間");
    expect(text).toContain("月額 55,000円(税込。うち消費税 5,000円)");
    expect(text).toContain("2026年11月1日から2027年10月31日までの12か月間");
    expect(text).toContain("翌月末日までに");
    expect(text).toContain("さらに1年間更新");
    expect(text).toContain("担当医師が実施者を務める");
    expect(text).toContain("規則第14条第1項に定める次の事項");
    expect(text).toContain("法第18条第2項第3号に基づき、担当医師を本事業場の衛生委員会");
    expect(text).toContain("委員として調査審議に参画する");
    expect(text).not.toContain("衛生委員会への出席");
    expect(text).toContain("少なくとも毎月1回、作業場等を巡視");
    expect(text).toContain("産業医選任報告");
    expect(text).toContain("甲: 京都市中京区1-1 / 株式会社テスト 本社 / 代表取締役 山田 太郎");
    expect(text).toContain("乙: 〒604-8221");
    expect(doc.otsu.name).toBe("メステート合同会社\nうえまつ産業医事務所"); // 署名欄は法人名と事務所名を2行に(括弧なし)
    expect(text).toContain("/ メステート合同会社 うえまつ産業医事務所 / 代表社員 上松 弘典");
    expect(text).not.toContain("特記事項");
  });
  it("2か月に1回・自動更新なし・特記事項あり", () => {
    const f: ContractFields = { ...fields(), visitFrequency: "bimonthly", autoRenew: false, includeStressCheck: false, specialTerms: "初回訪問は11月中に行う。\n\n駐車場を1台分用意する。" };
    const doc = renderContract(f, { contractNo: "E2026-TEST0002" });
    const text = contractText(doc);
    expect(text).toContain("2か月に1回、1回あたり2時間");
    expect(text).toContain("少なくとも2か月に1回、作業場等を巡視");
    expect(text).toContain("衛生管理者が行う巡視の結果");
    expect(text).toContain("甲乙協議のうえ定める。");
    expect(text).not.toContain("担当医師が実施者を務める");
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
    const c = contractText(renderContract({ ...fields(), fee: 55001 }, { contractNo: "E2026-TEST0001" }));
    expect(sha256(c)).not.toBe(sha256(a));
  });
  it("顧問契約: 選任ではないこと・50人到達時の移行・訪問なし・年額の精算", () => {
    const f: ContractFields = { ...fields(), kind: "advisory", visitFrequency: "on_request", hoursPerVisit: 0, feePeriod: "yearly", fee: 360000 };
    const doc = renderContract(f, { contractNo: "E2026-TEST0003" });
    const text = contractText(doc);
    expect(doc.title).toBe("産業医顧問契約書");
    expect(text).toContain("第13条の2の趣旨に沿って");
    expect(text).toContain("本契約は、法第13条第1項に基づく産業医の選任ではない");
    expect(text).toContain("産業医選任契約に移行する");
    expect(text).toContain("本契約には定期の訪問を含まない");
    expect(text).toContain("年額 360,000円(税込。うち消費税 32,727円)");
    expect(text).toContain("1年分の請求書");
    expect(text).toContain("月割りで計算した額を甲に返還");
    expect(text).not.toContain("衛生委員会への参画");
    expect(text).not.toContain("産業医選任報告");
    expect(doc.articles.map((a) => a.no)).toEqual(doc.articles.map((_, i) => i + 1));
  });
  it("選任契約・協力医師の条項(税別)", () => {
    const f: ContractFields = { ...fields(), coopDoctor: true, coopDoctorName: "佐藤 一郎", coopDoctorNote: "○○クリニック", feeTax: "excluded", fee: 45000 };
    const doc = renderContract(f, { contractNo: "E2026-TEST0005" });
    const text = contractText(doc);
    expect(doc.articles[4].title).toBe("協力医師による業務の分担");
    expect(text).toContain("第5条(協力医師による業務の分担)");
    expect(text).toContain("協力医師: 佐藤 一郎(○○クリニック)");
    expect(text).toContain("分担業務: 職場巡視、衛生委員会への参画(委員としての調査審議)");
    expect(text).toContain("民法第644条の2第1項の承諾を含む");
    expect(text).toContain("協力医師を本事業場の産業医として追加して選任し");
    expect(text).toContain("報酬は第7条のとおりとし、本契約上の義務および責任は乙が負う");
    expect(doc.articles[6].title).toBe("報酬");
    expect(text).toContain("甲は、協力医師に対し、業務上の指揮命令を行わない");
    expect(text).toContain("第5条により協力医師が分担する業務については協力医師");
    expect(text).toContain("第5条に定める場合のほか、乙は、担当医師が疾病");
    expect(text).toContain("月額 45,000円(消費税別)とし、甲は、これに消費税および地方消費税の相当額を加えた額を支払う");
    expect(text).not.toContain("うち消費税");
  });
  it("協力医師のチェックなしなら条項は入らず、氏名は保存されない。顧問契約では使えない", () => {
    const p = parseContractFields({ ...VALID, coopDoctor: false, coopDoctorName: "佐藤 一郎" });
    expect(p.ok && p.value.coopDoctorName).toBe("");
    expect(parseContractFields({ ...VALID, coopDoctor: true })).toMatchObject({ ok: false, error: expect.stringContaining("協力医師の氏名") });
    const q = parseContractFields({ ...VALID, kind: "advisory", coopDoctor: true, coopDoctorName: "佐藤 一郎" });
    expect(q.ok && q.value.coopDoctor).toBe(false);
    const text = contractText(renderContract(fields(), { contractNo: "E2026-TEST0006" }));
    expect(text).not.toContain("協力医師");
  });
  it("顧問契約・月1回訪問・月額", () => {
    const f: ContractFields = { ...fields(), kind: "advisory", visitFrequency: "monthly", hoursPerVisit: 1 };
    const text = contractText(renderContract(f, { contractNo: "E2026-TEST0004" }));
    expect(text).toContain("月1回、1回あたり1時間");
    expect(text).toContain("衛生推進者(法第12条の2)");
    expect(text).toContain("第3条(訪問および相談)");
  });
  it("覚書: 原契約の特定・復委任の承諾・原契約と一体", () => {
    const p = parseContractFields({ ...VALID, kind: "memo_coop", originalTitle: "産業医選任契約書", originalDate: "2025-04-01", coopDoctorName: "佐藤 一郎", fee: "45000", feeTax: "excluded", termMonths: "", hoursPerVisit: "" });
    if (!p.ok) throw new Error(p.error);
    const doc = renderContract(p.value, { contractNo: "E2026-TEST0007" });
    const text = contractText(doc);
    expect(doc.title).toBe("産業医の業務の分担に関する覚書");
    expect(doc.ko.label).toBe("甲");
    expect(text).toContain("2025年4月1日付「産業医選任契約書」(以下「原契約」という)");
    expect(text).toContain("第1条(協力医師による業務の分担の承諾)");
    expect(text).toContain("民法第644条の2第1項の承諾を含む");
    expect(text).toContain("分担業務については本覚書が優先する");
    expect(text).toContain("協力医師を甲の事業場の産業医として追加して選任し");
    expect(text).toContain("原契約に定める報酬(月額 45,000円(消費税別))は変わらない");
    expect(text).toContain("原契約が終了したときは、本覚書も終了する");
    expect(text).toContain("本覚書の電磁的記録を原本として保管");
    expect(parseContractFields({ ...VALID, kind: "memo_coop", originalTitle: "", coopDoctorName: "佐藤 一郎" })).toMatchObject({ ok: false, error: expect.stringContaining("原契約の名称") });
  });
  it("協力医師(個人・給与扱い): 事務所が甲、医師が乙。フリーランス法の明示・源泉徴収・直接契約の事前協議", () => {
    const p = parseContractFields({ ...VALID, kind: "coop_individual", partyName: "佐藤 一郎", partyAddress: "大阪市北区1-1", partyRepName: "", partyRepTitle: "", coopClientName: "株式会社テスト 本社", fee: "30000", coopWithholding: true, coopExtraIncluded: true, coopTravel: "actual", signerName: "佐藤 一郎", signerEmail: "sato@example.com" });
    if (!p.ok) throw new Error(p.error);
    const doc = renderContract(p.value, { contractNo: "E2026-TEST0008" });
    const text = contractText(doc);
    expect(doc.title).toBe("協力医師業務委託契約書");
    expect(doc.ko.label).toBe("乙");
    expect(doc.otsu.label).toBe("甲");
    expect(text).toContain("メステート合同会社(うえまつ産業医事務所)(以下「甲」という)と、佐藤 一郎(以下「乙」という)");
    expect(text).toContain("株式会社テスト 本社(以下「顧問先」という)");
    expect(text).toContain("自ら本業務を行う");
    expect(text).toContain("月額 30,000円とする");
    expect(text).toContain("所得税法上の給与等として取り扱う");
    expect(text).toContain("源泉徴収税額表の乙欄");
    expect(text).toContain("翌月末日(受領日から60日以内)");
    expect(text).toContain("特定受託事業者に係る取引の適正化等に関する法律第3条");
    expect(text).toContain("少なくとも終了日の30日前までに本契約の終了を予告");
    expect(text).toContain("終了後1年間、甲を通じて担当した顧問先");
    expect(text).toContain("ハラスメント");
    expect(text).toContain("交通費は、実費を報酬と併せて支払う");
    expect(text).toContain("その対価は第6条の報酬に含む");
    expect(doc.articles[5].title).toBe("報酬および支払");
    expect(text).not.toContain("__FEE__");
    expect(text).not.toContain("うち消費税");
  });
  it("協力医師(法人): 担当医師の特定・適格請求書・臨時対応は1件あたり", () => {
    const p = parseContractFields({ ...VALID, kind: "coop_corporate", partyName: "医療法人テスト会", partyOfficeName: "テストクリニック", partyRepTitle: "理事長", partyRepName: "高橋 次郎", coopDoctorName: "佐藤 一郎", coopClientName: "株式会社テスト 本社", coopInvoiceNo: "t1234567890123", fee: "33000", feeTax: "included", coopExtraIncluded: false, coopExtraFee: "22000", coopTravel: "included" });
    if (!p.ok) throw new Error(p.error);
    expect(p.value.coopInvoiceNo).toBe("T1234567890123");
    expect(p.value.coopWithholding).toBe(false);
    const text = contractText(renderContract(p.value, { contractNo: "E2026-TEST0009" }));
    expect(text).toContain("医療法人テスト会 テストクリニック(以下「乙」という)");
    expect(text).toContain("佐藤 一郎(以下「担当医師」という)に本業務を行わせる");
    expect(text).toContain("適格請求書(登録番号 T1234567890123)");
    expect(text).toContain("月額 33,000円(税込。うち消費税 3,000円)");
    expect(text).toContain("1件あたり22,000円(税込)を第6条の報酬に加えて支払う");
    expect(text).toContain("交通費は、報酬に含む");
    expect(parseContractFields({ ...VALID, kind: "coop_corporate", coopDoctorName: "", coopClientName: "X" })).toMatchObject({ ok: false, error: expect.stringContaining("担当医師") });
    expect(parseContractFields({ ...VALID, kind: "coop_corporate", coopDoctorName: "A", coopClientName: "X", coopInvoiceNo: "123" })).toMatchObject({ ok: false, error: expect.stringContaining("登録番号") });
  });
  it("当事者の呼び方と記録の表記は種類で切り替わる", () => {
    const main = renderContract(fields(), { contractNo: "E" });
    expect(partyLabels(main)).toEqual({ party: "甲", office: "乙" });
    expect(eventLabel("signed", partyLabels(main))).toBe("甲の合意(電子署名)");
    const coop = parseContractFields({ ...VALID, kind: "coop_individual", partyName: "佐藤 一郎", coopClientName: "X" });
    if (!coop.ok) throw new Error(coop.error);
    const labels = partyLabels(renderContract(coop.value, { contractNo: "E" }));
    expect(labels).toEqual({ party: "乙", office: "甲" });
    expect(eventLabel("sent", labels)).toBe("送信・甲の合意(電子署名)");
    expect(eventLabel("viewed", labels)).toBe("乙が閲覧");
    expect(eventLabel("review_ok", labels)).toBe("乙が案文に「問題なし」と回答");
    expect(eventLabel("review_sent", labels)).toBe("確認用リンクを送付(署名なし・案文の確認)");
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
