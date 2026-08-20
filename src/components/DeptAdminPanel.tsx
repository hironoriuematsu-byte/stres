"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { logAccess } from "@/lib/log";

type Dept = { id: string; name: string; sort_order: number };

const input = {
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  fontSize: 14,
  border: `1px solid ${brand.line}`,
  borderRadius: 9,
};

// office / 誓約済みjimu: 部署名マスタの登録・編集(受検時の選択肢になる)
export function DeptAdminPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [rows, setRows] = useState<Dept[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const supabase = createClient();

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("departments")
      .select("id, name, sort_order")
      .eq("company_id", companyId)
      .order("sort_order")
      .order("name");
    if (error) setErr(error.message);
    setRows((data as Dept[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    setRows(null);
    setErr(null);
    setNotice(null);
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from("departments")
      .insert({ company_id: companyId, name: v, sort_order: (rows?.length ?? 0) + 1 });
    setBusy(false);
    if (error) {
      setErr(error.code === "23505" ? `「${v}」は既に登録されています。` : "追加に失敗しました: " + error.message);
      return;
    }
    logAccess(supabase, "dept_master_added", `${companyName}/${v}`, companyId);
    setNotice(`「${v}」を追加しました。`);
    setName("");
    load();
  };

  const rename = async (d: Dept) => {
    const v = editName.trim();
    if (!v || v === d.name) {
      setEditing(null);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("departments").update({ name: v }).eq("id", d.id);
    setBusy(false);
    if (error) {
      setErr(error.code === "23505" ? `「${v}」は既に登録されています。` : "変更に失敗しました: " + error.message);
      return;
    }
    logAccess(supabase, "dept_master_renamed", `${companyName}/${d.name}→${v}`, companyId);
    setNotice(`「${d.name}」を「${v}」に変更しました(既に受検済みの結果の部署名は変わりません)。`);
    setEditing(null);
    load();
  };

  const remove = async (d: Dept) => {
    if (!confirm(`「${d.name}」を選択肢から削除します。\n\n既に受検済みの結果の部署名は変わりません(集計にも影響しません)。\nよろしいですか?`)) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("departments").delete().eq("id", d.id);
    setBusy(false);
    if (error) {
      setErr("削除に失敗しました: " + error.message);
      return;
    }
    logAccess(supabase, "dept_master_removed", `${companyName}/${d.name}`, companyId);
    setNotice(`「${d.name}」を選択肢から削除しました。`);
    load();
  };

  if (rows === null) return <Card>読み込み中…</Card>;

  return (
    <Card>
      <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>部署管理({companyName})</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: "0 0 14px", lineHeight: 1.7 }}>
        ここで登録した部署名が、従業員の受検画面と結果一覧の部署名修正で<strong>選択肢</strong>として表示されます。
        表記ゆれ(例: 営業 / 営業部)を防ぎ、集団分析が正しく集計されるようになります。
        一覧にない部署は、受検画面で「その他(直接入力)」から入力することもできます。
      </p>

      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 製造部"
          style={{ ...input, width: 240 }}
        />
        <Btn type="submit" disabled={busy || !name.trim()}>
          {busy ? "追加中…" : "部署を追加"}
        </Btn>
      </form>

      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 10 }}>{err}</div>}
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
              {["部署名", "操作"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "9px 10px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>
                  {editing === d.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ ...input, padding: "6px 9px", width: 240 }}
                    />
                  ) : (
                    d.name
                  )}
                </td>
                <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                  {editing === d.id ? (
                    <>
                      <Btn tone="teal" onClick={() => rename(d)} disabled={busy} style={{ padding: "5px 12px", fontSize: 12, marginRight: 6 }}>
                        保存
                      </Btn>
                      <Btn tone="ghost" onClick={() => setEditing(null)} style={{ padding: "5px 12px", fontSize: 12 }}>
                        キャンセル
                      </Btn>
                    </>
                  ) : (
                    <>
                      <Btn
                        tone="ghost"
                        onClick={() => {
                          setEditing(d.id);
                          setEditName(d.name);
                        }}
                        style={{ padding: "5px 12px", fontSize: 12, marginRight: 6 }}
                      >
                        名称変更
                      </Btn>
                      <button
                        onClick={() => remove(d)}
                        disabled={busy}
                        style={{
                          background: "#fff",
                          border: "1px solid #D64545",
                          color: "#B02A2A",
                          borderRadius: 8,
                          padding: "5px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        削除
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                  部署がまだ登録されていません。上のフォームから追加してください(未登録の間、受検画面は直接入力になります)。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
