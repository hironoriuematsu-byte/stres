import { fail, intakeContext } from "@/lib/intake-api";
import { companyInfo, loadRequest } from "@/lib/interview-schedule-server";

export const runtime = "nodejs";

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// 確定した面談をカレンダーに入れるためのファイル(.ics)。本人と実施者だけが取れる
export async function GET(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, role } = ctx;
  const requestId = new URL(req.url).searchParams.get("requestId");
  const request = await loadRequest(admin, requestId);
  if (!request || (request.user_id !== userId && role !== "office")) return fail(404, "申出が見つかりません");
  if (request.status !== "scheduled" || !request.scheduled_at) return fail(400, "確定した日程がありません");
  const co = await companyInfo(admin, request.company_id);
  const start = new Date(request.scheduled_at);
  const visit = request.schedule_mode === "visit";
  const end = visit ? new Date(start.getTime() + 24 * 3600_000) : new Date(start.getTime() + (request.duration_min ?? 30) * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ストレスチェックWeb//面接指導//JA",
    "BEGIN:VEVENT",
    `UID:interview-${request.id}@stres.mestate.jp`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    visit ? `DTSTART;VALUE=DATE:${start.toISOString().slice(0, 10).replace(/-/g, "")}` : `DTSTART:${stamp(start.toISOString())}`,
    visit ? `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}` : `DTEND:${stamp(end.toISOString())}`,
    `SUMMARY:${esc(visit ? "産業医面接指導(訪問日・対面)" : "産業医面接指導(オンライン)")}`,
    ...(request.meet_url ? [`LOCATION:${esc(request.meet_url)}`, `URL:${request.meet_url}`] : []),
    `DESCRIPTION:${esc(visit ? `${co.name} 産業医の訪問日に対面で行います。時間と場所は会社の担当者から連絡があります。` : `${co.name} オンライン面談。時間になったらURLを開いてください。`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="interview.ics"' },
  });
}
