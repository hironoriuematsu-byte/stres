import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestUser } from "@/lib/supabase/server";
import { adminClient, officeEmails, sendMails } from "@/lib/plan-server";
import { eventHash, serviceSignature, tokenHash } from "@/lib/contract-crypto";
import { IMPLEMENTER, SELLER } from "@/lib/org";
import { formatJpDate } from "@/lib/plan";
import {
  type ContractDoc,
  type ContractEvent,
  type ContractEventKind,
  type ContractFields,
  type ContractRow,
  feeText,
  formatJst,
  partyDisplayName,
  termEndDate,
  visitLabel,
} from "@/lib/contract";

// ============================================================
// 電子契約のサーバー処理で共通に使うもの(ログイン確認・記録の追加・メール)
// ============================================================

// データベースの行(ログイン利用者には見せない列を含む。サーバー専用)
export type ContractDbRow = ContractRow & {
  document_text: string | null;
  token_hash: string | null;
  access_code_hash: string | null;
  code_attempts: number;
  sent_by: string | null;
  signed_ip: string | null;
  created_by: string | null;
};

export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export const LOGIN_EXPIRED = "ログインの有効期限が切れました。ページを再読み込みして、もう一度ログインしてください。";

// 実施者(office)としてログインしているか。契約の作成・送信・取消は実施者だけができる
export async function officeContext(req: Request): Promise<
  { ok: true; admin: SupabaseClient; userId: string; email: string | null; name: string | null } | { ok: false; res: NextResponse }
> {
  const user = await requestUser(req);
  if (!user) return { ok: false, res: fail(401, LOGIN_EXPIRED) };
  const admin = adminClient();
  if (!admin) return { ok: false, res: fail(500, "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です") };
  const { data: prof } = await admin.from("profiles").select("role, name").eq("user_id", user.id).maybeSingle();
  if (prof?.role !== "office") return { ok: false, res: fail(403, "電子契約を扱えるのは実施者(産業医事務所)だけです") };
  return { ok: true, admin, userId: user.id, email: user.email ?? null, name: (prof?.name as string | null) ?? null };
}

// 署名者はログインしないので、サーバーの鍵だけを確認する
export function publicContext(): { ok: true; admin: SupabaseClient } | { ok: false; res: NextResponse } {
  const admin = adminClient();
  if (!admin) return { ok: false, res: fail(500, "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です") };
  return { ok: true, admin };
}

export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || null;
}

export const userAgent = (headers: Headers): string | null => headers.get("user-agent")?.slice(0, 300) ?? null;

export const siteOrigin = (req: Request): string => process.env.NEXT_PUBLIC_SITE_URL || req.headers.get("origin") || new URL(req.url).origin;

export const signUrl = (origin: string, token: string): string => `${origin}/sign/${token}`;

export async function loadContract(admin: SupabaseClient, id: unknown): Promise<ContractDbRow | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin.from("contracts").select("*").eq("id", id).maybeSingle();
  return (data as ContractDbRow | null) ?? null;
}

export async function loadContractByToken(admin: SupabaseClient, token: unknown): Promise<ContractDbRow | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const { data } = await admin.from("contracts").select("*").eq("token_hash", tokenHash(token)).maybeSingle();
  return (data as ContractDbRow | null) ?? null;
}

export async function loadEvents(admin: SupabaseClient, contractId: string): Promise<ContractEvent[]> {
  const { data } = await admin.from("contract_events").select("*").eq("contract_id", contractId).order("seq");
  return (data as ContractEvent[]) ?? [];
}

// 記録(監査証跡)を1件追加する。直前の記録のハッシュを含めてハッシュを計算する。
// 同時に2件追加しようとして番号が重なったときは、読み直してもう一度試す
export async function addEvent(
  admin: SupabaseClient,
  contractId: string,
  input: {
    event: ContractEventKind;
    actor: "office" | "party" | "system";
    actor_name?: string | null;
    actor_email?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    detail?: Record<string, unknown> | null;
  }
): Promise<ContractEvent> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await admin
      .from("contract_events")
      .select("seq, hash")
      .eq("contract_id", contractId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const seq = (last?.seq ?? 0) + 1;
    const prev = (last?.hash as string | undefined) ?? null;
    const at = new Date().toISOString();
    const row = {
      contract_id: contractId,
      seq,
      event: input.event,
      actor: input.actor,
      actor_name: input.actor_name ?? null,
      actor_email: input.actor_email ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
      at,
      detail: input.detail ?? null,
      prev_hash: prev,
    };
    const hash = eventHash(prev, row);
    const { data, error } = await admin.from("contract_events").insert({ ...row, hash }).select("*").single();
    if (data) return data as ContractEvent;
    if (error?.code !== "23505") throw new Error(`記録を保存できませんでした: ${error?.message ?? ""}`);
  }
  throw new Error("記録を保存できませんでした(同時更新)。もう一度お試しください");
}

