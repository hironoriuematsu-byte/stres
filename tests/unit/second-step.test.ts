import { describe, expect, it } from "vitest";
import { checkMessage, isCode, maskEmail, normalizeCode, safeNext, sessionIdOf } from "@/lib/second-step";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: unknown) => `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;

describe("二段階認証: 共通の処理", () => {
  it("アクセストークンからログイン(セッション)のIDを取り出す", () => {
    const sid = "0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8";
    expect(sessionIdOf(jwt({ sub: "u1", session_id: sid }))).toBe(sid);
    // 氏名など日本語が入っていても読める
    expect(sessionIdOf(jwt({ sub: "u1", session_id: sid.toUpperCase(), user_metadata: { name: "山田 太郎" } }))).toBe(sid);
    expect(sessionIdOf(jwt({ sub: "u1" }))).toBeNull();
    expect(sessionIdOf(jwt({ session_id: "not-a-uuid" }))).toBeNull();
    expect(sessionIdOf("abc")).toBeNull();
    expect(sessionIdOf("a.%%%.c")).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });

  it("確認コードの入力をそろえる(全角・空白・ハイフン)", () => {
    expect(normalizeCode(" １２３ ４５６ ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
    expect(isCode(normalizeCode("１２３４５６"))).toBe(true);
    expect(isCode("12345")).toBe(false);
    expect(isCode("1234567")).toBe(false);
    expect(isCode("12a456")).toBe(false);
  });

  it("メールアドレスは一部を伏せて表示する", () => {
    expect(maskEmail("yamada@example.co.jp")).toBe("ya***@example.co.jp");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
    expect(maskEmail("ab@example.com")).toBe("a***@example.com");
    expect(maskEmail("")).toBe("登録のメールアドレス");
    expect(maskEmail(undefined)).toBe("登録のメールアドレス");
  });

  it("戻り先は自分のサイトの中だけ", () => {
    expect(safeNext("/office?tab=logs")).toBe("/office?tab=logs");
    expect(safeNext("https://evil.example.com/")).toBe("/");
    expect(safeNext("//evil.example.com")).toBe("/");
    expect(safeNext("/\\evil.example.com")).toBe("/");
    expect(safeNext("/verify?next=/office")).toBe("/");
    expect(safeNext("/api/second-step/gate")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("", "/jimu")).toBe("/jimu");
  });

  it("照合結果ごとの案内", () => {
    expect(checkMessage("wrong")).toContain("違います");
    expect(checkMessage("locked")).toContain("送り直す");
    expect(checkMessage("expired")).toContain("有効期限");
    expect(checkMessage("none")).toContain("送り直す");
    expect(checkMessage("error")).toContain("もう一度");
  });
});
