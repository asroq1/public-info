import { escapeHtml } from "./util.js";

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const BATCH_SIZE = 100;

/**
 * messages: [{ to, subject, html, text, headers? }]
 * 반환: 메시지별 성공 여부 배열. API 키가 없으면 ALLOW_DRY_RUN 일 때만 로그로 대신한다.
 */
export async function sendEmails(env, messages) {
  if (!env.RESEND_API_KEY) {
    if (!env.ALLOW_DRY_RUN) throw new Error("RESEND_API_KEY 가 설정되지 않았습니다");
    for (const m of messages) console.log(`[dry-run] to=${m.to} subject=${m.subject}\n${m.text}`);
    return messages.map(() => true);
  }

  const results = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    const body = chunk.map((m) => ({
      from: env.FROM_EMAIL,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      ...(m.headers ? { headers: m.headers } : {}),
    }));
    let ok = false;
    try {
      const resp = await fetch(RESEND_BATCH_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      ok = resp.ok;
      if (!ok) console.error(`Resend 실패 ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    } catch (e) {
      console.error(`Resend 호출 오류: ${e.message}`);
    }
    results.push(...chunk.map(() => ok));
  }
  return results;
}

export const unsubscribeHeaders = (url) => ({
  "List-Unsubscribe": `<${url}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

export function confirmEmail({ confirmUrl, siteName }) {
  const subject = `[${siteName}] 알림 신청을 확인해 주세요`;
  const text = [
    `${siteName} 알림을 신청하셨다면 아래 링크에서 확인 버튼을 눌러 주세요.`,
    confirmUrl,
    "",
    "본인이 신청한 것이 아니라면 이 메일을 무시하세요. 확인하지 않으면 알림은 발송되지 않고 신청 정보는 자동으로 삭제됩니다.",
  ].join("\n");
  const html = `<p>${escapeHtml(siteName)} 알림을 신청하셨다면 아래 버튼을 눌러 확인해 주세요.</p>
<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">신청 확인하기</a></p>
<p style="color:#6b7686;font-size:13px">본인이 신청한 것이 아니라면 이 메일을 무시하세요. 확인하지 않으면 알림은 발송되지 않고 신청 정보는 자동으로 삭제됩니다.</p>`;
  return { subject, text, html };
}
