import { ClockIcon, PinIcon } from './Icons';
import { dDay, formatDate, formatTimeRange, parseLocal, weekday, won } from '../utils/datetime';

export const RESPONSE_META = {
  attend: { label: '참석', emoji: '🙆', chip: 'bg-mint-50 text-mint-700' },
  maybe: { label: '미정', emoji: '🤔', chip: 'bg-amber-50 text-amber-700' },
  absent: { label: '불참', emoji: '🙅', chip: 'bg-gray-100 text-gray-500' },
};

/** 마감 상태 → 뱃지 */
export function statusBadge(s) {
  if (s.close_reason === 'started') return { text: '종료', className: 'bg-gray-100 text-gray-500' };
  if (s.close_reason === 'deadline') return { text: '🔒 투표 마감', className: 'bg-gray-100 text-gray-500' };
  if (s.close_reason === 'full') return { text: '🔥 정원 마감', className: 'bg-red-50 text-red-500' };
  return { text: '모집중', className: 'bg-mint-50 text-mint-700' };
}

export default function ScheduleCard({ schedule: s, onClick }) {
  const start = parseLocal(s.start_at);
  const badge = statusBadge(s);
  const my = RESPONSE_META[s.my_response];
  const dd = dDay(s.start_at);
  const ratio = s.capacity ? Math.min(100, Math.round((s.counts.attend / s.capacity) * 100)) : null;
  const ended = s.close_reason === 'started';

  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(s)}
        aria-label={`${s.title} ${formatDate(s.start_at)}`}
        className={`w-full text-left flex gap-3 p-4 bg-white rounded-2xl shadow-card transition active:scale-[0.99]
          ${ended ? 'opacity-70' : ''}`}
      >
        {/* 날짜 타일 */}
        <div
          className={`w-16 shrink-0 rounded-2xl py-2 flex flex-col items-center justify-center
            ${dd === 'D-DAY' ? 'bg-red-500 text-white' : ended ? 'bg-gray-100 text-gray-500' : 'bg-mint-50 text-mint-700'}`}
        >
          <span className="text-[11px] font-bold">{start ? `${start.getMonth() + 1}월` : ''}</span>
          <span className="text-2xl font-black leading-tight">{start?.getDate()}</span>
          <span className="text-[11px] font-bold">{start ? `${weekday(start)}요일` : ''}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.text}</span>
            {!ended && <span className="text-[11px] font-bold text-gray-400">{dd}</span>}
            {my && (
              <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full ${my.chip}`}>
                {my.emoji} 내 응답: {my.label}
              </span>
            )}
          </div>
          <h3 className="mt-1 font-black text-gray-900 truncate">{s.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <ClockIcon /> {formatTimeRange(s.start_at, s.end_at)}
            <span className="text-gray-300">·</span> {won(s.fee)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 truncate">
            <PinIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{s.venue?.name || '장소 미정'}</span>
          </p>

          {/* 참석 인원 */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">참석 확정</span>
              <span className="font-black text-gray-900">
                <span className={s.close_reason === 'full' ? 'text-red-500' : 'text-mint-600'}>{s.counts.attend}</span>
                {s.capacity ? ` / ${s.capacity}명` : '명'}
              </span>
            </div>
            {ratio !== null && (
              <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.close_reason === 'full' ? 'bg-red-400' : 'bg-mint-500'}`}
                  style={{ width: `${ratio}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
