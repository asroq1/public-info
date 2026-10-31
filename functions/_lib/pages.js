import { escapeHtml } from "./util.js";

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4F8DFF"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><circle cx="16" cy="16.8" r="9.2" fill="#0B2A8F" opacity=".18"/><circle cx="16" cy="16" r="9.2" fill="#fff"/><path d="M11.8 16.4l3 3 5.6-6.4" fill="none" stroke="#1D4ED8" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24.6" cy="7.4" r="2.2" fill="#FBBF24"/></svg>`;

const THEME_BTN = `<button class="theme-btn" type="button" data-theme-toggle aria-label="화면 모드 전환 (라이트/다크)" title="화면 모드 전환"><svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg><svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>`;

const shell = (title, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/page.css"><script src="/theme.js"></script></head>
<body><header class="site-header"><div class="wrap"><a class="brand" href="/"><span class="logo" aria-hidden="true">${LOGO}</span>내 혜택 찾기</a><div class="header-actions">${THEME_BTN}</div></div></header>
<main class="wrap doc"><section class="card"><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</section>
<p style="margin-top:16px"><a href="/">내 혜택 찾기로 돌아가기</a></p></main></body></html>`;

export const messagePage = (title, message) => shell(title, `<p>${escapeHtml(message)}</p>`);

/** 메일 보안 스캐너가 링크를 미리 열어도 처리되지 않도록 버튼(POST)으로 한 번 더 받는다. */
export const actionPage = ({ title, message, button, token }) =>
  shell(
    title,
    `<p>${escapeHtml(message)}</p><form method="post" style="margin-top:18px"><input type="hidden" name="t" value="${escapeHtml(token)}">
<button class="btn btn-primary btn-block" type="submit">${escapeHtml(button)}</button></form>`,
  );
