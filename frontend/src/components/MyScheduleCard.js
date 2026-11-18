import { Link } from 'react-router-dom';
import { sportEmoji } from './VenueList';
import { ClockIcon, PinIcon } from './Icons';
import { dDay, formatDate, formatTimeRange, parseLocal, won } from '../utils/datetime';

/** 내 일정 카드: D-day · 날짜/시간 · 동호회명 · 장소명 → 누르면 동호회 상세 */
export default function MyScheduleCard({ schedule: s }) {
  const dd = dDay(s.start_at);
  const start = parseLocal(s.start_at);
  const urgent = dd === 'D-DAY' || dd === 'D-1';
  return (
    <li>
      <Link
        to={`/clubs/${s.club.id}`}
        className="flex gap-3 p-3.5 bg-white rounded-2xl shadow-card active:scale-[0.99] transition"
        aria-label={`${s.title} ${formatDate(s.start_at)} ${s.club.name}`}
      >
        <div
          className={`w-[60px] shrink-0 rounded-xl py-2 flex flex-col items-center justify-center
            ${urgent ? 'bg-red-500 text-white' : 'bg-mint-50 text-mint-700'}`}
        >
          <span className="text-[11px] font-black">{dd}</span>
          <span className="text-xl font-black leading-tight">{start?.getDate()}</span>
          <span className="text-[10px] font-bold opacity-80">{start ? `${start.getMonth() + 1}월` : ''}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-mint-700">
            <span aria-hidden>{sportEmoji(s.club.sport)}</span>
            <span className="truncate">{s.club.name}</span>
          </p>
          <h3 className="mt-0.5 font-black text-gray-900 truncate">{s.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <ClockIcon /> {formatDate(s.start_at)} {formatTimeRange(s.start_at, s.end_at)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 truncate">
            <PinIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{s.venue?.name || '장소 미정'}</span>
            <span className="text-gray-300">·</span>
            <span className="shrink-0">{won(s.fee)}</span>
          </p>
        </div>
      </Link>
    </li>
  );
}
