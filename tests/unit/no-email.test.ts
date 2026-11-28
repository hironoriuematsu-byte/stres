import { describe, expect, it } from "vitest";
import { formatLoginId, idEmail, isIdEmail, makeLoginId, makePasscode, normalizeLoginId, normalizePasscode, validLoginId } from "@/lib/no-email";
import { cleanFlat, emptyFlat, flatComplete, flatMissing, flatToAnswers, paperCount, paperSections } from "@/lib/paper";
import { calcScores, emptyAnswers, type Answers } from "@/lib/questionnaire";
import { EXT80_ITEMS } from "@/lib/questionnaire80";

// 決まった順の乱数(テスト用)
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("ログインIDと合言葉", () => {
  it("ログインIDは数字8桁で、先頭は0にならない", () => {
    for (const r of [0, 0.5, 0.999999]) {
      const id = makeLoginId(() => r);
      expect(validLoginId(id)).toBe(true);
      expect(id[0]).not.toBe("0");
    }
    expect(makeLoginId(seq([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]))).toBe("11234567");
  });

  it("合言葉は英小文字4つ+数字4つで、読み間違えやすい文字を使わない", () => {
    for (const r of [0, 0.3, 0.77, 0.999999]) {
      const p = makePasscode(() => r);
      expect(p).toMatch(/^[a-z]{4}[2-9]{4}$/);
      expect(p).not.toMatch(/[loiq01]/);
    }
  });

  it("全角・空白・ハイフン・大文字で打っても同じものとして扱う", () => {
    expect(normalizeLoginId(" １２３４ ５６７８ ")).toBe("12345678");
    expect(normalizeLoginId("1234-5678")).toBe("12345678");
    expect(normalizePasscode("ＡＢcd 2345")).toBe("abcd2345");
  });

  it("内部用のアドレスを作り、見分けられる(このアドレスにはメールを送らない)", () => {
    expect(idEmail("12345678")).toBe("stid.12345678@mestate.jp");
    expect(idEmail("12345678", "example.jp")).toBe("stid.12345678@example.jp");
    expect(isIdEmail("stid.12345678@mestate.jp")).toBe(true);
    expect(isIdEmail("STID.12345678@mestate.jp")).toBe(true);
    expect(isIdEmail("taro@example.com")).toBe(false);
    expect(isIdEmail("stid.1234@mestate.jp")).toBe(false);
    expect(isIdEmail(null)).toBe(false);
  });

  it("画面では4桁ずつに区切って出す", () => {
    expect(formatLoginId("12345678")).toBe("1234 5678");
    expect(formatLoginId("abc")).toBe("abc");
  });
});

describe("紙の回答用紙", () => {
  it("通し番号は 57項目版で1〜57、80項目版で1〜80(抜け・重複なし)", () => {
    for (const q of ["57", "80"] as const) {
      const nos = paperSections(q).flatMap((s) => s.items.map((i) => i.no));
      expect(nos).toEqual(Array.from({ length: paperCount(q) }, (_, i) => i + 1));
    }
    expect(paperCount("57")).toBe(57);
    expect(paperCount("80")).toBe(80);
  });

  it("A=1〜17、B=18〜46、C=47〜55、D=56〜57 の順に並ぶ", () => {
    const s = paperSections("57");
    expect(s.map((x) => [x.key, x.items[0].no, x.items[x.items.length - 1].no])).toEqual([
      ["A", 1, 17],
      ["B", 18, 46],
      ["C", 47, 55],
      ["D", 56, 57],
    ]);
    // 80項目版の追加は、調査票の設問番号(58〜80)をそのまま使う
    const ext = paperSections("80").slice(4).flatMap((x) => x.items.map((i) => i.no));
    expect(ext).toEqual(EXT80_ITEMS.map((i) => i.no).sort((a, b) => a - b));
  });

  it("空欄や 1〜4 以外は未記入として扱い、未記入の設問番号を返す", () => {
    const flat = cleanFlat([1, 2, 5, "3", null, 4], "57");
    expect(flat.length).toBe(57);
    expect(flat.slice(0, 6)).toEqual([1, 2, 0, 0, 0, 4]);
    expect(flatComplete(flat, "57")).toBe(false);
    expect(flatMissing(flat, "57").slice(0, 3)).toEqual([3, 4, 5]);
    expect(flatComplete(emptyFlat("57"), "57")).toBe(false);
    expect(flatComplete(Array(57).fill(2), "57")).toBe(true);
    expect(flatComplete(Array(57).fill(2), "80")).toBe(false);
  });

  it("通し番号順の回答を、Web受検と同じ形にする(点数もWeb受検と同じになる)", () => {
    // Web受検の形で作った回答
    const web: Answers = emptyAnswers();
    web.A = web.A.map((_, i) => (i % 4) + 1);
    web.B = web.B.map((_, i) => ((i + 1) % 4) + 1);
    web.C = web.C.map((_, i) => ((i + 2) % 4) + 1);
    web.D = [3, 1];
    // 同じ回答を紙の通し番号順に並べる
    const flat = [...web.A, ...web.B, ...web.C, ...web.D] as number[];
    const { answers, ext } = flatToAnswers(flat, "57");
    expect(answers).toEqual(web);
    expect(ext).toBeNull();
    expect(calcScores(answers)).toEqual(calcScores(web));
  });

  it("80項目版は、58〜80 を追加項目の回答として分ける", () => {
    const flat = Array.from({ length: 80 }, (_, i) => (i % 4) + 1);
    const { answers, ext } = flatToAnswers(flat, "80");
    expect(answers.D).toEqual([flat[55], flat[56]]);
    expect(ext).toEqual(flat.slice(57));
    expect(ext?.length).toBe(23);
  });

  it("全部「高ストレス側」の回答は高ストレス、全部「低ストレス側」は高ストレスにならない", () => {
    // B(心身の反応)を全部 4(ほとんどいつもあった)にすると、反転項目(活気など)以外で点が高くなる
    const high = Array(57).fill(4);
    const low = Array(57).fill(1);
    expect(typeof calcScores(flatToAnswers(high, "57").answers).highStress).toBe("boolean");
    expect(calcScores(flatToAnswers(high, "57").answers).B).toBeGreaterThan(calcScores(flatToAnswers(low, "57").answers).B);
  });
});