export async function logOffice(admin: SupabaseClient, userId: string, action: string, target: string, companyId: string | null): Promise<void> {
  await admin.from("access_logs").insert({ user_id: userId, role: "office", action, target, company_id: companyId });
}

// 締結の完了: 甲の合意の記録のハッシュを末尾として事業者署名を付け、記録に残す
export async function completeContract(admin: SupabaseClient, c: ContractDbRow, signedEvent: ContractEvent): Promise<{ completionHash: string; signature: string | null }> {
  const completionHash = signedEvent.hash;
  const signature = serviceSignature(c.document_hash ?? "", completionHash);
  await admin.from("contracts").update({ completion_hash: completionHash, service_signature: signature, updated_at: new Date().toISOString() }).eq("id", c.id);
  await addEvent(admin, c.id, {
    event: "completed",
    actor: "system",
    actor_name: OFFICE_SIGN_NAME,
    detail: { completion_hash: completionHash, service_signature: signature, signature_method: signature ? "HMAC-SHA256" : "未設定" },
  });
  return { completionHash, signature };
}

// 乙の署名者(事業者側)の表記
export const OFFICE_SIGN_NAME = `${SELLER.name} 代表社員 ${SELLER.representative}`;

// ---- メール ----

const footer = [`${SELLER.name}(${IMPLEMENTER.officeName})`, `担当医師: ${IMPLEMENTER.full}`, SELLER.address, `お問い合わせ: ${SELLER.email}`];

function summaryLines(f: ContractFields): string[] {
  return [
    `契約先: ${partyDisplayName(f)}`,
    `契約期間: ${formatJpDate(f.startDate)} 〜 ${formatJpDate(termEndDate(f.startDate, f.termMonths))}(${f.termMonths}か月${f.autoRenew ? "・自動更新" : ""})`,
    `訪問: ${visitLabel(f.visitFrequency)}・1回 ${f.hoursPerVisit}時間`,
    `報酬: ${feeText(f.monthlyFee)}`,
  ];
}

export async function mailSignRequest(c: ContractDbRow, url: string, resend: boolean): Promise<void> {
  const f = c.fields;
  await sendMails(
    [c.signer_email],
    `【うえまつ産業医事務所】産業医業務委託契約書の電子署名のお願い${resend ? "(再送)" : ""}(契約番号 ${c.contract_no})`,
    [
      f.partyName,
      `${c.signer_name} 様`,
      "",
      `${IMPLEMENTER.officeName}(${SELLER.name})です。`,
      resend
        ? "産業医業務委託契約書の署名用リンクを新しくお送りします(以前のリンクは使えなくなりました)。"
        : "産業医業務委託契約書をお送りします。下のリンクを開いて内容をご確認のうえ、電子署名(同意)をお願いします。",
      "",
      url,
      "",
      "■ 契約の概要",
      ...summaryLines(f),
      "",
      "■ 電子署名について",
      "・リンクを開き、契約書の内容を確認して「同意して締結する」を押すと締結となります。書面の作成・押印・収入印紙は不要です。",
      ...(c.access_code_hash ? ["・開いた画面でアクセスコードの入力が必要です。アクセスコードは送信者から別途(電話など)お伝えします。"] : []),
      `・署名の期限: ${formatJst(c.token_expires_at)}。期限が切れた場合はご連絡ください(リンクを再送します)。`,
      "・内容の修正が必要な場合は、画面の「辞退する」から理由をお知らせいただくか、下記までご連絡ください。",
      "・締結後は、同じリンクから契約書と合意締結証明をいつでも閲覧・印刷(PDF保存)できます。",
      "",
      ...footer,
    ].join("\n")
  );
}

