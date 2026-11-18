import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

/** 서버 에러 응답에서 사용자에게 보여줄 메시지를 꺼낸다 */
export function errorMessage(err, fallback = '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.') {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.request && !err?.response) return '서버에 연결할 수 없어요. 백엔드 서버가 켜져 있는지 확인해 주세요.';
  return fallback;
}

export async function loginRequest({ email, password }) {
  const res = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
  return res.data; // { token, user }
}

export async function registerRequest({ email, password, nickname, phone }) {
  const res = await axios.post(`${API_BASE}/api/auth/register`, { email, password, nickname, phone });
  return res.data; // { token, user }
}

export async function fetchMe(token) {
  const res = await axios.get(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.user;
}
