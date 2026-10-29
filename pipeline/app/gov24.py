"""행정안전부 '대한민국 공공서비스(혜택) 정보' (보조금24) API 클라이언트."""
import httpx

from .config import BASE_URL, SERVICE_KEY

PER_PAGE = 1000


def fetch_all(operation: str) -> list[dict]:
    """한 오퍼레이션의 전체 행을 페이지 순회로 수집한다. 중간에 실패하면 예외를 그대로 올린다."""
    if not SERVICE_KEY:
        raise RuntimeError("GOV24_SERVICE_KEY 가 설정되지 않았습니다 (.env 확인)")
    rows: list[dict] = []
    page = 1
    with httpx.Client(timeout=60) as client:
        while True:
            resp = client.get(
                f"{BASE_URL}/{operation}",
                params={
                    "serviceKey": SERVICE_KEY,
                    "page": page,
                    "perPage": PER_PAGE,
                    "returnType": "JSON",
                },
            )
            resp.raise_for_status()
            body = resp.json()
            batch = body.get("data", [])
            rows.extend(batch)
            if not batch or len(rows) >= body.get("totalCount", 0):
                return rows
            page += 1
