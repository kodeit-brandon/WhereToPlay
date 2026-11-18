/** 동호회 장소가 승인 대기/반려 상태일 때 보여주는 안내 (뱃지 또는 배너) */
export function VenuePendingBadge({ status }) {
  if (status === 'pending') {
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">
        ⏳ 장소 승인 대기 중
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 whitespace-nowrap">
        🚫 장소 반려됨
      </span>
    );
  }
  return null;
}

export function VenuePendingBanner({ status }) {
  if (status !== 'pending' && status !== 'rejected') return null;
  const pending = status === 'pending';
  return (
    <div
      role="status"
      className={`mx-4 mt-4 flex items-start gap-2.5 px-4 py-3 rounded-2xl text-sm
        ${pending ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
    >
      <span className="text-lg leading-none" aria-hidden>
        {pending ? '⏳' : '🚫'}
      </span>
      <p>
        <b>{pending ? '장소 승인 대기 중' : '장소 등록이 반려되었어요'}</b>
        <span className="block text-xs mt-0.5 opacity-80">
          {pending
            ? '승인 후 지도에 공개됩니다. 그 전에도 일정·채팅 등 동호회 활동은 그대로 할 수 있어요.'
            : '동호회가 지도와 목록에 공개되지 않아요. 관리자에게 문의해 주세요.'}
        </span>
      </p>
    </div>
  );
}
