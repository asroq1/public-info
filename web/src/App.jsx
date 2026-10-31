import { useEffect, useMemo, useState } from "react";
import Subscribe from "./Subscribe.jsx";
import {
  HOUSEHOLD_TRAITS,
  INCOME_LABELS,
  PERSON_TRAITS,
  REGION_NAMES,
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
    return saved ? { ...emptyProfile(), ...saved, q: "" } : null;
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

function summarize(p) {
  const parts = [];
  if (p.age != null) parts.push(`${p.age}세`);
  if (p.sex) parts.push(p.sex === "M" ? "남성" : "여성");
  if (p.region) parts.push(p.region);
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

  const results = useMemo(() => (data ? findServices(data.services, profile) : []), [data, profile]);
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
  const reset = () => setProfile(emptyProfile());
  const loading = !data && !error;

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href="/">
            <span className="logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.2 4.2L19 7" />
              </svg>
            </span>
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
                  <span className="label">나이</span>
                  <span className="input-suffix">
                    <input className="input" type="number" inputMode="numeric" min="0" max="120" placeholder="예: 30"
                      value={profile.age ?? ""} onChange={(e) => set({ age: num(e.target.value) })} />
                    <span>세</span>
                  </span>
                </label>
                <label className="field">
                  <span className="label">지역</span>
                  <select className="select" value={profile.region} onChange={(e) => set({ region: e.target.value })}>
                    <option value="">전국</option>
                    {Object.keys(REGION_NAMES).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
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
                <label className="field full">
                  <span className="label">소득 수준 (기준 중위소득)</span>
                  <select className="select" value={profile.income ?? ""} onChange={(e) => set({ income: num(e.target.value) })}>
                    <option value="">모름 / 선택 안 함</option>
                    {Object.entries(INCOME_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
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
                <input className="input" aria-label="지원 검색" value={profile.q} onChange={(e) => set({ q: e.target.value })} placeholder="월세, 출산, 대출 등으로 검색" />
              </label>
              <select className="select" aria-label="분야" value={profile.field} onChange={(e) => set({ field: e.target.value })}>
                <option value="">전체 분야</option>
                {fields.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>

            <div className="results-head">
              <h2>
                {loading ? "불러오는 중…" : <>내 조건에 맞는 지원 <b>{results.length.toLocaleString()}건</b></>}
              </h2>
              {data && <span className="muted">데이터 기준 {data.meta.updated}</span>}
            </div>

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
                <li key={s.id} className="card result">
                  <div className="badges">
                    {recentIds.has(s.id) && <span className="badge badge-ok">신규</span>}
                    {s.f && <span className="badge badge-brand">{s.f}</span>}
                    {s.o && <span className="badge">{s.o}</span>}
                    {s.uncertain && <span className="badge badge-warn">조건 정보 없음 · 직접 확인</span>}
                    {s.ageCheck && <span className="badge badge-warn">나이 조건 확인 필요</span>}
                  </div>
                  <h3><a href={`/p/${s.id}`}>{s.n}</a></h3>
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
