import { alertsEnabled } from "../_lib/db.js";
import { json } from "../_lib/util.js";

// 화면이 구독 폼을 보여줄지 결정한다. 설정이 덜 된 환경에서는 폼이 숨겨진다.
export const onRequestGet = ({ env }) =>
  json({ enabled: alertsEnabled(env), turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
