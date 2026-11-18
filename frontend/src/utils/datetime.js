// 서버는 일정 시각을 현지 시각 문자열 'YYYY-MM-DD HH:MM:SS' 로 준다.
// Date 파싱 시 시간대 해석이 브라우저마다 달라질 수 있어 직접 쪼개서 쓴다.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function parseLocal(value) {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

export const weekday = (date) => WEEKDAYS[date.getDay()];
export const pad2 = (n) => String(n).padStart(2, '0');
export const formatTime = (date) => (date ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : '');

/** '11월 21일 (토)' */
export function formatDate(value) {
  const d = parseLocal(value);
  return d ? `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday(d)})` : '';
}

/** '09:00 ~ 12:00' (종료 없으면 '09:00 ~') */
export function formatTimeRange(start, end) {
  const s = parseLocal(start);
  const e = parseLocal(end);
  if (!s) return '';
  if (!e) return `${formatTime(s)} ~`;
  const sameDay = s.toDateString() === e.toDateString();
  return `${formatTime(s)} ~ ${sameDay ? '' : `${e.getMonth() + 1}/${e.getDate()} `}${formatTime(e)}`;
}

/** 'D-DAY' / 'D-3' / '지난 일정' */
export function dDay(value, now = new Date()) {
  const d = parseLocal(value);
  if (!d) return '';
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  if (diff < 0) return '지난 일정';
  return diff === 0 ? 'D-DAY' : `D-${diff}`;
}

export const won = (n) => (n > 0 ? `${n.toLocaleString()}원` : '무료');

/** <input type="date"> 기본값용 'YYYY-MM-DD' */
export function toDateInput(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
