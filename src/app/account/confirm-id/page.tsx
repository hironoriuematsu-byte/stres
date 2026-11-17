import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { ConfirmIdForm } from "./ConfirmIdForm";

export const metadata = { title: "ご本人の確認", robots: { index: false, follow: false } };

// 行き先はサイト内のパスだけ(外部へ飛ばさない)
const safeNext = (v: string | undefined): string => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/exam");

// IDでログインした方の、最初の本人確認(生年月日)
export default async function ConfirmIdPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams.next);
  const { user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data } = await createClient().from("profiles").select("login_id, id_confirmed_at, id_confirm_failures").eq("user_id", user.id).maybeSingle();
  if (!data?.login_id || data.id_confirmed_at) redirect(next);
  return <ConfirmIdForm name={profile?.name ?? ""} next={next} locked={(data.id_confirm_failures ?? 0) >= 5} />;
}
