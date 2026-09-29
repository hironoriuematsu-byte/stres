import { describe, it, expect } from "vitest";
import { findExactDept, searchDepts } from "@/lib/dept-search";

const OPTS = ["製造部", "営業部", "営業1課", "営業2課", "総務部", "品質保証部", "ＩＴ推進室"];

describe("部署の検索(searchDepts)", () => {
  it("空なら全件", () => {
    expect(searchDepts(OPTS, "")).toEqual(OPTS);
  });

  it("部分一致で絞り込み、前方一致を先に出す", () => {
    expect(searchDepts(OPTS, "営業")).toEqual(["営業部", "営業1課", "営業2課"]);
    expect(searchDepts(OPTS, "保証")).toEqual(["品質保証部"]);
  });

  it("全角/半角・大文字小文字・空白の違いを無視する", () => {
    expect(searchDepts(OPTS, "it")).toEqual(["ＩＴ推進室"]);
    expect(searchDepts(OPTS, "営業 1")).toEqual(["営業1課"]);
    expect(searchDepts(OPTS, "営業１課")).toEqual(["営業1課"]);
  });

  it("該当なしは空", () => {
    expect(searchDepts(OPTS, "人事")).toEqual([]);
  });
});

describe("完全一致(findExactDept)", () => {
  it("表記の違いを吸収して一覧の表記を返す", () => {
    expect(findExactDept(OPTS, "営業１課")).toBe("営業1課");
    expect(findExactDept(OPTS, " 製造部 ")).toBe("製造部");
    expect(findExactDept(OPTS, "営業")).toBeNull();
  });
});
