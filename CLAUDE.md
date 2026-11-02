# 내 혜택 찾기 — 작업 안내

보조금24(행정안전부 공공서비스) 데이터를 받아 나이·소득·지역·상황에 맞는 지원 후보를 보여주는 정적 사이트. 사이트: https://public-info-224.pages.dev

## 구조
- `pipeline/` Python. API 수집 → 검증 → `web/public/data/index.json` 과 정책별 정적 HTML 생성. 해석기는 `pipeline/app/` (conditions, deadline, detail, regions, changes, contact)
- `web/` React + Vite. 인덱스를 받아 **브라우저에서** 매칭(`src/matcher.js`). 서버 없음
- `functions/` Cloudflare Pages Functions(이메일 알림 API). D1·메일 설정 전에는 꺼져 있음(`/api/status` enabled:false)
- `docs/ROADMAP.md` 개선 방안과 진행 상황, `PLAN.md` 초기 설계, `README.md` 실행·배포

## 자주 쓰는 명령
```bash
cd pipeline && .venv/bin/python -m pytest -q          # 파이프라인 테스트
cd pipeline && .venv/bin/python build_index.py        # 실데이터 수집 (pipeline/.env 의 GOV24_SERVICE_KEY 필요)
cd pipeline && SITE_URL=https://public-info-224.pages.dev .venv/bin/python build_pages.py
cd web && npm test && npm run build                   # 웹 테스트·빌드 (실데이터가 있으면 실데이터 검증도 돈다)
```
`main` 에 푸시하면 GitHub Actions 가 수집·검증·테스트·빌드·Cloudflare 배포까지 한다(매일 새벽에도 실행). 푸시 전에 두 테스트 묶음이 모두 통과해야 한다.

## 반드시 지킬 원칙
1. **정확성이 먼저다.** 공공데이터에 없는 것을 지어내지 않는다. 읽어 내기 애매한 값(날짜·금액·지역)은 뽑지 않거나 원문을 그대로 보여준다. 잘못 숨기는 것이 잘못 보여주는 것보다 나쁘다.
2. **판정이 아니라 후보 추림이다.** 자격을 확정하는 문구를 쓰지 않고, 공식 페이지 링크를 유지한다.
3. 해석 로직을 바꾸면 **실데이터 불변식 테스트**를 함께 추가한다(`web/src/matcher.test.js` 의 실데이터 블록 참고). 임의로 정한 기준값보다 "개수가 정확히 같다/거짓이 없다" 같은 검증을 쓴다.
4. 사용자에게 보이는 문구는 한국어, **이모지와 화살표 기호(→ ↗ 등)를 쓰지 않는다**(아이콘은 선형 SVG). 기본 화면은 항상 라이트이고 다크는 헤더 버튼으로만 켠다.
5. 개인정보 최소 수집: 알림용 서버 저장은 이메일과 소득 구간·성별·지역·상황뿐이다. 나이·출생연도·가구원 수·월 소득은 저장하지 않는다.
6. 비밀 값(API 키·토큰)은 채팅·코드·로그에 쓰지 않는다. `pipeline/.env` 와 GitHub Secrets 에만 둔다. 시크릿 쓰기와 계정 생성은 사용자가 직접 한다.

