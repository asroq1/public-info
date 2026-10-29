const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    profile TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
    created_at TEXT NOT NULL,
    confirmed_at TEXT,
    last_confirm_sent TEXT,
    last_digest TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status)`,
];

let ready;

/** D1 바인딩이 없으면 null (알림 기능 비활성). 스키마는 처음 한 번만 만든다. */
export async function getDb(env) {
  if (!env.DB) return null;
  ready ??= env.DB.batch(STATEMENTS.map((s) => env.DB.prepare(s)));
  try {
    await ready;
  } catch (e) {
    ready = undefined;
    throw e;
  }
  return env.DB;
}

// 메일 키가 없어도 ALLOW_DRY_RUN(로컬 개발 전용)이면 켜진다. 운영에서는 ALLOW_DRY_RUN 을 설정하지 않는다.
export const alertsEnabled = (env) =>
  Boolean(env.DB && env.FROM_EMAIL && (env.RESEND_API_KEY || env.ALLOW_DRY_RUN));
