import Anthropic from "@anthropic-ai/sdk";
import { cleanFlat, paperCount, paperSections, type FlatAnswers } from "@/lib/paper";

// 紙の回答用紙の写真・スキャンから、丸の付いた番号をAI(Claude)で読み取る。
// 読み取った結果は登録画面に入るだけで、人が見比べて直してから登録する(そのまま結果にはしない)

const MODEL = "claude-opus-5-5";

export const paperReadConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });
  return client;
}

export type PaperFile = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; data: string };
export const PAPER_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const PAPER_MAX_FILES = 4;
export const PAPER_MAX_BASE64_CHARS = 3_600_000; // 送信の上限(約4.5MB)に収める

const READ_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      description: "読み取れた設問ごとの回答",
      items: {
        type: "object",
        properties: {
          no: { type: "integer", description: "設問の通し番号" },
          choice: { type: "integer", description: "丸の付いた番号(1〜4)。未記入・複数に丸・読めないときは 0" },
          unsure: { type: "boolean", description: "読み取りに自信がないとき true(丸が薄い、2つの番号にかかっている、訂正の跡がある など)" },
        },
        required: ["no", "choice", "unsure"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
} as const;

function systemPrompt(questionnaire: "57" | "80"): string {
  const n = paperCount(questionnaire);
  const layout = paperSections(questionnaire)
    .map((s) => `${s.key}: 設問 ${s.items[0].no}〜${s.items[s.items.length - 1].no}(選択肢 1=${s.options[0]} 2=${s.options[1]} 3=${s.options[2]} 4=${s.options[3]})`)
    .join("\n");
  return [
    "あなたは、ストレスチェック(職業性ストレス簡易調査票)の紙の回答用紙を読み取る係です。",
    `用紙には設問が通し番号 1〜${n} で並び、各設問の右に 1・2・3・4 の番号が印刷されています。回答者は、あてはまる番号を1つ丸で囲んでいます(塗りつぶし・チェック印・番号への斜線の場合もあります)。`,
    "",
    "設問の並び:",
    layout,
    "",
    "やること:",
    `- 画像に写っている設問について、設問の通し番号と、丸の付いた番号(1〜4)を読み取る。写っていない設問は出力しない。`,
    "- 未記入、2つ以上に丸、どれか判別できないときは choice を 0 にする。推測で埋めない。",
    "- 二重線などで訂正してあるときは、訂正後の番号を読み、unsure を true にする。",
    "- 行がずれないよう、必ず印刷された設問番号と同じ行の丸を読む。",
    "- 氏名・生年月日などの個人情報が写っていても、読み取らない・出力しない。",
  ].join("\n");
}

export async function readPaperAnswers(files: PaperFile[], questionnaire: "57" | "80"): Promise<{ flat: FlatAnswers; unsure: number[]; read: number }> {
  const n = paperCount(questionnaire);
  const content: Anthropic.Beta.BetaContentBlockParam[] = files.map((f) =>
    f.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.data } }
  );
  content.push({ type: "text", text: `この回答用紙(${files.length}枚)を読み取ってください。設問は全部で${n}問です。` });
  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: systemPrompt(questionnaire), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: "low", format: { type: "json_schema", schema: READ_SCHEMA as unknown as Record<string, unknown> } },
  });
  if (res.stop_reason === "refusal") throw new Error("AIが読み取れませんでした(refusal)");
  const block = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  if (!block) throw new Error("AIの応答が空でした");
  const parsed = JSON.parse(block.text) as { answers?: { no?: unknown; choice?: unknown; unsure?: unknown }[] };
  const raw: number[] = Array(n).fill(0);
  const unsure: number[] = [];
  let read = 0;
  for (const a of parsed.answers ?? []) {
    const no = Number(a.no);
    if (!Number.isInteger(no) || no < 1 || no > n) continue;
    raw[no - 1] = Number(a.choice);
    if (Number(a.choice) >= 1 && Number(a.choice) <= 4) read++;
    if (a.unsure === true) unsure.push(no);
  }
  return { flat: cleanFlat(raw, questionnaire), unsure: unsure.sort((x, y) => x - y), read };
}