## 알아둘 함정
- 공공데이터의 나이 조건 코드는 실제와 다른 경우가 있어 **제외 기준이 아니라 "나이 조건 확인 필요" 배지**로만 쓴다.
- 신청기한은 연도가 있는 확실한 날짜만 마감 판단에 쓰고, 매년·연중·상시 등 반복 표현은 숨기지 않는다(`pipeline/app/deadline.py`).
- 행정구역은 바뀐다(광주광역시+전라남도 → 전남광주통합특별시). 지역 목록은 데이터에서 만들고 코드에 시·도 목록을 박지 않는다.
- Cloudflare Pages 는 `/p/ID.html` 을 `/p/ID` 로 리다이렉트한다. canonical·사이트맵·링크는 확장자 없는 주소를 쓴다(로컬 `npm run dev` 에서는 `.html` 로 연다).
- 카드의 **금액 칩은 틀리면 거짓 정보**다(`pipeline/app/summary.py`). 같은 문장에 지원·지급 표현이 있고, 비용·소득·재산·급지·N인 가구 기준·차등 같은 한정 표현이 없고, 서로 다른 금액이 딱 하나일 때만 원문 그대로 발췌한다. 규칙을 넓히기 전에 실데이터에서 오탐을 직접 찾아본다.
- 웹과 Functions 가 함께 쓰는 `web/src/matcher.js` 는 JSON 파일을 import 하지 않는다(Functions 번들러 호환). 필요한 값은 파이프라인이 인덱스에 담는다.
- **매년 갱신**: `web/src/income.js` 의 기준 중위소득 표(보건복지부, 매년 8월 1일까지 공표).
- 분야 아이콘·색·공유 이미지 파일명은 `web/src/fieldIcons.json` 한 곳에서 정의. 바꾸면 `scripts/make_og.py` 로 공유 이미지를 다시 만든다.

- 공공데이터는 여러 값을 `||` 로 이어 붙인다(`전화문의`, `신청방법`, `지원유형`, `사용자구분`). 화면에는 `||` 를 그대로 내지 않는다(`build_pages.items`, `app/contact.py`). 전화 걸기 링크는 번호로 확실히 읽히는 것만 만들고, 자리표시 값(`000-0000`)은 보이지 않게 한다.

## 오류 신고
정책 페이지와 카드의 "정보가 다른가요?" 는 GitHub 이슈 양식(`.github/ISSUE_TEMPLATE/data-report.yml`, 라벨 `data-report`)을 정책 정보로 미리 채워 연다.
신고는 공개되므로 양식에 개인정보 금지 안내가 있다. 신고가 들어오면 `gh issue list -R asroq1/public-info -l data-report` 로 확인하고, 원인이 해석 규칙이면 실데이터 테스트와 함께 고친다.

## 개발 도구 (`.mcp.json`, 버전 고정)
- **context7**: React·Vite·Vitest·FastAPI·Jinja2·Cloudflare Pages Functions 등 라이브러리 API 를 쓸 때 최신 문서를 확인한다. 기억에 의존해 API 를 추측하지 않는다.
- **playwright**: 화면을 직접 열어 확인한다. 접근은 `localhost` 와 배포 사이트로 제한돼 있고(`--allowed-origins`), 프로필은 메모리에만 둔다. 다른 사이트가 필요하면 `.mcp.json` 의 허용 주소를 사용자 확인 후 늘린다.
- 버전을 올릴 때는 `npm view <패키지> version` 으로 게시자·변경 내용을 확인하고 고정 버전을 직접 바꾼다(`@latest` 금지).
- **impeccable** (디자인 스킬, `pbakaus/impeccable` 4.8.0, 엔진 0.1.18): `.claude/skills/impeccable` 에 설치(깃에서 제외, 엔진 바이너리 19MB). **자동 훅 없이** 설치했고 **통계 전송은 꺼 둠**(`~/.impeccable/config.json` 의 `"telemetry": false`). 새로 받을 때: `npx impeccable@4.8.0 install -y --providers=claude --scope=project --no-hooks` 후 `impeccable telemetry off`. 업데이트는 변경 내용을 읽고 고정 버전을 바꾼다.
  - 새 세션에서 `/impeccable init`(제품 맥락) → `/impeccable critique`·`audit`·`polish` 로 쓴다. 화면 검사만 할 때: `.claude/skills/impeccable/scripts/impeccable detect <주소>`(배포 사이트·로컬 주소만).
  - 제안이 이 문서의 디자인 원칙(흰 바탕, 파란 포인트, 이모지·화살표 없음, 기본 라이트)과 부딪히면 이 문서가 우선이다. 한글 시스템 폰트·외부 폰트 없음 원칙도 유지.
