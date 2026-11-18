import { sportEmoji } from './VenueList';

/** 모집 상태 → 뱃지 문구/색상 */
export function recruitBadge(club) {
  if (club.recruit_status === 'closed') {
    return { text: '🔒 마감', className: 'bg-gray-100 text-gray-500' };
  }
  if (club.recruit_status === 'closing_soon') {
    return { text: '⏰ 마감임박', className: 'bg-orange-50 text-orange-600' };
  }
  if (club.is_new) {
    return { text: '🔥 신규 모집중', className: 'bg-red-50 text-red-500' };
  }
  return { text: '🙋 모집중', className: 'bg-mint-50 text-mint-700' };
}

const won = (n) => (n > 0 ? `월 ${n.toLocaleString()}원` : '회비 없음');

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      <span className="w-4 text-center" aria-hidden>{icon}</span>
      <span className="text-gray-400 w-14 shrink-0">{label}</span>
      <span className="text-gray-700 font-medium truncate">{value || '-'}</span>
    </div>
  );
}

/** 내 가입 상태 + 모집 상태 → 버튼 문구/스타일 */
function joinButton(club, joining) {
  if (joining) return { label: '신청 중…', disabled: true, style: 'primary' };
  if (club.my_status === 'pending') return { label: '신청 완료', disabled: true, style: 'done' };
  if (club.my_status === 'approved') return { label: '가입 완료', disabled: true, style: 'done' };
  if (club.my_status === 'rejected') return { label: '가입 불가', disabled: true, style: 'done' };
  if (club.recruit_status === 'closed') return { label: '문의하기', disabled: false, style: 'outline' };
  return { label: '가입/문의', disabled: false, style: 'primary' };
}

const BUTTON_STYLE = {
  primary: 'bg-mint-500 text-white shadow-sm hover:bg-mint-600',
  outline: 'border border-gray-300 text-gray-600 bg-white',
  done: 'bg-mint-50 text-mint-700 cursor-default',
};

export default function ClubCard({ club, sport, joining = false, highlight = false, onJoin, onContact }) {
  const badge = recruitBadge(club);
  const closed = club.recruit_status === 'closed';
  const btn = joinButton(club, joining);
  const onClick = () => (closed ? onContact(club) : onJoin(club));
  const memberText = club.max_members
    ? `${club.member_count} / ${club.max_members}명`
    : `${club.member_count}명`;

  return (
    <li
      id={`club-${club.id}`}
      aria-current={highlight ? 'true' : undefined}
      className={`bg-white rounded-2xl shadow-card p-4 scroll-mt-32 ${closed ? 'opacity-70' : ''} ${highlight ? 'ring-2 ring-mint-500' : ''}`}
    >
      <div className="flex gap-3">
        {/* 왼쪽: 메뉴 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
              {badge.text}
            </span>
            {!club.is_public && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                비공개
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-base font-black text-gray-900 truncate">{club.name}</h3>
          {club.description && (
            <p className="mt-0.5 text-[13px] text-gray-500 line-clamp-2">{club.description}</p>
          )}
        </div>

        {/* 오른쪽: 메뉴 사진 자리 */}
        <div className="w-20 h-20 shrink-0 rounded-xl bg-mint-50 overflow-hidden flex items-center justify-center text-4xl">
          {club.cover_image ? (
            <img src={club.cover_image} alt={club.name} className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden>{sportEmoji(sport)}</span>
          )}
        </div>
      </div>

      <div className="mt-3 p-3 rounded-xl bg-gray-50 space-y-1.5">
        <InfoRow icon="👥" label="회원 수" value={memberText} />
        <InfoRow icon="🏅" label="실력" value={club.skill_level} />
        <InfoRow icon="🕒" label="활동 시간" value={club.activity_time} />
        <InfoRow icon="💰" label="회비" value={won(club.monthly_fee)} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">방장 {club.owner?.nickname}</span>
        <button
          type="button"
          onClick={onClick}
          disabled={btn.disabled}
          className={`px-4 py-2 rounded-full text-sm font-bold transition enabled:active:scale-95
            ${BUTTON_STYLE[btn.style]}`}
        >
          {btn.style === 'done' && club.my_status !== 'rejected' ? '✓ ' : ''}
          {btn.label}
        </button>
      </div>
    </li>
  );
}
