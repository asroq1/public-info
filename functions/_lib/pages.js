import { escapeHtml } from "./util.js";

const shell = (title, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title><link rel="stylesheet" href="/page.css"></head>
<body><main class="doc"><h1>${escapeHtml(title)}</h1>${body}<p><a href="/">내 혜택 찾기로 돌아가기</a></p></main></body></html>`;

export const messagePage = (title, message) => shell(title, `<p>${escapeHtml(message)}</p>`);

/** 메일 보안 스캐너가 링크를 미리 열어도 처리되지 않도록 버튼(POST)으로 한 번 더 받는다. */
export const actionPage = ({ title, message, button, token }) =>
  shell(
    title,
    `<p>${escapeHtml(message)}</p><form method="post"><input type="hidden" name="t" value="${escapeHtml(token)}">
<button class="cta" type="submit" style="border:0;cursor:pointer;font-size:16px">${escapeHtml(button)}</button></form>`,
  );
