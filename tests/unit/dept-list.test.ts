import { describe, it, expect } from "vitest";
import { parseDeptList } from "@/lib/parse-csv";
import { decodeText } from "@/lib/read-text";

describe("部署の一括登録(parseDeptList)", () => {
  it("1行1部署のテキストを読む(空行・前後の空白は無視)", () => {
    expect(parseDeptList("製造部\n\n 営業部 \r\n総務部\n")).toEqual(["製造部", "営業部", "総務部"]);
  });

  it("CSVの1列目を部署名として読み、見出し行は飛ばす", () => {
    expect(parseDeptList("﻿部署名,人数\r\n製造部,30\r\n\"営業部\",12\r\n")).toEqual(["製造部", "営業部"]);
  });

  it("重複は1つにまとめる(入力順を保つ)", () => {
    expect(parseDeptList("営業部\n製造部\n営業部")).toEqual(["営業部", "製造部"]);
  });

  it("1列目が空なら次の列を使う", () => {
    expect(parseDeptList(",製造部\n,営業部")).toEqual(["製造部", "営業部"]);
  });
});

describe("CSVファイルの文字コード(decodeText)", () => {
  it("UTF-8はそのまま読む", () => {
    expect(decodeText(new TextEncoder().encode("製造部\n営業部").buffer as ArrayBuffer)).toBe("製造部\n営業部");
  });

  it("Shift_JIS(Excel保存)も文字化けせずに読む", () => {
    // 「製造部」の Shift_JIS バイト列
    const sjis = new Uint8Array([0x90, 0xbb, 0x91, 0xa2, 0x95, 0x94]);
    expect(decodeText(sjis.buffer as ArrayBuffer)).toBe("製造部");
  });
});
