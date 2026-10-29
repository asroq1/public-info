import { alertsEnabled, getDb } from "../_lib/db.js";
import { confirmEmail, sendEmails } from "../_lib/email.js";
import { json, randomToken, siteOrigin } from "../_lib/util.js";
import { normalizeEmail, normalizeProfile } from "../_lib/validate.js";

const SITE_NAME = "내 혜택 찾기";
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const GENERIC_OK = { ok: true, message: "확인 메일을 보냈습니다. 메일의 확인 버튼을 눌러야 알림이 시작됩니다." };

async function passesTurnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return resp.ok && (await resp.json()).success === true;
}

export async function onRequestPost({ request, env }) {
  if (!alertsEnabled(env)) return json({ error: "alerts_disabled" }, 503);
  const db = await getDb(env);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.website) return json(GENERIC_OK); // 봇이 채우는 숨은 입력란
  if (body.consent !== true) return json({ error: "consent_required" }, 400);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "invalid_email" }, 400);
  if (!(await passesTurnstile(env, request, body.turnstile))) return json({ error: "challenge_failed" }, 400);

  const now = new Date();
  const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
  const cap = Number(env.MAX_SIGNUPS_PER_DAY) || 50;
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM subscribers WHERE created_at >= ?").bind(dayAgo).first();
  const existing = await db.prepare("SELECT * FROM subscribers WHERE email = ?").bind(email).first();

  // 이미 구독 중이거나 방금 확인 메일을 보냈다면 아무것도 하지 않는다 (가입 여부 노출 방지, 메일 폭탄 방지)
  if (existing?.status === "active") return json(GENERIC_OK);
  if (existing?.last_confirm_sent && now - new Date(existing.last_confirm_sent) < RESEND_COOLDOWN_MS) {
    return json(GENERIC_OK);
  }
  if (!existing && recent.n >= cap) return json({ error: "rate_limited" }, 429);

  const token = randomToken();
  const profile = JSON.stringify(normalizeProfile(body.profile));
  const stamp = now.toISOString();
  if (existing) {
    await db
      .prepare("UPDATE subscribers SET profile = ?, token = ?, last_confirm_sent = ? WHERE id = ?")
      .bind(profile, token, stamp, existing.id)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO subscribers (email, profile, token, status, created_at, last_confirm_sent) VALUES (?, ?, ?, 'pending', ?, ?)",
      )
      .bind(email, profile, token, stamp, stamp)
      .run();
  }

  const confirmUrl = `${siteOrigin(env, request)}/api/confirm?t=${token}`;
  const mail = confirmEmail({ confirmUrl, siteName: SITE_NAME });
  const [sent] = await sendEmails(env, [{ to: email, ...mail }]);
  if (!sent) return json({ error: "mail_failed" }, 502);
  return json(GENERIC_OK);
}
