"use client";

import { createClient } from "@/lib/supabase/client";

// ログインが必要なサーバーAPIを呼ぶ(ブラウザ側)。
// ログインの情報(Cookie)がうまく届かない場合に備えて、ログイン中の証明(アクセストークン)も一緒に送る。
// 期限切れのトークンは getSession が自動で更新する。ログインが切れていれば、分かりやすいメッセージで止める
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ ok: boolean; status: number; json: T & { error?: string } }> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) {
    return {
      ok: false,
      status: 401,
      json: { error: "ログインの有効期限が切れました。ページを再読み込みして、もう一度ログインしてください。" } as T & { error?: string },
    };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({ error: `通信エラー(${res.status})。時間をおいてもう一度お試しください。` }))) as T & { error?: string };
  if (res.status === 401) json.error = "ログインの有効期限が切れました。ページを再読み込みして、もう一度ログインしてください。";
  return { ok: res.ok, status: res.status, json };
}
