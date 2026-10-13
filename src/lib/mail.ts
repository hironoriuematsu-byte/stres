// メール送信(Resend)。
// Resend APIは1秒あたり2リクエストまでのため、429(レート制限)の場合は待って再試行する

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendViaResend(
  resendKey: string,
  payload: { from: string; to: string[]; subject: string; text: string }
): Promise<{ ok: boolean; detail?: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { ok: true };
      const detail = `${res.status} ${await res.text()}`;
      if (res.status === 429) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      return { ok: false, detail };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  }
  return { ok: false, detail: "429 rate limited(再試行上限に達しました)" };
}
