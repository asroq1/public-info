import { useEffect, useMemo, useState } from "react";
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

function loadSavedProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...emptyProfile(), ...saved, q: "" } : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

function Chips({ options, selected, onToggle }) {
  return (
    <div className="chips">
      {Object.entries(options).map(([code, label]) => (
        <button
          key={code}
          type="button"
          className={selected.includes(code) ? "chip on" : "chip"}
          onClick={() => onToggle(code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(loadSavedProfile);
  const [shown, setShown] = useState(PAGE_SIZE);

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...profile, q: "" }));
    } catch {
      /* 저장 불가 환경에서는 무시 */
    }
    setShown(PAGE_SIZE);
  }, [profile]);

  const results = useMemo(
    () => (data ? findServices(data.services, profile) : []),
    [data, profile],
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

  return (
    <main className="wrap">
      <h1>내 혜택 찾기</h1>
      <p className="sub">
        내 정보를 입력하면 받을 수 있는 정부·지자체 지원 후보를 추려 드립니다. 입력한 정보는 이 기기에서만
        사용되며 서버로 전송되지 않습니다.
      </p>

      {error && <p className="notice">{error}</p>}

      <section className="panel">
        <label>
          나이
          <input
            type="number"
            min="0"
            max="120"
            value={profile.age ?? ""}
            onChange={(e) => set({ age: num(e.target.value) })}
          />
        </label>
        <label>
          성별
          <select value={profile.sex ?? ""} onChange={(e) => set({ sex: e.target.value || null })}>
            <option value="">선택 안 함</option>
            <option value="M">남성</option>
            <option value="F">여성</option>
          </select>
        </label>
        <label>
          소득 (중위소득 기준)
          <select value={profile.income ?? ""} onChange={(e) => set({ income: num(e.target.value) })}>
            <option value="">모름 / 선택 안 함</option>
            {Object.entries(INCOME_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          지역
          <select value={profile.region} onChange={(e) => set({ region: e.target.value })}>
            <option value="">전국</option>
            {Object.keys(REGION_NAMES).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </section>

      <h3 className="group">나의 상황</h3>
      <Chips options={PERSON_TRAITS} selected={profile.persons} onToggle={toggle("persons")} />
      <h3 className="group">가구 상황</h3>
      <Chips options={HOUSEHOLD_TRAITS} selected={profile.households} onToggle={toggle("households")} />

      <section className="panel">
        <label>
          분야
          <select value={profile.field} onChange={(e) => set({ field: e.target.value })}>
            <option value="">전체</option>
            {fields.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="grow">
          검색
          <input value={profile.q} onChange={(e) => set({ q: e.target.value })} placeholder="월세, 출산, 대출…" />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={profile.business}
            onChange={(e) => set({ business: e.target.checked })}
          />
          사업자·기관 지원도 보기
        </label>
      </section>

      <p className="count">
        {data ? `${results.length.toLocaleString()}건` : error ? "" : "불러오는 중…"}
        {data && <span className="muted"> · 데이터 기준 {data.meta.updated}</span>}
      </p>

      <ul className="list">
        {results.slice(0, shown).map((s) => (
          <li key={s.id} className="card">
            <div className="tags">
              {s.f && <span>{s.f}</span>}
              {s.o && <span>{s.o}</span>}
              {s.uncertain && <span className="warn">조건 정보 없음 · 직접 확인</span>}
            </div>
            <h2><a className="plain" href={`/p/${s.id}`}>{s.n}</a></h2>
            {s.t && <p><b>대상</b> {s.t}</p>}
            {s.d && <p><b>기한</b> {s.d}</p>}
            <a href={s.u} target="_blank" rel="noreferrer">공식 페이지에서 확인 →</a>
          </li>
        ))}
      </ul>

      {results.length > shown && (
        <button className="more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          더 보기
        </button>
      )}

      <footer>
        출처: 행정안전부 공공서비스(혜택) 정보. 이 결과는 입력하신 조건에 해당할 가능성이 있는 서비스를 추린
        것이며 자격을 확정하지 않습니다. 최종 자격과 신청은 반드시 공식 사이트에서 확인하세요.
      </footer>
    </main>
  );
}
