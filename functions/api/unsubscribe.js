import { getDb } from "../_lib/db.js";
import { actionPage, messagePage } from "../_lib/pages.js";
import { html } from "../_lib/util.js";

const TOKEN_RE = /^[0-9a-f]{64}$/;

export async function onRequestGet({ request }) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!TOKEN_RE.test(token)) return html(messagePage("유효하지 않은 링크", "링크가 올바르지 않습니다."), 404);
  return html(
    actionPage({
      title: "수신거부",
      message: "수신거부하면 이메일 주소와 입력하신 조건이 즉시 삭제되고 더 이상 알림이 발송되지 않습니다.",
      button: "수신거부하기",
      token,
    }),
  );
}

// 폼 버튼과 메일 클라이언트의 원클릭 수신거부(List-Unsubscribe-Post)를 모두 처리한다.
export async function onRequestPost({ request, env }) {
  const db = await getDb(env);
  const fromQuery = new URL(request.url).searchParams.get("t");
  let token = fromQuery ?? "";
  if (!token) {
    try {
      token = String((await request.formData()).get("t") ?? "");
    } catch {
      token = "";
    }
  }
  if (!db || !TOKEN_RE.test(token)) return html(messagePage("유효하지 않은 링크", "링크가 올바르지 않습니다."), 404);
  await db.prepare("DELETE FROM subscribers WHERE token = ?").bind(token).run();
  return html(messagePage("수신거부 완료", "이메일 주소와 입력하신 조건을 삭제했습니다. 더 이상 알림이 발송되지 않습니다."));
}
