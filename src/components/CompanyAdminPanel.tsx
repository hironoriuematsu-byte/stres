"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Company } from "@/lib/types";

const input = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  fontSize: 14,
  border: `1px solid ${brand.line}`,
  borderRadius: 9,
};

// office専用: 契約企業の追加・名称変更
export function CompanyAdminPanel({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const supabase = createClient();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.from("companies").insert({ name: name.trim(), code: code.trim() });
    setBusy(false);
    if (error) {
      setNotice(
        error.code === "23505"
          ? `企業コード「${code}」は既に使われています。別のコードを指定してください。`
          : "追加に失敗しました: " + error.message
      );
      return;
    }
    setNotice(`「${name}」を追加しました。`);
    setName("");
    setCode("");
    router.refresh();
  };

  const rename = async (c: Company) => {
    setBusy(true);
    const { error } = await supabase.from("companies").update({ name: editName.trim() }).eq("id", c.id);
    setBusy(false);
    if (error) {
      setNotice("名称変更に失敗しました: " + error.message);
      return;
    }
    setEditing(null);
    setNotice("名称を変更しました。");
    router.refresh();
  };

  return (
    <Card>
      <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>企業管理</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: "0 0 14px", lineHeight: 1.7 }}>
        契約企業の追加と名称変更ができます。企業コードは招待CSVや識別に使う短い英数字です(例:
        KYT001)。誤削除防止のため、削除はこの画面からはできません。
      </p>

      <form onSubmit={add} style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr auto", alignItems: "end" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink }}>企業名</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例: マルホ発條工業株式会社" style={input} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink }}>企業コード</label>
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="例: MRH001"
            pattern="[A-Za-z0-9\-_]{2,20}"
            title="英数字・ハイフン・アンダースコア2〜20文字"
            style={input}
          />
        </div>
        <Btn type="submit" disabled={busy}>
          {busy ? "追加中…" : "企業を追加"}
        </Btn>
      </form>

      {notice && (
        <div
          style={{
            fontSize: 13,
            color: brand.tealDark,
            background: "#E2F3F1",
            borderRadius: 10,
            padding: "10px 14px",
            marginTop: 12,
          }}
        >
          {notice}
        </div>
      )}

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["企業名", "企業コード", "操作"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>
                  {editing === c.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...input, padding: "6px 9px" }} />
                  ) : (
                    c.name
                  )}
                </td>
                <td style={{ padding: "9px 10px" }}>
                  <code>{c.code}</code>
                </td>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {editing === c.id ? (
                    <>
                      <Btn tone="teal" onClick={() => rename(c)} disabled={busy || !editName.trim()} style={{ padding: "5px 12px", fontSize: 12, marginRight: 6 }}>
                        保存
                      </Btn>
                      <Btn tone="ghost" onClick={() => setEditing(null)} style={{ padding: "5px 12px", fontSize: 12 }}>
                        キャンセル
                      </Btn>
                    </>
                  ) : (
                    <Btn
                      tone="ghost"
                      onClick={() => {
                        setEditing(c.id);
                        setEditName(c.name);
                      }}
                      style={{ padding: "5px 12px", fontSize: 12 }}
                    >
                      名称変更
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                  企業はまだ登録されていません。上のフォームから追加してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
