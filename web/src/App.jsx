import { useEffect, useMemo, useState } from "react";
import Subscribe from "./Subscribe.jsx";
import FIELD_ICONS from "./fieldIcons.json";
import { MAX_HOUSEHOLD, bracketLimits, incomeBracket, incomePercent, manwon, manwonFloor, medianIncome, tableYear } from "./income.js";
import {
  HOUSEHOLD_TRAITS,
  INCOME_LABELS,
  PERSON_TRAITS,
  migrateRegion,
  orderRegions,
  regionLabel,
  REGION_SHORT,
  candidateAges,
  emptyProfile,
  findServices,
} from "./matcher.js";

const PAGE_SIZE = 20;
const STORAGE_KEY = "benefit-profile-v1";
const SEX_OPTIONS = [
  { value: null, label: "선택 안 함" },
  { value: "M", label: "남성" },
  { value: "F", label: "여성" },
];

function loadSavedProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return null;
    const p = { ...emptyProfile(), ...saved, q: "" };
    // 예전 버전은 나이를 저장했다. 출생연도로 바꿔 이어서 쓴다.
    if (p.birthYear == null && Number.isInteger(p.age)) p.birthYear = new Date().getFullYear() - p.age;
    p.age = null;
    p.region = migrateRegion(p.region);
    p.district = p.district ?? "";
    return p;
  } catch {
    return null;
  }
}

