"""전날 대비 신규·변경·삭제 서비스를 찾는다.

- 신규: 이전 목록에 없던 서비스ID
- 변경: 본문(대상·기준·내용·방법·기한·이름) 해시가 달라진 서비스. 수정일시는 하루에도 수천 건이
  바뀌는 노이즈라 쓰지 않는다.
- 최근 등록: 공공데이터의 등록일시가 최근 N일 이내인 서비스(첫 실행에도 채워진다)
"""
import hashlib
from datetime import datetime, timedelta

HASH_FIELDS = ("서비스명", "지원대상", "선정기준", "지원내용", "신청방법", "신청기한")
HISTORY_DAYS = 30
BULK_CHANGE_RATIO = 0.30  # 이 비율 넘게 한꺼번에 바뀌면 해시 방식 변경 등 비정상으로 본다
RECENT_LIMIT = 100


def content_hash(service: dict) -> str:
    text = "\x1f".join(" ".join(str(service.get(f) or "").split()) for f in HASH_FIELDS)
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def diff(prev: dict[str, str] | None, cur: dict[str, str]) -> dict:
    """prev/cur: {서비스ID: 해시}. prev 가 None 이면 첫 실행으로 보고 비교하지 않는다."""
    if prev is None:
        return {"first_run": True, "bulk": False, "new": [], "updated": [], "removed": []}
    new = sorted(i for i in cur if i not in prev)
    removed = sorted(i for i in prev if i not in cur)
    updated = sorted(i for i in cur if i in prev and prev[i] != cur[i])
    bulk = bool(cur) and len(updated) / len(cur) > BULK_CHANGE_RATIO
    if bulk:
        updated = []
    return {"first_run": False, "bulk": bulk, "new": new, "updated": updated, "removed": removed}


def merge_history(history: list[dict], today: str, result: dict) -> list[dict]:
    """오늘 항목을 기록한다. 같은 날 재실행이면 합집합으로 합쳐 앞선 결과를 잃지 않는다."""
    entry = {k: result[k] for k in ("new", "updated", "removed")}
    out = [h for h in history if h["date"] != today]
    same_day = next((h for h in history if h["date"] == today), None)
    if same_day:
        entry = {k: sorted(set(same_day.get(k, [])) | set(entry[k])) for k in entry}
    out.append({"date": today, **entry})
    cutoff = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")
    return sorted((h for h in out if h["date"] >= cutoff), key=lambda h: h["date"], reverse=True)


def recent_registered(services: list[dict], today: str, days: int = HISTORY_DAYS) -> list[dict]:
    cutoff = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=days)).strftime("%Y%m%d")
    rows = [
        {"id": s["서비스ID"], "reg": s["등록일시"][:8]}
        for s in services
        if s.get("서비스ID") and (s.get("등록일시") or "")[:8] >= cutoff
    ]
    return sorted(rows, key=lambda r: (r["reg"], r["id"]), reverse=True)[:RECENT_LIMIT]
