# 내 혜택 찾기

보조금24(행정안전부 공공서비스 API) 데이터를 받아 나이·성별·소득·상황·지역별로 걸러 보여주는 정적 웹앱.
전체 계획은 [PLAN.md](PLAN.md) 참고.

## 실행

```bash
# 1) 데이터 수집 (pipeline/.env 에 GOV24_SERVICE_KEY 필요)
cd pipeline
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python build_index.py     # web/public/data/index.json 생성
.venv/bin/python -m pytest -q

# 2) 웹
cd ../web
npm install
npm run dev                          # http://localhost:5173
npm test
```

## 구조
- `pipeline/` Python. API 수집 → 검증 게이트 → 정적 인덱스 생성
- `web/` React + Vite. 인덱스를 받아 브라우저에서 매칭 (서버 없음)

## SEO 페이지 생성
```bash
cd pipeline
SITE_URL=https://내도메인 .venv/bin/python build_pages.py   # web/public/p, f, sitemap.xml, robots.txt
```
`SITE_URL` 이 없으면 canonical 과 sitemap 을 만들지 않는다. 생성물은 git 에 올리지 않고 배포 때마다 새로 만든다.

## 배포 (GitHub Actions → Cloudflare)
`.github/workflows/deploy.yml` 이 매일 06:00 KST 에 수집·검증·빌드·배포한다. 저장소에 아래를 등록해야 동작한다.
- Secrets: `GOV24_SERVICE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Variables: `SITE_URL`, `CF_PROJECT_NAME`

## 이메일 알림 켜기
코드는 배포돼 있지만 아래 설정을 마치기 전에는 `/api/status` 가 `enabled:false` 를 돌려주고 구독 폼이 숨겨진다.

1. **D1 만들기**: `npx wrangler d1 create benefit-alerts` (스키마는 첫 요청 때 자동 생성)
2. **Cloudflare Pages 프로젝트 → Settings → Bindings** 에 D1 바인딩 추가: 변수명 `DB`
3. **Pages → Settings → Variables and Secrets** (Production):
   - `RESEND_API_KEY` (Secret), `FROM_EMAIL` (예: `내 혜택 찾기 <noreply@도메인>`)
   - `DIGEST_TOKEN` (Secret, 임의의 긴 문자열)
   - 선택: `SITE_URL`, `TURNSTILE_SECRET`(Secret)·`TURNSTILE_SITE_KEY`, `MAX_SIGNUPS_PER_DAY`(기본 50)
4. **GitHub Secrets** 에 같은 값의 `DIGEST_TOKEN` 등록 → 매일 배포 직후 발송 단계가 실행된다.
5. Resend 에서 발송 도메인(SPF/DKIM)을 인증한다. 인증 전에는 본인 계정 주소로만 보낼 수 있다.

로컬 시험: `npx wrangler pages dev web/dist --d1=DB --binding FROM_EMAIL=x@x.kr --binding ALLOW_DRY_RUN=1 --binding DIGEST_TOKEN=t`
(`ALLOW_DRY_RUN` 은 메일을 보내지 않고 로그로만 남긴다. 운영에는 설정하지 않는다.)

## 매년 갱신할 것: 기준 중위소득 표
`web/src/income.js` 의 `MEDIAN_INCOME` 은 보건복지부가 매년 8월 1일까지 공표하는 기준 중위소득(월, 원)이다.
다음 해 값이 공표되면 연도 한 줄을 추가한다(출처: https://www.mohw.go.kr/menu.es?mid=a10708010900).
표에 없는 연도는 가장 최근 연도 값을 쓰므로, 갱신을 놓치면 소득 구간이 낮게 계산된다.
