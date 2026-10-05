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

export default async function AccountPage() {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/account");
  // 生年月日(従業員・実施事務従事者のみ。SQL 0024 未実行なら欄を出さない)
  const showBirth = profile && (profile.role === "employee" || profile.role === "jimu");
  const birth = showBirth ? await fetchBirthDate(createClient(), user.id) : { supported: false, value: null };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 16 }}>
      {profile && <NameChangeForm userId={user.id} initialName={profile.name} />}
      {showBirth && birth.supported && <BirthDateForm userId={user.id} initial={birth.value ?? ""} />}
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
    </div>
  );
}
