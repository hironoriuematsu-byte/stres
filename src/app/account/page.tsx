import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth-server";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { EmailChangeForm } from "./EmailChangeForm";
import { NameChangeForm } from "./NameChangeForm";
import { BirthDateForm } from "./BirthDateForm";
import { createClient } from "@/lib/supabase/server";
import { fetchBirthDate } from "@/lib/birth-date-db";
import { formatLoginId, isIdEmail } from "@/lib/no-email";

export default async function AccountPage() {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/account");
  // 生年月日(従業員・実施事務従事者のみ。SQL 0024 未実行なら欄を出さない)
  const showBirth = profile && (profile.role === "employee" || profile.role === "jimu");
  const birth = showBirth ? await fetchBirthDate(createClient(), user.id) : { supported: false, value: null };

  const idUser = isIdEmail(user.email);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 16 }}>
      {profile && <NameChangeForm userId={user.id} initialName={profile.name} />}
      {showBirth && birth.supported && <BirthDateForm userId={user.id} initial={birth.value ?? ""} />}
      {idUser ? (
        // ログインIDで受検する方: メールアドレスはなく、合言葉は担当者が出し直す
        <Card>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>ログインID</h3>
          <div style={{ fontSize: 22, fontWeight: 700, color: brand.ink, letterSpacing: "0.08em" }}>{formatLoginId((user.email ?? "").replace(/^stid\./i, "").split("@")[0])}</div>
          <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.7, margin: "8px 0 0" }}>
            合言葉を忘れたときは、実施事務従事者(ストレスチェックの担当者)に声をかけてください。新しい合言葉の紙をお渡しします。
          </p>
        </Card>
      ) : (
        <>
          <EmailChangeForm currentEmail={user.email ?? ""} />
          <Card>
            <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>パスワードの変更</h3>
            <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 10px" }}>
              ログイン用のパスワードを変更できます。
            </p>
            <Link href="/account/update-password" style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
              パスワードを変更する →
            </Link>
          </Card>
        </>
      )}
    </div>
  );
}
