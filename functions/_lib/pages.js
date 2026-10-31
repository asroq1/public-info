import { escapeHtml } from "./util.js";

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>`;

const shell = (title, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title><link rel="stylesheet" href="/page.css"></head>
<body><header class="site-header"><div class="wrap"><a class="brand" href="/"><span class="logo" aria-hidden="true">${LOGO}</span>내 혜택 찾기</a></div></header>
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
