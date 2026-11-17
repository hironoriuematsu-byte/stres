// メールアドレスやスマートフォンのない方の受検(ID受検・紙の回答)。画面とサーバーで共通の定義
//   ログインの仕組み(Supabase Auth)はメールアドレスが必須のため、メールなしの方には
//   「stid.<ログインID>@<ドメイン>」という内部用のアドレスを割り当てる(実在しない宛先。メールは一切送らない)。
//   本人はログインID(数字8桁)と合言葉だけを使う

export const ID_EMAIL_PREFIX = "stid.";
// 内部用アドレスのドメイン。メールの形式チェックを通る実在のドメインにする(環境変数 ID_LOGIN_EMAIL_DOMAIN で変えられる)
export const DEFAULT_ID_EMAIL_DOMAIN = "mestate.jp";

export const LOGIN_ID_LENGTH = 8;
export const PASSCODE_LENGTH = 8; // 英小文字4 + 数字4
export const ID_CONFIRM_MAX_FAILURES = 5;

export type ExamMethod = "web" | "id" | "paper";
export const EXAM_METHOD_LABEL: Record<ExamMethod, string> = { web: "メール", id: "ID", paper: "紙" };

// 全角の数字・英字を半角にし、空白とハイフンを除く(紙を見て打つときの打ち間違いを吸収する)
const normalize = (s: string): string =>
  s
    .normalize("NFKC")
    .replace(/[\s\-ー－―‐]/g, "")
    .trim();

export const normalizeLoginId = (s: string): string => normalize(s);
export const validLoginId = (s: string): boolean => new RegExp(`^\\d{${LOGIN_ID_LENGTH}}$`).test(s);
// 合言葉は小文字と数字だけなので、大文字で打っても通るようにする
export const normalizePasscode = (s: string): string => normalize(s).toLowerCase();

export const idEmail = (loginId: string, domain: string = DEFAULT_ID_EMAIL_DOMAIN): string => `${ID_EMAIL_PREFIX}${loginId}@${domain}`;
// メールなしの方の内部用アドレスか(このアドレスにはメールを送らない)
export const isIdEmail = (email: string | null | undefined): boolean => /^stid\.\d{8}@/i.test(email ?? "");

// 画面に出すログインID(1234 5678 のように区切る)
export const formatLoginId = (id: string): string => (validLoginId(id) ? `${id.slice(0, 4)} ${id.slice(4)}` : id);

// 紙に書いて渡す合言葉: 読み間違えやすい文字(l・o・i・0・1 など)を使わない
const PASS_LETTERS = "abcdefghjkmnprstuvwxyz";
const PASS_DIGITS = "23456789";

// 乱数(0以上1未満)を受け取って作る(サーバーでは crypto を渡す。テストでは決まった値を渡せる)
export function makeLoginId(rand: () => number): string {
  let s = String(1 + Math.floor(rand() * 9)); // 先頭は0にしない
  for (let i = 1; i < LOGIN_ID_LENGTH; i++) s += String(Math.floor(rand() * 10));
  return s;
}
export function makePasscode(rand: () => number): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += PASS_LETTERS[Math.floor(rand() * PASS_LETTERS.length)];
  for (let i = 0; i < 4; i++) s += PASS_DIGITS[Math.floor(rand() * PASS_DIGITS.length)];
  return s;
}
