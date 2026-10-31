import { matchService } from "../../web/src/matcher.js";
import { escapeHtml } from "./util.js";

const MAX_PER_SECTION = 10;

/** 구독자 프로필에 해당하는 오늘의 신규·변경 서비스. 둘 다 없으면 null. */
export function matchDigest(profile, todayChanges) {
  const pick = (items) => (items ?? []).filter((s) => matchService(s, profile));
  const added = pick(todayChanges.new);
  const updated = pick(todayChanges.updated);
  if (!added.length && !updated.length) return null;
  return { added, updated };
}

export function renderDigest({ added, updated }, { siteName, siteUrl, date, unsubscribeUrl }) {
  const total = added.length + updated.length;
  const subject = `[${siteName}] 내 조건에 맞는 새 소식 ${total}건 (${date})`;

  const section = (title, items) => {
    if (!items.length) return { text: "", html: "" };
    const shown = items.slice(0, MAX_PER_SECTION);
    const more = items.length - shown.length;
    const text =
      `[${title}]\n` +
      shown.map((s) => `- ${s.n} (${s.o})\n  ${siteUrl}/p/${s.id}`).join("\n") +
      (more > 0 ? `\n  …외 ${more}건` : "") +
      "\n\n";
    const html =
      `<h3 style="margin:18px 0 6px">${escapeHtml(title)}</h3><ul style="padding-left:18px">` +
      shown
        .map(
          (s) =>
            `<li style="margin:6px 0"><a href="${escapeHtml(siteUrl)}/p/${escapeHtml(s.id)}">${escapeHtml(s.n)}</a>` +
            ` <span style="color:#6b7686;font-size:13px">${escapeHtml(s.o)}</span></li>`,
        )
        .join("") +
      (more > 0 ? `<li style="color:#6b7686">…외 ${more}건</li>` : "") +
      "</ul>";
    return { text, html };
  };

  const a = section("새로 등록된 지원", added);
  const u = section("내용이 바뀐 지원", updated);
  const note = "입력하신 조건에 해당할 가능성이 있는 서비스를 추린 것이며 자격을 확정하지 않습니다. 신청 전 공식 페이지에서 확인하세요.";

  const text = `${a.text}${u.text}${note}\n\n수신거부: ${unsubscribeUrl}\n`;
  const html = `<div style="font-family:-apple-system,'Noto Sans KR',sans-serif;line-height:1.6;max-width:560px">
<p>${escapeHtml(date)} 기준, 설정하신 조건에 맞는 소식입니다.</p>${a.html}${u.html}
<p style="color:#6b7686;font-size:12px;margin-top:24px">${escapeHtml(note)}</p>
<p style="color:#6b7686;font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}">수신거부</a> · 수신거부하면 이메일과 입력 조건이 즉시 삭제됩니다.</p></div>`;
  return { subject, text, html };
}
