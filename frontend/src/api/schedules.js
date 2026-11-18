import axios from 'axios';
import { getToken } from '../auth/tokenStorage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';
const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

/** 동호회 일정 목록. scope: 'upcoming' | 'past' → { club, my_role, can_manage, schedules } */
export async function fetchClubSchedules(clubId, scope = 'upcoming') {
  const res = await axios.get(`${API_BASE}/api/clubs/${clubId}/schedules?scope=${scope}`, auth());
  return res.data;
}

/** 일정 상세 + 참석자 명단 */
export async function fetchSchedule(scheduleId) {
  const res = await axios.get(`${API_BASE}/api/schedules/${scheduleId}`, auth());
  return res.data.schedule;
}

/** 참석 투표. response: 'attend' | 'absent' | 'maybe' → { message, schedule } */
export async function voteSchedule(scheduleId, response) {
  const res = await axios.post(`${API_BASE}/api/schedules/${scheduleId}/rsvp`, { response }, auth());
  return res.data;
}

/** 새 일정 생성 (방장·운영진) → { message, schedule } */
export async function createSchedule(clubId, body) {
  const res = await axios.post(`${API_BASE}/api/clubs/${clubId}/schedules`, body, auth());
  return res.data;
}

/** 장소 목록 (일정 장소 선택용) */
export async function fetchVenues() {
  const res = await axios.get(`${API_BASE}/api/venues`);
  return res.data;
}

/** 일정 수정 (방장·운영진) → { message, schedule } */
export async function updateSchedule(scheduleId, body) {
  const res = await axios.put(`${API_BASE}/api/schedules/${scheduleId}`, body, auth());
  return res.data;
}

/** 일정 삭제 (방장·운영진, 참석 투표도 함께 삭제) → { message } */
export async function deleteSchedule(scheduleId) {
  const res = await axios.delete(`${API_BASE}/api/schedules/${scheduleId}`, auth());
  return res.data;
}
