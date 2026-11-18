import axios from 'axios';
import { getToken } from '../auth/tokenStorage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

/**
 * 승인된 장소 + 장소별 동호회 목록 검색
 * sport: 종목(없으면 전체), q: 장소명·주소·동호회명 검색어
 * 로그인 상태면 토큰을 보내 각 동호회의 내 가입 상태(my_status)도 받는다.
 */
export async function searchVenues({ sport, q } = {}) {
  const params = new URLSearchParams();
  if (sport) params.set('sport', sport);
  if (q) params.set('q', q);
  const token = getToken();
  const qs = params.toString();
  const res = await axios.get(`${API_BASE}/api/venues${qs ? `?${qs}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.data;
}
