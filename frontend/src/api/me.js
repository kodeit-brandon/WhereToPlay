import axios from 'axios';
import { getToken } from '../auth/tokenStorage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';
const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

/** 닉네임·한 줄 소개 수정 → { message, user, token } */
export async function updateProfile({ nickname, bio }) {
  const res = await axios.put(`${API_BASE}/api/users/me`, { nickname, bio }, auth());
  return res.data;
}

/** 비밀번호 변경 (현재 비밀번호 확인) → { message } */
export async function changePassword({ currentPassword, newPassword }) {
  const res = await axios.put(
    `${API_BASE}/api/users/me/password`,
    { current_password: currentPassword, new_password: newPassword },
    auth()
  );
  return res.data;
}

/** 내가 참석 투표한 예정 일정 (날짜 오름차순) */
export async function fetchMySchedules() {
  const res = await axios.get(`${API_BASE}/api/users/me/schedules`, auth());
  return Array.isArray(res.data?.schedules) ? res.data.schedules : [];
}
