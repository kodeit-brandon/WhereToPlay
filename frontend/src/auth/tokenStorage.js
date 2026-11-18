/**
 * JWT 토큰 / 사용자 정보 저장소 (localStorage)
 *
 * - 시크릿 모드나 저장소 차단 환경에서 localStorage 접근이 예외를 던질 수 있어 모두 try/catch 처리
 * - 만료된 토큰은 읽는 시점에 바로 지워서 쓰지 않는다
 * - 비밀번호 등 민감 정보는 절대 저장하지 않는다 (토큰 + 공개 프로필만)
 */
const TOKEN_KEY = 'wtp.token';
const USER_KEY = 'wtp.user';

function decodePayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  const payload = decodePayload(token);
  if (!payload) return true;
  if (!payload.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

export function getToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    if (isTokenExpired(token)) {
      clearAuth();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // 저장이 막힌 환경이면 이번 세션 동안만 메모리(AuthContext)에서 유지된다
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // 무시
  }
}
