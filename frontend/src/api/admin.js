import axios from 'axios';
import { getToken } from '../auth/tokenStorage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';
const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });
const url = (path) => `${API_BASE}/api/admin${path}`;

export const fetchAdminStats = async () => (await axios.get(url('/stats'), auth())).data;

/** status: 'pending' | 'approved' | 'rejected' | 'all' → { venues, counts } */
export const fetchAdminVenues = async (status = 'all') =>
  (await axios.get(url(`/venues?status=${status}`), auth())).data;

export const fetchAdminVenue = async (id) => (await axios.get(url(`/venues/${id}`), auth())).data.venue;

/** body: { status } 또는 { name, sport, address, lat, lng, phone, description } → { message, venue } */
export const updateAdminVenue = async (id, body) => (await axios.put(url(`/venues/${id}`), body, auth())).data;

export const deleteAdminVenue = async (id, { force = false } = {}) =>
  (await axios.delete(url(`/venues/${id}${force ? '?force=true' : ''}`), auth())).data;

export const fetchAdminClubs = async () => (await axios.get(url('/clubs'), auth())).data.clubs;
export const deleteAdminClub = async (id) => (await axios.delete(url(`/clubs/${id}`), auth())).data;

export const fetchAdminUsers = async () => (await axios.get(url('/users'), auth())).data.users;
export const setUserAdmin = async (id, isAdmin) =>
  (await axios.put(url(`/users/${id}/admin`), { is_admin: isAdmin }, auth())).data;

/** 카카오 로드뷰 / 구글 스트리트뷰 / 카카오맵 새 창 링크 */
export const mapLinks = ({ name, lat, lng }) => ({
  kakaoRoadview: `https://map.kakao.com/link/roadview/${lat},${lng}`,
  googleStreetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`,
  kakaoMap: `https://map.kakao.com/link/map/${encodeURIComponent(name || '장소')},${lat},${lng}`,
});

/* 종목 관리 */
export const fetchAdminSports = async () => (await axios.get(url('/sports'), auth())).data.sports;
/** body: { name, icon, sort_order? } → { message, sport } */
export const createAdminSport = async (body) => (await axios.post(url('/sports'), body, auth())).data;
/** body: { name?, icon?, sort_order?, is_active? } → { message, sport, synced_venues } */
export const updateAdminSport = async (id, body) => (await axios.put(url(`/sports/${id}`), body, auth())).data;
export const deleteAdminSport = async (id) => (await axios.delete(url(`/sports/${id}`), auth())).data;
