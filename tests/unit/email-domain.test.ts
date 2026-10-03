import { describe, expect, it } from "vitest";
import { emailDomain, suggestEmail, suggestEmailDomain } from "@/lib/email-domain";

describe("email-domain", () => {
  it("ドメインを小文字で取り出す", () => {
    expect(emailDomain("Taro@Example.JP")).toBe("example.jp");
    expect(emailDomain("no-at")).toBe("");
  });

  it("よくあるドメインの入力ミスに候補を返す", () => {
    expect(suggestEmailDomain("a@ezweb.nb.jp")).toBe("ezweb.ne.jp");
    expect(suggestEmailDomain("a@gmali.com")).toBe("gmail.com");
    expect(suggestEmailDomain("a@docomo.ne.jp.")).toBe("docomo.ne.jp");
    expect(suggestEmail("taro@ezweb.nb.jp")).toBe("taro@ezweb.ne.jp");
  });

  it("正しいドメイン・似ていないドメインには候補を出さない", () => {
    expect(suggestEmailDomain("a@ezweb.ne.jp")).toBeNull();
    expect(suggestEmailDomain("a@gmail.com")).toBeNull();
    expect(suggestEmailDomain("a@mestate.jp")).toBeNull();
    expect(suggestEmailDomain("a@example-company.co.jp")).toBeNull();
    expect(suggestEmail("a@mestate.jp")).toBeNull();
  });

  it("短いドメインは1文字違いまでしか候補にしない", () => {
    expect(suggestEmailDomain("a@au.co")).toBe("au.com"); // 距離1
    expect(suggestEmailDomain("a@ab.jp")).toBeNull(); // 距離2以上は短いドメインでは候補にしない
  });
});
