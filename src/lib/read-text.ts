// CSVファイルを文字化けせずに読む。
// Excel で保存したCSVは Shift_JIS のことが多いので、UTF-8として読めなければ Shift_JIS として読み直す
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

export async function readTextFile(file: File): Promise<string> {
  return decodeText(await file.arrayBuffer());
}
