import { useEffect, useRef, useState } from "react";

// 알림 API 가 준비되지 않은 환경에서는 아무것도 그리지 않는다.
export default function Subscribe({ profile }) {
  const [status, setStatus] = useState(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // 숨은 입력란(봇 방지)
  const [turnstile, setTurnstile] = useState("");
  const [state, setState] = useState({ phase: "idle", message: "" });
  const widget = useRef(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (!status?.turnstileSiteKey) return;
    const render = () =>
      window.turnstile?.render(widget.current, {
        sitekey: status.turnstileSiteKey,
        callback: setTurnstile,
        "expired-callback": () => setTurnstile(""),
      });
    if (window.turnstile) return void render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [status]);

  if (!status?.enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    setState({ phase: "sending", message: "" });
    try {
      const resp = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, consent, website, turnstile, profile }),
      });
      const body = await resp.json();
      if (resp.ok) return setState({ phase: "done", message: body.message });
      const errors = {
        invalid_email: "이메일 주소를 확인해 주세요.",
        consent_required: "개인정보 수집·이용에 동의해 주세요.",
        rate_limited: "오늘 신청이 많아 잠시 후 다시 시도해 주세요.",
        challenge_failed: "자동 가입 방지 확인에 실패했습니다. 다시 시도해 주세요.",
        mail_failed: "확인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
      setState({ phase: "error", message: errors[body.error] ?? "신청에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    } catch {
      setState({ phase: "error", message: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
    }
  };

  if (state.phase === "done") {
    return (
      <section className="card panel subscribe" role="status">
        <h3><span className="badge badge-ok">완료</span>확인 메일을 보냈어요</h3>
        <p className="muted" style={{ marginTop: 8 }}>{state.message}</p>
      </section>
    );
  }

  return (
    <section className="card panel subscribe">
      <h3>🔔 새 지원 알림 받기</h3>
      <p className="muted" style={{ marginTop: 6 }}>
        왼쪽에 입력한 조건에 맞는 지원이 새로 등록되거나 바뀌면 이메일로 알려드립니다.
      </p>
      <form onSubmit={submit}>
        <input
          className="input"
          type="email"
          required
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="hp"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <label className="check consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            개인정보 수집·이용에 동의합니다. (수집 항목: 이메일, 입력한 조건 / 목적: 신규·변경 지원 알림 발송 / 보유: 수신거부 시까지, 거부하면 즉시 삭제)
            <a href="/privacy" target="_blank" rel="noreferrer"> 자세히</a>
          </span>
        </label>
        <div ref={widget} />
        <button className="btn btn-primary btn-block" type="submit" disabled={!consent || state.phase === "sending"}>
          {state.phase === "sending" ? "보내는 중…" : "확인 메일 받기"}
        </button>
        {state.phase === "error" && <p className="notice" role="alert">{state.message}</p>}
      </form>
    </section>
  );
}
