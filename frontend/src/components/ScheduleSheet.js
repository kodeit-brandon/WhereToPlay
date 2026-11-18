import Avatar from './Avatar';
import { ClockIcon, PinIcon } from './Icons';
import { RESPONSE_META, statusBadge } from './ScheduleCard';
import { formatDate, formatTimeRange, parseLocal, formatTime, won } from '../utils/datetime';

const VOTE_ORDER = ['attend', 'maybe', 'absent'];
const VOTE_ACTIVE = {
  attend: 'bg-mint-500 text-white border-mint-500 shadow-md',
  maybe: 'bg-amber-400 text-white border-amber-400 shadow-md',
  absent: 'bg-gray-700 text-white border-gray-700 shadow-md',
};

function InfoLine({ icon, children }) {
  return (
    <p className="flex items-start gap-2 text-sm text-gray-600">
      <span className="mt-0.5 text-gray-400 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

/** 일정 상세 + 투표 + 참석자 명단 (BottomSheet 안에 들어가는 내용) */
export default function ScheduleSheet({ schedule: s, loading, voting, canSeeList, canManage, onVote, onEdit, onDelete }) {
  if (loading || !s) {
    return (
      <div className="py-10 space-y-3 animate-pulse">
        <div className="h-5 w-1/3 bg-gray-200 rounded" />
        <div className="h-7 w-2/3 bg-gray-200 rounded" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-14 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const badge = statusBadge(s);
  const deadline = parseLocal(s.rsvp_deadline);
  const voted = Boolean(s.my_response);
  const showList = voted || canSeeList;

  let notice = null;
  if (s.close_reason === 'started') notice = '이미 시작했거나 지난 일정이라 투표할 수 없어요.';
  else if (s.close_reason === 'deadline') notice = '투표가 마감되었어요.';
  else if (s.close_reason === 'full' && s.my_response !== 'attend') notice = '정원이 다 찼어요. 불참·미정으로만 응답할 수 있어요.';

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.text}</span>
        {/* 방장·운영진 전용 */}
        {canManage && (
          <div className="flex gap-1.5">
            {s.close_reason !== 'started' && (
              <button
                type="button"
                onClick={() => onEdit(s)}
                className="px-3 py-1 rounded-full border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
              >
                수정
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(s)}
              className="px-3 py-1 rounded-full border border-red-200 text-xs font-bold text-red-500 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        )}
      </div>
      <h2 id="schedule-sheet-title" className="mt-2 text-xl font-black text-gray-900">
        {s.title}
      </h2>

      <div className="mt-4 p-4 rounded-2xl bg-gray-50 space-y-2">
        <InfoLine icon={<ClockIcon className="w-4 h-4" />}>
          <b className="text-gray-900">{formatDate(s.start_at)}</b> {formatTimeRange(s.start_at, s.end_at)}
        </InfoLine>
        <InfoLine icon={<PinIcon className="w-4 h-4" />}>
          <b className="text-gray-900">{s.venue?.name || '장소 미정'}</b>
          {s.venue?.address && <span className="block text-xs text-gray-400">{s.venue.address}</span>}
        </InfoLine>
        <InfoLine icon="💰">참가비 {won(s.fee)}</InfoLine>
        <InfoLine icon="👥">정원 {s.capacity ? `${s.capacity}명` : '제한 없음'}</InfoLine>
        {deadline && (
          <InfoLine icon="⏰">
            투표 마감 {formatDate(s.rsvp_deadline)} {formatTime(deadline)}
          </InfoLine>
        )}
        {s.description && <p className="pt-2 text-sm text-gray-700 whitespace-pre-line border-t border-gray-200">{s.description}</p>}
      </div>

      {/* 투표 */}
      <h3 className="mt-6 text-[15px] font-black text-gray-900">참석 여부를 알려주세요</h3>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {VOTE_ORDER.map((key) => {
          const meta = RESPONSE_META[key];
          const active = s.my_response === key;
          const disabled = voting || !s.can_vote || (key === 'attend' && !s.can_attend);
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => !active && onVote(key)}
              aria-pressed={active}
              className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-bold text-sm transition
                ${active ? VOTE_ACTIVE[key] : 'bg-white text-gray-700 border-gray-200 enabled:hover:border-gray-300'}
                enabled:active:scale-95 disabled:opacity-40`}
            >
              <span className="text-2xl" aria-hidden>{meta.emoji}</span>
              {meta.label}
              <span className={`text-[11px] font-medium ${active ? 'text-white/80' : 'text-gray-400'}`}>
                {s.counts[key]}명
              </span>
            </button>
          );
        })}
      </div>
      {notice && <p className="mt-2 text-xs text-center text-gray-500">{notice}</p>}

      {/* 참석자 명단 */}
      <div className="mt-6">
        <h3 className="text-[15px] font-black text-gray-900">
          참석자 <span className="text-mint-600">{s.counts.attend}</span>
          {s.capacity ? <span className="text-gray-400 font-bold"> / {s.capacity}</span> : null}
        </h3>
        {!showList ? (
          <p className="mt-3 py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
            투표하면 누가 오는지 볼 수 있어요 👀
          </p>
        ) : s.attendees.attend.length === 0 ? (
          <p className="mt-3 py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
            아직 참석을 누른 사람이 없어요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="참석자 목록">
            {s.attendees.attend.map((p) => (
              <li key={p.user_id} className="flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-mint-50">
                <Avatar src={p.profile_image} name={p.nickname} size="w-7 h-7 text-xs" />
                <span className="text-sm font-bold text-mint-700">{p.nickname}</span>
              </li>
            ))}
          </ul>
        )}
        {showList && (s.counts.maybe > 0 || s.counts.absent > 0) && (
          <p className="mt-3 text-xs text-gray-400">
            {s.attendees.maybe.length > 0 && `🤔 미정: ${s.attendees.maybe.map((p) => p.nickname).join(', ')}`}
            {s.attendees.maybe.length > 0 && s.attendees.absent.length > 0 && '  ·  '}
            {s.attendees.absent.length > 0 && `🙅 불참 ${s.attendees.absent.length}명`}
          </p>
        )}
      </div>
    </div>
  );
}
