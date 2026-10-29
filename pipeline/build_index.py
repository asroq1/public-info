"""보조금24 데이터를 받아 웹에서 쓸 정적 인덱스를 만든다.

    python build_index.py            # web/public/data/index.json + pipeline/build/full.json 생성

검증 게이트를 통과하지 못하면 비정상 종료하고 기존 파일을 덮어쓰지 않는다.
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx

from app.changes import content_hash, diff, merge_history, recent_registered
from app.conditions import parse_conditions
from app.gov24 import fetch_all

ROOT = Path(__file__).resolve().parent
INDEX_PATH = ROOT.parent / "web" / "public" / "data" / "index.json"
FULL_PATH = ROOT / "build" / "full.json"

MIN_SERVICES = 8000          # 이보다 적으면 비정상 응답으로 본다
MAX_DROP_RATIO = 0.10        # 직전 대비 10% 넘게 줄면 중단
MAX_MISSING_COND_RATIO = 0.25  # 지원조건이 없는 서비스 비율 상한
HASHES_PATH = INDEX_PATH.parent / "hashes.json"
CHANGES_PATH = INDEX_PATH.parent / "changes.json"
SITE_URL = os.getenv("SITE_URL", "").rstrip("/")
KST = timezone(timedelta(hours=9))


def clip(text: str | None, limit: int) -> str:
    text = (text or "").replace("\r", "").strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


def build() -> tuple[list[dict], list[dict]]:
    services = fetch_all("serviceList")
    conditions = {r["서비스ID"]: r for r in fetch_all("supportConditions")}

    index, full = [], []
    for s in services:
        sid = s.get("서비스ID")
        cond = parse_conditions(conditions.get(sid, {}))
        index.append({
            "id": sid,
            "n": s.get("서비스명"),
            "o": s.get("소관기관명"),
            "ot": s.get("소관기관유형"),
            "f": s.get("서비스분야"),
            "s": clip(s.get("서비스목적요약"), 120),
            "t": clip(s.get("지원대상"), 200),
            "d": clip(s.get("신청기한"), 80),
            "u": s.get("상세조회URL"),
            "v": int(s.get("조회수") or 0),
            "c": cond,
        })
        full.append({**s, "conditions": cond})
    return index, full


def validate(index: list[dict], prev_count: int | None) -> None:
    errors = []
    if len(index) < MIN_SERVICES:
        errors.append(f"서비스 수가 너무 적음: {len(index)}")
    ids = [r["id"] for r in index]
    if len(set(ids)) != len(ids):
        errors.append("서비스ID 중복")
    broken = [r["id"] for r in index if not r["id"] or not r["n"] or not r["u"]]
    if broken:
        errors.append(f"필수 필드(ID/이름/URL) 누락 {len(broken)}건: {broken[:5]}")
    no_cond = sum(1 for r in index if r["c"].get("nc"))
    if index and no_cond / len(index) > MAX_MISSING_COND_RATIO:
        errors.append(f"지원조건 없는 서비스 비율 과다: {no_cond}/{len(index)}")
    if prev_count and len(index) < prev_count * (1 - MAX_DROP_RATIO):
        errors.append(f"직전 대비 급감: {prev_count} -> {len(index)}")
    if errors:
        raise SystemExit("검증 실패, 기존 데이터를 유지합니다:\n- " + "\n- ".join(errors))


def load_previous(name: str, local: Path):
    """직전 배포본의 파일을 읽는다. 없으면(404) None. 네트워크 오류는 중단한다.

    오류를 '없음'으로 취급하면 변경 이력이 초기화되므로, 확실히 없을 때만 None 을 돌려준다.
    """
    if SITE_URL:
        try:
            resp = httpx.get(f"{SITE_URL}/data/{name}", timeout=30, follow_redirects=True)
        except httpx.HTTPError as e:
            raise SystemExit(f"직전 {name} 을 가져오지 못해 중단합니다: {e}")
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            raise SystemExit(f"직전 {name} 응답 이상: {resp.status_code}")
        try:
            return resp.json()
        except ValueError:
            return None  # SPA 가 index.html 을 돌려주는 경우(파일 없음)
    return json.loads(local.read_text(encoding="utf-8")) if local.exists() else None


def detect_changes(full: list[dict], prev_hashes: dict | None, today: str) -> tuple[dict, dict]:
    hashes = {s["서비스ID"]: content_hash(s) for s in full if s.get("서비스ID")}
    result = diff(prev_hashes, hashes)
    history = (load_previous("changes.json", CHANGES_PATH) or {}).get("history", [])
    changes = {
        "generated": today,
        "first_run": result["first_run"],
        "bulk_change": result["bulk"],
        "history": merge_history(history, today, result),
        "recent": recent_registered(full, today),
    }
    return hashes, changes


def main() -> None:
    index, full = build()
    prev_hashes = load_previous("hashes.json", HASHES_PATH)
    validate(index, len(prev_hashes) if prev_hashes else None)
    today = datetime.now(KST).strftime("%Y-%m-%d")
    hashes, changes = detect_changes(full, prev_hashes, today)
    meta = {"updated": datetime.now(KST).strftime("%Y-%m-%d %H:%M"), "count": len(index)}

    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    FULL_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(
        json.dumps({"meta": meta, "services": index}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    FULL_PATH.write_text(json.dumps(full, ensure_ascii=False), encoding="utf-8")
    HASHES_PATH.write_text(json.dumps(hashes, separators=(",", ":")), encoding="utf-8")
    CHANGES_PATH.write_text(json.dumps(changes, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    today_entry = changes["history"][0]
    print(
        f"완료: {meta['count']}건, 기준 {meta['updated']} / "
        f"신규 {len(today_entry['new'])} 변경 {len(today_entry['updated'])} 삭제 {len(today_entry['removed'])}"
        + (" (첫 실행: 비교 없음)" if changes["first_run"] else "")
        + (" (대량 변경 감지: 변경 목록 생략)" if changes["bulk_change"] else "")
    )


if __name__ == "__main__":
    sys.exit(main())
