import { getDb } from "../_lib/db.js";
import { actionPage, messagePage } from "../_lib/pages.js";
import { html } from "../_lib/util.js";

const TOKEN_RE = /^[0-9a-f]{64}$/;

export async function onRequestGet({ request, env }) {
  const db = await getDb(env);
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!db || !TOKEN_RE.test(token)) return html(messagePage("유효하지 않은 링크", "링크가 올바르지 않거나 만료되었습니다."), 404);
  const row = await db.prepare("SELECT status FROM subscribers WHERE token = ?").bind(token).first();
  if (!row) return html(messagePage("유효하지 않은 링크", "링크가 올바르지 않거나 만료되었습니다."), 404);
  if (row.status === "active") return html(messagePage("이미 확인되었습니다", "알림이 이미 시작되어 있습니다."));
  return html(
    actionPage({
      title: "알림 신청 확인",
      message: "아래 버튼을 누르면 설정한 조건에 맞는 신규·변경 지원 소식을 이메일로 받습니다. 언제든 메일 하단에서 수신거부할 수 있습니다.",
      button: "알림 시작하기",
      token,
    }),
  );
}

export async function onRequestPost({ request, env }) {
  const db = await getDb(env);
  const form = await request.formData();
  const token = String(form.get("t") ?? "");
  if (!db || !TOKEN_RE.test(token)) return html(messagePage("유효하지 않은 링크", "링크가 올바르지 않거나 만료되었습니다."), 404);
  const result = await db
    .prepare("UPDATE subscribers SET status = 'active', confirmed_at = ? WHERE token = ?")
    .bind(new Date().toISOString(), token)
    .run();
  if (!result.meta.changes) return html(messagePage("유효하지 않은 링크", "링크가 올바르지 않거나 만료되었습니다."), 404);
  return html(messagePage("알림이 시작되었습니다", "새로 등록되거나 바뀐 지원 중 조건에 맞는 것이 있으면 이메일로 알려드립니다."));
}