const Icon = ({ name }) => {
  const paths = {
    shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9 12l2.2 2.2L15.5 10" />,
    lock: <path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" />,
    refresh: <path d="M20 12a8 8 0 10-2.3 5.7M20 5v5h-5" />,
    search: <path d="M11 4a7 7 0 100 14 7 7 0 000-14zm9 16l-4-4" />,
    external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

function FieldThumb({ field }) {
  const icon = FIELD_ICONS[field] ?? FIELD_ICONS["기타"];
  return (
    <span className="thumb" style={{ "--h": icon.hue }} aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d={icon.d} /></svg>
    </span>
  );
}

function Chips({ options, selected, onToggle }) {
  return (
    <div className="chips">
      {Object.entries(options).map(([code, label]) => (
        <button key={code} type="button" className="chip" aria-pressed={selected.includes(code)} onClick={() => onToggle(code)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// 20261231 -> '12.31' (올해가 아니면 '2027.1.5')
function shortDate(n) {
  const y = Math.floor(n / 10000);
  const md = `${Math.floor(n / 100) % 100}.${n % 100}`;
  return y === new Date().getFullYear() ? md : `${y}.${md}`;
}

function DeadlineBadge({ deadline }) {
  if (!deadline) return null;
  if (deadline.state === "closed") return <span className="badge badge-muted">신청 기간 종료</span>;
  if (deadline.state === "upcoming") return <span className="badge badge-brand">접수 예정 {shortDate(deadline.start)}~</span>;
  if (deadline.dday <= 7) {
    return <span className="badge badge-warn">{deadline.dday === 0 ? "오늘 마감" : `마감 D-${deadline.dday}`}</span>;
  }
  return <span className="badge">{shortDate(deadline.end)}까지</span>;
}

function summarize(p) {
  const parts = [];
  if (p.birthYear) parts.push(`${p.birthYear}년생`);
  if (p.sex) parts.push(p.sex === "M" ? "남성" : "여성");
  if (p.region) parts.push(`${regionLabel(p.region)}${p.district ? ` ${p.district}` : ""}`);
  if (p.income) parts.push(INCOME_LABELS[p.income]);
  const traits = [...p.persons.map((c) => PERSON_TRAITS[c]), ...p.households.map((c) => HOUSEHOLD_TRAITS[c])].filter(Boolean);
  if (traits.length) parts.push(traits.length > 2 ? `${traits.slice(0, 2).join(", ")} 외 ${traits.length - 2}` : traits.join(", "));
  return parts.length ? parts.join(" · ") : "아직 입력한 조건이 없어요";
}

export default function App() {
  const saved = useMemo(loadSavedProfile, []);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(saved ?? emptyProfile());
  const [shown, setShown] = useState(PAGE_SIZE);
  const [recent, setRecent] = useState([]);
  // 좁은 화면에서는 저장된 조건이 있으면 접어서 결과를 먼저 보여준다
  const [formOpen, setFormOpen] = useState(!saved);
  const [birthText, setBirthText] = useState(profile.birthYear ? String(profile.birthYear) : "");
  const [incomeText, setIncomeText] = useState(profile.monthlyIncome == null ? "" : String(profile.monthlyIncome));
  const year = new Date().getFullYear();

  useEffect(() => {
    fetch("/data/index.json")
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(setData)
      .catch(() => setError("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
  }, []);

  useEffect(() => {
    // 없거나 JSON 이 아니면(파일 없음) 패널만 생략한다
    fetch("/data/changes.json")
      .then((r) => r.json())
      .then((c) => setRecent(Array.isArray(c.recent) ? c.recent : []))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...profile, q: "" }));
    } catch {
      /* 저장 불가 환경에서는 무시 */
    }
    setShown(PAGE_SIZE);
  }, [profile]);

  const recentItems = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.services.map((s) => [s.id, s]));
    return recent
      .map((r) => ({ ...byId.get(r.id), reg: r.reg }))
      .filter((s) => s.id)
      .slice(0, 5);
  }, [data, recent]);
  const recentIds = useMemo(() => new Set(recent.map((r) => r.id)), [recent]);

  // 지역·시군구 선택지는 데이터에서 온다. 데이터를 받기 전에는 알려진 시·도만 보여준다.
  const regions = useMemo(
    () => orderRegions(data?.meta?.regions ?? Object.keys(REGION_SHORT).map((name) => ({ name, districts: [] }))),
    [data],
  );
  const districts = regions.find((r) => r.name === profile.region)?.districts ?? [];

  // 저장돼 있던 지역·시군구가 지금 데이터에 없으면(행정구역 개편 등) 해당 선택을 비운다
  useEffect(() => {
    if (!data?.meta?.regions) return;
    setProfile((p) => {
      const region = regions.some((r) => r.name === p.region) ? p.region : "";
      const list = regions.find((r) => r.name === region)?.districts ?? [];
      const district = list.includes(p.district) ? p.district : "";
      return region === p.region && district === p.district ? p : { ...p, region, district };
    });
  }, [data, regions]);

  const results = useMemo(() => (data ? findServices(data.services, profile) : []), [data, profile]);
  // 신청 기간이 끝나서 숨긴 건수(같은 조건에서 마감 건을 포함했을 때와의 차이)
  const hiddenClosed = useMemo(
    () => (data && !profile.showClosed ? findServices(data.services, { ...profile, showClosed: true }).length - results.length : 0),
    [data, profile, results],
  );
  const fields = useMemo(
    () => (data ? [...new Set(data.services.map((s) => s.f).filter(Boolean))].sort() : []),
    [data],
  );

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));
  const toggle = (key) => (code) =>
    setProfile((p) => ({
      ...p,
      [key]: p[key].includes(code) ? p[key].filter((c) => c !== code) : [...p[key], code],
    }));
  const num = (v) => (v === "" ? null : Number(v));
  const reset = () => {
    setProfile(emptyProfile());
    setBirthText("");
    setIncomeText("");
  };
  const onBirth = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setBirthText(v);
    const n = Number(v);
    set({ birthYear: v.length === 4 && n >= 1900 && n <= year ? n : null });
  };
  // 가구원 수와 월 소득이 모두 있으면 소득 구간을 자동으로 고른다. 모자라면 지금 선택을 그대로 둔다.
  const onHousehold = (e) => {
    const h = e.target.value === "" ? null : Number(e.target.value);
    setProfile((p) => ({ ...p, household: h, income: incomeBracket(h, p.monthlyIncome, year) ?? p.income }));
  };
  const onMonthly = (e) => {
    const v = e.target.value.replace(/[^\d.]/g, "").slice(0, 7);
    setIncomeText(v);
    setProfile((p) => ({ ...p, monthlyIncome: v, income: incomeBracket(p.household, v, year) ?? p.income }));
  };

  const ages = candidateAges(profile, year);
  const birthHint = ages.length === 2
    ? `생일이 지났다면 만 ${ages[1]}세, 아직이면 만 ${ages[0]}세예요. 두 경우 모두 고려해서 찾아요.`
    : ages.length === 1
      ? `만 ${ages[0]}세로 계산해요.`
      : birthText.length > 0
        ? "출생연도 4자리를 입력해 주세요. 예: 1995"
        : "생일을 몰라도 돼요. 출생연도만 입력하면 만 나이를 계산해요.";

  const limits = bracketLimits(profile.household, year);
  const pct = incomePercent(profile.household, profile.monthlyIncome, year);
  const median = medianIncome(profile.household, year);
  const householdLabel = (n) => (n >= MAX_HOUSEHOLD ? `${MAX_HOUSEHOLD}인 이상` : `${n}인`);
  const incomeOptions = Object.entries(INCOME_LABELS).map(([v, label]) => {
    const i = Number(v);
    let range = "";
    if (limits) {
      range = i === 1 ? `월 ${manwonFloor(limits[0])} 이하` : i === 5 ? `월 ${manwonFloor(limits[3])} 초과` : `월 ${manwonFloor(limits[i - 2])} 초과~${manwonFloor(limits[i - 1])} 이하`;
    }
    return { v, label: range ? `${label} (${range})` : label };
  });
  const incomeHint = pct != null
    ? `${householdLabel(profile.household)} 가구 월 ${Number(profile.monthlyIncome).toLocaleString("ko-KR")}만원은 ${tableYear(year)}년 기준 중위소득(월 ${manwon(median)})의 약 ${Math.round(pct)}%예요.`
    : profile.household
      ? "월 소득(만원)을 입력하면 구간을 자동으로 골라 줘요."
      : "가구원 수와 월 소득을 입력하면 구간을 자동으로 골라 줘요.";

  const loading = !data && !error;

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href="/">
            <span className="logo" aria-hidden="true"><svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#4F8DFF"/><stop offset="1" stopColor="#1D4ED8"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><circle cx="16" cy="16.8" r="9.2" fill="#0B2A8F" opacity=".18"/><circle cx="16" cy="16" r="9.2" fill="#fff"/><path d="M11.8 16.4l3 3 5.6-6.4" fill="none" stroke="#1D4ED8" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="24.6" cy="7.4" r="2.2" fill="#FBBF24"/></svg></span>
            내 혜택 찾기
          </a>
          <div className="header-actions">
            <a className="nav-link" href="/privacy">개인정보 안내</a>
            <button className="theme-btn" type="button" data-theme-toggle aria-label="화면 모드 전환 (라이트/다크)" title="화면 모드 전환">
              <svg className="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
              <svg className="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <h1>
            내가 받을 수 있는 <em>지원금</em>,<br />한 번에 찾아보세요
          </h1>
          <p>나이·소득·지역·상황만 고르면 정부와 지자체의 지원 서비스 중 해당될 만한 것을 추려 드립니다.</p>
          <ul className="trust">
            <li><Icon name="shield" />행정안전부 공공데이터 기반</li>
            <li><Icon name="lock" />입력 정보는 이 기기 안에서만 처리</li>
            <li><Icon name="refresh" />매일 자동 업데이트</li>
          </ul>
        </div>
      </section>

      <main className="wrap">
        <div className="layout">
          <aside className={`card sidebar${formOpen ? "" : " collapsed"}`} aria-label="내 조건 입력">
            <div className="sidebar-head">
              <h2>내 조건</h2>
              <button type="button" className="link-btn" onClick={reset}>초기화</button>
            </div>
            <p className="summary">{summarize(profile)}</p>
            <button type="button" className="btn btn-block sidebar-toggle" onClick={() => setFormOpen((v) => !v)} aria-expanded={formOpen}>
              {formOpen ? "조건 접기" : "조건 바꾸기"}
            </button>

            <div className="sidebar-body">
              <div className="fields">
                <label className="field">
                  <span className="label">지역</span>
                  <select className="select" value={profile.region} onChange={(e) => set({ region: e.target.value, district: "" })}>
                    <option value="">전국</option>
                    {regions.map((r) => (
                      <option key={r.name} value={r.name}>{regionLabel(r.name)}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">시·군·구</span>
                  <select className="select" value={profile.district} disabled={!districts.length} onChange={(e) => set({ district: e.target.value })}>
                    <option value="">{!profile.region ? "지역을 먼저 선택" : districts.length ? "시·군·구 전체" : "해당 없음"}</option>
                    {districts.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                {profile.region && districts.length > 0 && (
                  <p className="hint full" aria-live="polite">
                    {profile.district
                      ? `${regionLabel(profile.region)} ${profile.district} 정책과 ${regionLabel(profile.region)} 전체·전국 정책을 보여줘요.`
                      : "시·군·구까지 고르면 내 동네 정책만 보여줘요."}
                  </p>
                )}
                <label className="field full">
                  <span className="label">출생연도</span>
                  <span className="input-suffix">
                    <input className="input" type="text" inputMode="numeric" maxLength={4} placeholder="예: 1995"
                      value={birthText} onChange={onBirth} aria-describedby="birth-hint" />
                    <span>년생</span>
                  </span>
                </label>
                <p className="hint full" id="birth-hint" aria-live="polite">{birthHint}</p>
                <div className="field full" role="radiogroup" aria-label="성별">
                  <span className="label">성별</span>
                  <div className="seg">
                    {SEX_OPTIONS.map((o) => (
                      <button key={o.label} type="button" role="radio" aria-checked={profile.sex === o.value} onClick={() => set({ sex: o.value })}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field full">
                  <span className="label">가구 소득</span>
                  <div className="income-row">
                    <select className="select" aria-label="가구원 수" value={profile.household ?? ""} onChange={onHousehold}>
                      <option value="">가구원 수</option>
                      {Array.from({ length: MAX_HOUSEHOLD }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{householdLabel(n)} 가구</option>
                      ))}
                    </select>
                    <span className="input-suffix">
                      <input className="input" type="text" inputMode="numeric" placeholder="월 소득" aria-label="월 가구 소득(만원)"
                        value={incomeText} onChange={onMonthly} />
                      <span>만원</span>
                    </span>
                  </div>
                  <select className="select" aria-label="소득 구간" value={profile.income ?? ""} onChange={(e) => set({ income: num(e.target.value) })}>
                    <option value="">소득 구간 직접 선택 (모르면 비워 두세요)</option>
                    {incomeOptions.map((o) => (
                      <option key={o.v} value={o.v}>{o.label}</option>
                    ))}
                  </select>
                  <p className="hint" aria-live="polite">{incomeHint}</p>
                  <details className="explain">
                    <summary>기준 중위소득이 뭔가요?</summary>
                    <div>
                      <p>전체 가구를 소득 순으로 세웠을 때 한가운데 가구의 월 소득이에요. 복지 지원은 "중위소득의 몇 % 이하"처럼 이 금액을 기준으로 대상을 정해요.</p>
                      <p>{tableYear(year)}년 4인 가구는 월 {manwon(medianIncome(4, year))}이라 "50% 이하"는 월 {manwonFloor(bracketLimits(4, year)[0])} 이하예요.</p>
                      <p>소득은 가구원 모두의 세전 월 소득(근로·사업소득 등)을 합친 대략의 금액이면 돼요. 실제 선정은 재산까지 소득으로 환산한 소득인정액 등으로 정해서, 여기 결과는 참고용이에요.</p>
                    </div>
                  </details>
                </div>
              </div>

              <div className="group">
                <div className="group-title">나의 상황 <small>해당되는 것을 모두 선택</small></div>
                <Chips options={PERSON_TRAITS} selected={profile.persons} onToggle={toggle("persons")} />
              </div>
              <div className="group">
                <div className="group-title">가구 상황 <small>해당되는 것을 모두 선택</small></div>
                <Chips options={HOUSEHOLD_TRAITS} selected={profile.households} onToggle={toggle("households")} />
              </div>

              <div className="divider" />
              <label className="check">
                <input type="checkbox" checked={profile.business} onChange={(e) => set({ business: e.target.checked })} />
                사업자·기관 대상 지원도 보기
              </label>
            </div>
          </aside>

          <section aria-label="검색 결과">
            {error && <p className="notice" role="alert">{error}</p>}

            {recentItems.length > 0 && (
              <div className="card panel">
                <h3><span className="badge badge-ok">NEW</span>최근 30일 새로 등록된 지원</h3>
                <ul>
                  {recentItems.map((s) => (
                    <li key={s.id}>
                      <a href={`/p/${s.id}`}>{s.n}</a>
                      <span className="muted">{s.o} · {s.reg.slice(0, 4)}.{s.reg.slice(4, 6)}.{s.reg.slice(6, 8)} 등록</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Subscribe profile={profile} />

            <div className="toolbar">
              <label className="search">
                <Icon name="search" />
                <input className="input" aria-label="지원 검색" value={profile.q} onChange={(e) => set({ q: e.target.value, field: "" })} placeholder="월세, 출산, 대출 등으로 검색" />
              </label>
              <select className="select" aria-label="분야" value={profile.field} onChange={(e) => set({ field: e.target.value })}>
                <option value="">전체 분야</option>
                {fields.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select className="select" aria-label="정렬" value={profile.sort} onChange={(e) => set({ sort: e.target.value })}>
                <option value="popular">인기순</option>
                <option value="deadline">마감 임박순</option>
              </select>
            </div>

            <div className="results-head">
              <h2>
                {loading ? "불러오는 중…" : <>내 조건에 맞는 지원 <b>{results.length.toLocaleString()}건</b></>}
              </h2>
              {data && <span className="muted">데이터 기준 {data.meta.updated}</span>}
            </div>
            {data && (hiddenClosed > 0 || profile.showClosed) && (
              <p className="closed-note" role="status">
                {profile.showClosed ? (
                  <>마감된 지원도 함께 보고 있어요. <button type="button" className="link-btn inline" onClick={() => set({ showClosed: false })}>마감 숨기기</button></>
                ) : (
                  <>신청 기간이 끝난 지원 {hiddenClosed.toLocaleString()}건은 숨겼어요. <button type="button" className="link-btn inline" onClick={() => set({ showClosed: true })}>마감된 지원도 보기</button></>
                )}
              </p>
            )}

            {loading && (
              <ul className="list" aria-hidden="true">
                <li className="skeleton" /><li className="skeleton" /><li className="skeleton" />
              </ul>
            )}

            {data && results.length === 0 && (
              <div className="card empty">
                <h3>조건에 맞는 지원을 찾지 못했어요</h3>
                <p>소득이나 상황 선택을 줄이거나 지역을 전국으로 바꿔 보세요.</p>
                <button type="button" className="btn btn-primary" onClick={reset}>조건 초기화</button>
              </div>
            )}

            <ul className="list">
              {results.slice(0, shown).map((s) => (
                <li key={s.id} className={`card result${s.deadline?.state === "closed" ? " closed" : ""}`}>
                  <div className="result-top">
                    <FieldThumb field={s.f} />
                    <div>
                      <div className="badges">
                        {recentIds.has(s.id) && <span className="badge badge-ok">신규</span>}
                        <DeadlineBadge deadline={s.deadline} />
                        {s.f && <span className="badge badge-brand">{s.f}</span>}
                        {s.o && <span className="badge">{s.o}</span>}
                        {s.uncertain && <span className="badge badge-warn">조건 정보 없음 · 직접 확인</span>}
                        {s.ageCheck && <span className="badge badge-warn">나이 조건 확인 필요</span>}
                      </div>
                      <h3><a href={`/p/${s.id}`}>{s.n}</a></h3>
                    </div>
                  </div>
                  <dl className="kv">
                    {s.t && (<><dt>대상</dt><dd>{s.t}</dd></>)}
                    {s.d && (<><dt>기한</dt><dd className="one">{s.d}</dd></>)}
                  </dl>
                  <div className="actions">
                    <a className="btn" href={`/p/${s.id}`}>자세히 보기</a>
                    <a className="btn" href={s.u} target="_blank" rel="noreferrer">공식 페이지 <Icon name="external" /></a>
                  </div>
                </li>
              ))}
            </ul>

            {results.length > shown && (
              <button type="button" className="btn btn-block more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                더 보기 ({(results.length - shown).toLocaleString()}건 남음)
              </button>
            )}
          </section>
        </div>
      </main>

      <footer className="site-footer app-footer">
        <div className="wrap">
          <p>출처: 행정안전부 공공서비스(혜택) 정보. 이 결과는 입력하신 조건에 해당할 가능성이 있는 서비스를 추린 것이며 자격을 확정하지 않습니다. 최종 자격과 신청은 반드시 공식 사이트에서 확인하세요.</p>
          <p><a href="/privacy">개인정보 처리 안내</a> · 이 서비스는 공공데이터를 안내하며 정부·지자체와 무관합니다.</p>
        </div>
      </footer>
    </>
  );
}
