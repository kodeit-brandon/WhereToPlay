import axios from 'axios';
import { getToken } from '../auth/tokenStorage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

/** 장소의 동호회 목록. 로그인 상태면 토큰을 보내 각 동호회의 my_status(내 가입 상태)도 받는다 */
export async function fetchVenueClubs(venueId, token) {
  const res = await axios.get(`${API_BASE}/api/venues/${venueId}/clubs`, { headers: authHeaders(token) });
  return res.data; // { venue, clubs }
}

/** 동호회 가입 신청. localStorage에 저장된 JWT를 Authorization 헤더에 담아 보낸다 */
export async function joinClub(clubId) {
  const res = await axios.post(`${API_BASE}/api/clubs/${clubId}/join`, null, {
    headers: authHeaders(getToken()),
  });
  return res.data; // { message, membership }
}

/** 내가 가입·신청·운영 중인 동호회 목록 */
export async function fetchMyClubs() {
  const res = await axios.get(`${API_BASE}/api/me/clubs`, { headers: authHeaders(getToken()) });
  return res.data.clubs;
}

/** 동호회 가입 대기자 + 회원 목록 (방장·운영진 전용) */
export async function fetchClubMembers(clubId) {
  const res = await axios.get(`${API_BASE}/api/clubs/${clubId}/members`, { headers: authHeaders(getToken()) });
  return res.data; // { club, my_role, pending, members }
}

/** 가입 신청 승인/거절. status: 'approved' | 'rejected' */
export async function updateMemberStatus(clubId, userId, status) {
  const res = await axios.put(
    `${API_BASE}/api/clubs/${clubId}/members/${userId}`,
    { status },
    { headers: authHeaders(getToken()) }
  );
  return res.data; // { message, member }
}

/** 동호회 개설 → { message, club } (개설자는 자동으로 방장) */
export async function createClub(body) {
  const res = await axios.post(`${API_BASE}/api/clubs`, body, { headers: authHeaders(getToken()) });
  return res.data;
}

/** 동호회 이름/한 줄 소개 수정 (방장·운영진) → { message, club } */
export async function updateClub(clubId, body) {
  const res = await axios.put(`${API_BASE}/api/clubs/${clubId}`, body, { headers: authHeaders(getToken()) });
  return res.data;
}

/** 동호회 탈퇴 (본인, 방장 불가) → { message } */
export async function leaveClub(clubId) {
  const res = await axios.delete(`${API_BASE}/api/clubs/${clubId}/leave`, { headers: authHeaders(getToken()) });
  return res.data;
}

/** 운영진 지정/해제 (방장만). role: 'manager' | 'member' → { message, member } */
export async function changeMemberRole(clubId, userId, role) {
  const res = await axios.put(
    `${API_BASE}/api/clubs/${clubId}/members/${userId}/role`,
    { role },
    { headers: authHeaders(getToken()) }
  );
  return res.data;
}

/** 회원 내보내기 (방장: 방장 외 전원 / 운영진: 일반 회원만) → { message } */
export async function removeMember(clubId, userId) {
  const res = await axios.delete(`${API_BASE}/api/clubs/${clubId}/members/${userId}`, {
    headers: authHeaders(getToken()),
  });
  return res.data;
}
