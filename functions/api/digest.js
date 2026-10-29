import { matchDigest, renderDigest } from "../_lib/digest.js";
import { alertsEnabled, getDb } from "../_lib/db.js";
import { sendEmails, unsubscribeHeaders } from "../_lib/email.js";
import { json, safeEqual, siteOrigin, today } from "../_lib/util.js";

const SITE_NAME = "내 혜택 찾기";
const PENDING_TTL_MS = 3 * 24 * 3600 * 1000;
const SQL_PARAM_LIMIT = 90;

// 배포 직후 GitHub Actions 가 호출한다. 같은 날 여러 번 호출돼도 구독자당 하루 한 통만 나간다.
export async function onRequestPost({ request, env }) {
  if (!env.DIGEST_TOKEN) return json({ error: "digest_disabled" }, 503);
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.DIGEST_TOKEN}`)) return json({ error: "unauthorized" }, 401);
  if (!alertsEnabled(env)) return json({ error: "alerts_disabled" }, 503);
  const db = await getDb(env);

  const date = today();
  const origin = siteOrigin(env, request);

  // 확인하지 않은 신청은 3일 뒤 삭제한다
  await db
    .prepare("DELETE FROM subscribers WHERE status = 'pending' AND created_at < ?")
    .bind(new Date(Date.now() - PENDING_TTL_MS).toISOString())
    .run();

  const assetResp = await env.ASSETS.fetch(new URL("/data/changes.json", request.url));
  let changes;
  try {
    changes = await assetResp.json();
  } catch {
    return json({ error: "changes_unreadable" }, 502);
  }
  const todayChanges = changes?.today;
  if (!todayChanges || todayChanges.date !== date) return json({ skipped: "no_changes_for_today", date });
  if (!todayChanges.new?.length && !todayChanges.updated?.length) return json({ sent: 0, reason: "no_changes", date });

  const { results: subs } = await db
    .prepare("SELECT id, email, token, profile FROM subscribers WHERE status = 'active' AND (last_digest IS NULL OR last_digest < ?)")
    .bind(date)
    .all();

  const maxSends = Number(env.MAX_DIGEST_PER_RUN) || 100; // Resend 무료 플랜 일일 한도
  const messages = [];
  const sendIds = [];
  const noMatchIds = [];
  let deferred = 0;
  for (const sub of subs) {
    let profile;
    try {
      profile = JSON.parse(sub.profile);
    } catch {
      continue;
    }
    const matched = matchDigest(profile, todayChanges);
    if (!matched) {
      noMatchIds.push(sub.id);
      continue;
    }
    if (messages.length >= maxSends) {
      deferred++;
      continue;
    }
    const unsubscribeUrl = `${origin}/api/unsubscribe?t=${sub.token}`;
    messages.push({
      to: sub.email,
      ...renderDigest(matched, { siteName: SITE_NAME, siteUrl: origin, date, unsubscribeUrl }),
      headers: unsubscribeHeaders(unsubscribeUrl),
    });
    sendIds.push(sub.id);
  }

  const results = messages.length ? await sendEmails(env, messages) : [];
  const sentIds = sendIds.filter((_, i) => results[i]);
  const markIds = [...sentIds, ...noMatchIds];
  const statements = [];
  for (let i = 0; i < markIds.length; i += SQL_PARAM_LIMIT) {
    const chunk = markIds.slice(i, i + SQL_PARAM_LIMIT);
    statements.push(
      db
        .prepare(`UPDATE subscribers SET last_digest = ? WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(date, ...chunk),
    );
  }
  if (statements.length) await db.batch(statements);

  return json({
    date,
    subscribers: subs.length,
    matched: messages.length,
    sent: sentIds.length,
    failed: sendIds.length - sentIds.length,
    deferred,
  });
}
