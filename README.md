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
