import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

// ============================================================
// 電子契約の改ざん検知(サーバー専用)
//   - 契約書の文面のハッシュ(SHA-256)
//   - 記録(監査証跡)のハッシュの連鎖: 各記録は直前の記録のハッシュを含めて計算するので、
//     途中の記録を書き換えたり抜いたりすると以降のハッシュが合わなくなる
//   - 事業者署名: 締結が完了した契約について、文面のハッシュと記録の連鎖の末尾を
//     サーバーだけが持つ秘密鍵で署名する(HMAC-SHA256)。事業者署名型(立会人型)の電子署名に当たる
//   - 署名用リンクのトークン: ランダムな値をメールで送り、データベースにはハッシュだけを保存する
// ============================================================

export const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: tokenHash(token) };
}
export const tokenHash = (token: string): string => sha256(`sign-token:${token}`);

// アクセスコードは契約ごとに違うハッシュになるよう、契約IDを混ぜる
export const accessCodeHash = (contractId: string, code: string): string => sha256(`access-code:${contractId}:${code}`);

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export type EventInput = {
  contract_id: string;
  seq: number;
  event: string;
  actor: string;
  actor_name: string | null;
  actor_email: string | null;
  ip: string | null;
  at: string;
  detail: Record<string, unknown> | null;
};

// データベースに保存して読み戻しても同じ文字列になるように整える:
//   - 日時はミリ秒までの ISO 形式(Postgres はマイクロ秒・"+00:00" 付きで返す)
//   - JSON のキーは並べ替える(jsonb はキーの順番を保たない)
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
export const canonicalJson = (v: unknown): string => JSON.stringify(sortKeys(v));
export const canonicalTime = (iso: string): string => new Date(iso).toISOString();

// 記録のハッシュ: 直前のハッシュ + 記録の内容(順番を固定した配列)
export function eventHash(prev: string | null, e: EventInput): string {
  return sha256(
    canonicalJson([prev ?? "", e.contract_id, e.seq, e.event, e.actor, e.actor_name ?? "", e.actor_email ?? "", e.ip ?? "", canonicalTime(e.at), e.detail ?? null])
  );
}

// 連鎖の検証: 記録の並びを先頭から計算し直し、保存されているハッシュと一致するか
export function verifyChain(events: (EventInput & { prev_hash: string | null; hash: string })[]): boolean {
  let prev: string | null = null;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if ((e.prev_hash ?? null) !== prev) return false;
    if (eventHash(prev, e) !== e.hash) return false;
    prev = e.hash;
  }
  return true;
}

// 事業者署名(秘密鍵が設定されていないときは null。設定は README を参照)
export function serviceSignature(documentHash: string, completionHash: string, secret: string | undefined = process.env.CONTRACT_SIGNING_SECRET): string | null {
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${documentHash}.${completionHash}`, "utf8").digest("hex");
}

export function verifyServiceSignature(documentHash: string, completionHash: string, signature: string, secret: string | undefined = process.env.CONTRACT_SIGNING_SECRET): boolean {
  const expected = serviceSignature(documentHash, completionHash, secret);
  return !!expected && safeEqualHex(expected, signature);
}
