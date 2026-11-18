import { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

/**
 * 종목 목록 저장소 — GET /api/sports (활성 종목, 노출 순서대로)
 * - 앱 전체에서 한 번만 불러와 공유하고, 관리자가 종목을 바꾸면 refreshSports() 로 다시 불러온다.
 * - 서버에 연결할 수 없거나 응답이 비정상이면 기본 종목(DB 초기 데이터와 동일)으로 대신 보여준다.
 */
export const DEFAULT_SPORTS = [
  { name: '배드민턴', icon: '🏸' },
  { name: '풋살', icon: '⚽' },
  { name: '축구', icon: '⚽' },
  { name: '농구', icon: '🏀' },
  { name: '테니스', icon: '🎾' },
  { name: '배구', icon: '🏐' },
  { name: '야구', icon: '⚾' },
  { name: '탁구', icon: '🏓' },
  { name: '달리기', icon: '🏃' },
  { name: '클라이밍', icon: '🧗' },
  { name: '기타', icon: '🎲' },
];

let cache = null;
let inflight = null;
const listeners = new Set();
// 비활성화돼서 공개 목록에서 빠진 종목도 아이콘은 계속 보여주기 위해 한 번 본 아이콘은 기억해 둔다
const knownIcons = new Map(DEFAULT_SPORTS.map((s) => [s.name, s.icon]));

const isValid = (data) =>
  Array.isArray(data) && data.length > 0 && data.every((s) => s && typeof s.name === 'string' && typeof s.icon === 'string');

export function loadSports({ force = false } = {}) {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = axios
    .get(`${API_BASE}/api/sports`)
    .then((res) => {
      cache = isValid(res.data) ? res.data : cache || DEFAULT_SPORTS;
    })
    .catch(() => {
      cache = cache || DEFAULT_SPORTS;
    })
    .then(() => {
      cache.forEach((s) => knownIcons.set(s.name, s.icon));
      inflight = null;
      listeners.forEach((fn) => fn(cache));
      return cache;
    });
  return inflight;
}

export const refreshSports = () => loadSports({ force: true });

/** 활성 종목 목록 [{ name, icon, ... }] — 처음엔 기본 목록, 불러오면 서버 목록으로 바뀐다 */
export function useSports() {
  const [list, setList] = useState(cache || DEFAULT_SPORTS);
  useEffect(() => {
    listeners.add(setList);
    if (cache) setList(cache);
    else loadSports();
    return () => listeners.delete(setList);
  }, []);
  return list;
}

/** 종목명 → 이모지 (모르는 종목은 🏃) */
export function sportEmoji(name) {
  return knownIcons.get(name) || '🏃';
}

/** 테스트용: 저장소 초기화 */
export function resetSportsCache() {
  cache = null;
  inflight = null;
  knownIcons.clear();
  DEFAULT_SPORTS.forEach((s) => knownIcons.set(s.name, s.icon));
}
