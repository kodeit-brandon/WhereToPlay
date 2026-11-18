import axios from 'axios';
import { getToken } from '../auth/tokenStorage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

/** 동호회 단체방 이전 대화. before(메시지 id)를 주면 그보다 이전 기록 → { room_id, club, messages, has_more } */
export async function fetchChatMessages(clubId, { before, limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', String(before));
  const res = await axios.get(`${API_BASE}/api/clubs/${clubId}/chat/messages?${params}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.data;
}