export async function mailCompleted(admin: SupabaseClient, c: ContractDbRow, url: string, origin: string): Promise<void> {
  const f = c.fields;
  const common = [
    `契約番号: ${c.contract_no}`,
    `締結日時: ${formatJst(c.signed_at)}`,
    `甲の署名者: ${c.signed_name ?? c.signer_name}${c.signed_title ? `(${c.signed_title})` : ""}`,
    `乙の署名者: ${OFFICE_SIGN_NAME}`,
    `文面のハッシュ(SHA-256): ${c.document_hash ?? ""}`,
  ];
  await sendMails(
    [c.signer_email],
    `【うえまつ産業医事務所】産業医業務委託契約が締結されました(契約番号 ${c.contract_no})`,
    [
      f.partyName,
      `${c.signed_name ?? c.signer_name} 様`,
      "",
      "産業医業務委託契約の電子署名をいただき、ありがとうございます。契約が締結されました。",
      "契約書と合意締結証明(署名の記録)は、下のリンクからいつでも閲覧・印刷(PDF保存)できます。このメールは契約書の控えとして保管してください。",
      "",
      url,
      "",
      "■ 契約の概要",
      ...summaryLines(f),
      ...common,
      "",
      "■ 今後の流れ",
      "・担当医師より、初回訪問の日程についてご連絡します。",
      "・常時50人以上の労働者を使用する事業場では、選任後14日以内に所轄労働基準監督署へ産業医選任報告が必要です。必要な書面(医師免許証の写し等)はこちらからお送りします。",
      "",
      ...footer,
    ].join("\n")
  );
  await sendMails(
    await officeEmails(admin),
    `【電子契約】産業医業務委託契約が締結されました: ${partyDisplayName(f)}(${c.contract_no})`,
    [
      "契約先が電子署名を行い、産業医業務委託契約が締結されました。",
      "",
      ...summaryLines(f),
      ...common,
      "",
      `契約書・証明: ${origin}/contracts/${c.id}`,
    ].join("\n")
  );
}

export async function mailDeclined(admin: SupabaseClient, c: ContractDbRow, reason: string, origin: string): Promise<void> {
  await sendMails(
    await officeEmails(admin),
    `【電子契約】契約先が署名を辞退しました: ${partyDisplayName(c.fields)}(${c.contract_no})`,
    [
      "契約先の署名者が、産業医業務委託契約書の電子署名を辞退しました。",
      "",
      `契約先: ${partyDisplayName(c.fields)}`,
      `署名者: ${c.signer_name}(${c.signer_email})`,
      `理由: ${reason || "(記載なし)"}`,
      "",
      "内容を直して送る場合は、実施者ダッシュボードの「電子契約」で下書きを複製して作り直してください。",
      `${origin}/office`,
    ].join("\n")
  );
}

export async function mailCancelled(c: ContractDbRow): Promise<void> {
  await sendMails(
    [c.signer_email],
    `【うえまつ産業医事務所】産業医業務委託契約書の送信を取り消しました(契約番号 ${c.contract_no})`,
    [
      c.fields.partyName,
      `${c.signer_name} 様`,
      "",
      `先にお送りした産業医業務委託契約書(契約番号 ${c.contract_no})の送信を取り消しました。お送りしたリンクは使えなくなっています。`,
      "内容を見直したうえで、改めてお送りすることがあります。ご不明な点は下記までご連絡ください。",
      "",
      ...footer,
    ].join("\n")
  );
}

export async function mailSentNotice(admin: SupabaseClient, c: ContractDbRow, origin: string, byName: string | null): Promise<void> {
  await sendMails(
    await officeEmails(admin),
    `【電子契約】契約書を送信しました: ${partyDisplayName(c.fields)}(${c.contract_no})`,
    [
      `${byName ?? "実施者"} が産業医業務委託契約書を送信しました。契約先の署名を待っています。`,
      "",
      ...summaryLines(c.fields),
      `署名者: ${c.signer_name}(${c.signer_email})`,
      `署名の期限: ${formatJst(c.token_expires_at)}`,
      "",
      `状況: ${origin}/contracts/${c.id}`,
    ].join("\n")
  );
}

export type { ContractDoc };
