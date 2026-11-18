import { describe, expect, it } from "vitest";
import { matchesSearch, searchKey } from "@/lib/search";

describe("検索の文字の比べ方", () => {
  it("姓と名の間の空白(半角・全角・なし)を区別しない", () => {
    const names = ["上松 正和", "上松　正和", "上松正和", "上松  正和", " 上松\t正和 "];
    for (const q of ["上松 正和", "上松　正和", "上松正和"]) {
      for (const n of names) expect(matchesSearch(q, [n]), `${q} / ${n}`).toBe(true);
    }
    expect(new Set(names.map(searchKey)).size).toBe(1);
  });

  it("部分一致(姓だけ・名だけ・途中まで)", () => {
    expect(matchesSearch("上松", ["上松 正和"])).toBe(true);
    expect(matchesSearch("正和", ["上松　正和"])).toBe(true);
    expect(matchesSearch("松正", ["上松 正和"])).toBe(true);
    expect(matchesSearch("上松 正", ["上松正和"])).toBe(true);
    expect(matchesSearch("山田", ["上松 正和"])).toBe(false);
  });

  it("全角/半角の英数字・大文字/小文字を区別しない", () => {
    expect(matchesSearch("ＡＢＣ１２３", ["abc123"])).toBe(true);
    expect(matchesSearch("Yamada@Example.com", ["yamada@example.com"])).toBe(true);
    expect(matchesSearch("ｶﾌﾞｼｷ", ["カブシキガイシャ"])).toBe(true);
    expect(matchesSearch("東亜テクニカル株式会社会津若松", ["東亜テクニカル株式会社　会津若松事業所"])).toBe(true);
  });

  it("空の検索語はすべてに一致・空の候補は一致しない", () => {
    expect(matchesSearch("  　", ["何か"])).toBe(true);
    expect(matchesSearch("上松", [null, undefined, ""])).toBe(false);
    expect(searchKey(null)).toBe("");
  });
});
