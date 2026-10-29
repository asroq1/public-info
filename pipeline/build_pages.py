"""build/full.json 으로 정책별·분야별 정적 HTML, sitemap.xml, robots.txt 를 만든다.

    SITE_URL=https://example.kr python build_pages.py

SITE_URL 이 없으면 canonical 과 sitemap 을 만들지 않는다(로컬 확인용).
"""
import json
import os
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent
FULL_PATH = ROOT / "build" / "full.json"
PUBLIC = ROOT.parent / "web" / "public"
SITE_URL = os.getenv("SITE_URL", "").rstrip("/")

SECTIONS = [
    ("지원대상", "지원대상"),
    ("선정기준", "선정기준"),
    ("지원내용", "지원내용"),
    ("신청방법", "신청방법"),
    ("신청기한", "신청기한"),
]
FIELD_PAGE_LIMIT = 200
RELATED_COUNT = 5

env = Environment(
    loader=FileSystemLoader(ROOT / "templates"),
    autoescape=select_autoescape(["html", "j2"]),
)


def paragraphs(text: str) -> list[str]:
    """원문 줄바꿈을 문단으로 나눈다. 내용은 가공하지 않는다."""
    return [line.strip() for line in text.replace("\r", "").split("\n") if line.strip()]


env.globals["paragraphs"] = paragraphs


def clip(text: str, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def to_date(stamp: str | None) -> str | None:
    """'20260430093900' -> '2026-04-30'"""
    try:
        return datetime.strptime((stamp or "")[:8], "%Y%m%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def jsonld(s: dict, url: str | None) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "GovernmentService",
        "name": s["서비스명"],
        "description": clip(s.get("서비스목적요약") or s.get("지원내용") or "", 300),
        "serviceType": s.get("서비스분야"),
        "provider": {"@type": "GovernmentOrganization", "name": s.get("소관기관명")},
    }
    if url:
        data["url"] = url
    # </script> 로 끊기지 않도록 < 를 이스케이프
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def related_for(s: dict, by_org: dict, by_field: dict, pos: dict) -> list[dict]:
    """같은 기관 3건 + 같은 분야 2건. 위치를 기준으로 골라 페이지마다 다양하게 연결한다."""
    out, seen = [], {s["서비스ID"]}

    def take(group: list[dict], key: str, n: int) -> None:
        if len(group) < 2:
            return
        start = pos[s["서비스ID"]][key]
        got = 0
        for step in range(1, len(group)):
            cand = group[(start + step) % len(group)]
            if cand["서비스ID"] not in seen:
                out.append(cand)
                seen.add(cand["서비스ID"])
                got += 1
                if got == n:
                    return

    take(by_org[s["소관기관명"]], "org", 3)
    take(by_field[s["서비스분야"]], "field", RELATED_COUNT - len(out))
    return out


def render_policy(s: dict, related: list[dict], field_urls: dict, updated: str) -> str:
    url = f"{SITE_URL}/p/{s['서비스ID']}.html" if SITE_URL else None
    org = s.get("소관기관명") or ""
    return env.get_template("policy.html.j2").render(
        s=s,
        title=f"{s['서비스명']} 지원대상·신청방법 | 내 혜택 찾기",
        description=clip(
            f"{org} {s['서비스명']}. {s.get('서비스목적요약') or s.get('지원대상') or ''}", 150
        ),
        canonical=url,
        jsonld=jsonld(s, url),
        sections=SECTIONS,
        related=related,
        field_url=field_urls.get(s.get("서비스분야"), "/"),
        updated=updated,
    )


def render_field(field: str, items: list[dict], total: int, num: int, updated: str) -> str:
    return env.get_template("field.html.j2").render(
        field=field,
        items=items,
        total=total,
        updated=updated,
        title=f"{field} 정부·지자체 지원 서비스 {total}건 | 내 혜택 찾기",
        description=f"{field} 분야 정부·지자체 지원 서비스 모음. 인기 순으로 대상과 신청방법을 확인하세요.",
        canonical=f"{SITE_URL}/f/{num}.html" if SITE_URL else None,
    )


def sitemap(entries: list[tuple[str, str | None]]) -> str:
    rows = []
    for loc, lastmod in entries:
        tag = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
        rows.append(f"<url><loc>{loc}</loc>{tag}</url>")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(rows)
        + "\n</urlset>\n"
    )


def main() -> None:
    services = json.loads(FULL_PATH.read_text(encoding="utf-8"))
    meta = json.loads((PUBLIC / "data" / "index.json").read_text(encoding="utf-8"))["meta"]
    updated = meta["updated"].split(" ")[0]

    services = [s for s in services if s.get("서비스ID") and s.get("서비스명") and s.get("상세조회URL")]
    for s in services:
        s["서비스분야"] = s.get("서비스분야") or "기타"
        s["소관기관명"] = s.get("소관기관명") or "기관 미상"
    services.sort(key=lambda s: -int(s.get("조회수") or 0))

    by_org, by_field = defaultdict(list), defaultdict(list)
    for s in services:
        by_org[s["소관기관명"]].append(s)
        by_field[s["서비스분야"]].append(s)
    pos = {s["서비스ID"]: {} for s in services}
    for group, key in ((by_org, "org"), (by_field, "field")):
        for items in group.values():
            for i, s in enumerate(items):
                pos[s["서비스ID"]][key] = i

    fields = sorted(by_field)
    field_urls = {f: f"/f/{i + 1}.html" for i, f in enumerate(fields)}

    for sub in ("p", "f"):
        shutil.rmtree(PUBLIC / sub, ignore_errors=True)
        (PUBLIC / sub).mkdir(parents=True)

    entries: list[tuple[str, str | None]] = []
    for s in services:
        html = render_policy(s, related_for(s, by_org, by_field, pos), field_urls, updated)
        (PUBLIC / "p" / f"{s['서비스ID']}.html").write_text(html, encoding="utf-8")
        entries.append((f"{SITE_URL}/p/{s['서비스ID']}.html", to_date(s.get("수정일시"))))

    for i, f in enumerate(fields, start=1):
        items = by_field[f][:FIELD_PAGE_LIMIT]
        html = render_field(f, items, len(by_field[f]), i, updated)
        (PUBLIC / "f" / f"{i}.html").write_text(html, encoding="utf-8")
        entries.append((f"{SITE_URL}/f/{i}.html", updated))

    if SITE_URL:
        entries.insert(0, (f"{SITE_URL}/", updated))
        (PUBLIC / "sitemap.xml").write_text(sitemap(entries), encoding="utf-8")
        robots = f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n"
    else:
        print("경고: SITE_URL 이 없어 sitemap.xml 과 canonical 을 만들지 않았습니다.")
        robots = "User-agent: *\nAllow: /\n"
    (PUBLIC / "robots.txt").write_text(robots, encoding="utf-8")
    print(f"완료: 정책 {len(services)}개, 분야 {len(fields)}개 페이지")


if __name__ == "__main__":
    main()
