import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import BottomSheet from '../components/BottomSheet';
import ScheduleCard from '../components/ScheduleCard';
import ScheduleSheet from '../components/ScheduleSheet';
import { sportEmoji } from '../components/VenueList';
import { VenuePendingBanner } from '../components/VenuePendingNotice';
import { deleteSchedule, fetchClubSchedules, fetchSchedule, voteSchedule } from '../api/schedules';
import { leaveClub } from '../api/clubs';
import { errorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

const ROLE_BADGE = {
  owner: 'bg-amber-100 text-amber-700',
  manager: 'bg-violet-100 text-violet-700',
  treasurer: 'bg-sky-100 text-sky-700',
  member: 'bg-gray-100 text-gray-600',
};

// 목록 카드에 필요한 필드만 남긴다 (상세 응답의 attendees 제외)
const toSummary = ({ attendees, ...rest }) => rest;

export default function ClubDetail() {
  const { clubId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [scope, setScope] = useState('upcoming');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(location.state?.toast || '');

  // 바텀시트
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voting, setVoting] = useState(false);

  // 일정 등록 후 넘어온 토스트 메시지는 한 번만 보여주고 history state에서 지운다
  useEffect(() => {
    if (location.state?.toast) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const handleError = useCallback(
    (err, fallback) => {
      if (err?.response?.status === 401) {
        logout();
        return '';
      }
      return errorMessage(err, fallback);
    },
    [logout]
  );

  useEffect(() => {
    let cancelled = false;
    setData((d) => (d ? { ...d, schedules: null } : d));
    fetchClubSchedules(clubId, scope)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(handleError(err, '일정을 불러오지 못했어요.'));
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, scope, handleError]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const openSheet = (schedule) => {
    setOpenId(schedule.id);
    setDetail(null);
    setDetailLoading(true);
    fetchSchedule(schedule.id)
      .then(setDetail)
      .catch((err) => {
        setOpenId(null);
        const msg = handleError(err, '일정 정보를 불러오지 못했어요.');
        if (msg) window.alert(msg);
      })
      .finally(() => setDetailLoading(false));
  };
  const closeSheet = useCallback(() => setOpenId(null), []);

  const replaceInList = (updated) =>
    setData((d) => ({
      ...d,
      schedules: d.schedules?.map((s) => (s.id === updated.id ? toSummary(updated) : s)),
    }));

  const onVote = async (response) => {
    setVoting(true);
    try {
      const res = await voteSchedule(openId, response);
      setDetail(res.schedule);
      replaceInList(res.schedule);
      setToast(res.message);
    } catch (err) {
      const msg = handleError(err, '투표하지 못했어요. 다시 시도해 주세요.');
      if (msg) window.alert(msg);
      // 정원 마감 등으로 실패했으면 최신 상태로 갱신
      if (err?.response?.status === 409) {
        fetchSchedule(openId)
          .then((s) => {
            setDetail(s);
            replaceInList(s);
          })
          .catch(() => {});
      }
    } finally {
      setVoting(false);
    }
  };

  // 방장·운영진: 일정 수정 → 기존 값이 채워진 폼으로
  const onEditSchedule = (s) => {
    setOpenId(null);
    navigate(`/clubs/${clubId}/schedules/${s.id}/edit`);
  };

  const onDeleteSchedule = async (s) => {
    if (!window.confirm(`'${s.title}' 일정을 삭제할까요?\n참석 투표 기록도 함께 삭제되며 되돌릴 수 없어요.`)) return;
    try {
      const res = await deleteSchedule(s.id);
      setOpenId(null);
      setData((d) => ({ ...d, schedules: d.schedules?.filter((x) => x.id !== s.id) }));
      setToast(res.message);
    } catch (err) {
      const msg = handleError(err, '일정을 삭제하지 못했어요.');
      if (msg) window.alert(msg);
    }
  };

  // 일반 회원: 동호회 탈퇴
  const onLeave = async () => {
    if (!window.confirm(`'${data.club.name}' 동호회에서 탈퇴할까요?\n예정된 일정의 참석 투표도 함께 취소돼요.`)) return;
    try {
      const res = await leaveClub(clubId);
      window.alert(res.message);
      navigate('/my-clubs', { replace: true });
    } catch (err) {
      const msg = handleError(err, '탈퇴하지 못했어요.');
      if (msg) window.alert(msg);
    }
  };

  const club = data?.club;
  const schedules = data?.schedules;

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="relative mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-28 shadow-xl">
        <PageHeader title={club?.name || '동호회'} back fallback="/my-clubs" />

        {error && (
          <div className="px-4 py-20 text-center">
            <p className="text-4xl">🔒</p>
            <p className="mt-3 text-sm text-gray-600">{error}</p>
            <Link to="/my-clubs" className="inline-block mt-5 px-5 py-2 rounded-full bg-mint-500 text-white text-sm font-bold">
              내 모임으로
            </Link>
          </div>
        )}

        {!error && !data && (
          <div className="px-4 mt-4 space-y-3 animate-pulse">
            <div className="h-24 bg-white rounded-2xl shadow-card" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 bg-white rounded-2xl shadow-card" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* 장소가 승인 대기/반려 상태면 맨 위에 안내 */}
            <VenuePendingBanner status={club.venue_status} />

            {/* 동호회 요약 */}
            <section className="mx-4 mt-4 p-4 bg-white rounded-2xl shadow-card flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-mint-50 flex items-center justify-center text-3xl">
                <span aria-hidden>{sportEmoji(club.sport)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-black text-gray-900 truncate">{club.name}</p>
                  <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[data.my_role] || ROLE_BADGE.member}`}>
                    {data.my_role_label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {club.venue_name} · 회원 {club.member_count}
                  {club.max_members ? `/${club.max_members}` : ''}명
                </p>
              </div>
              {data.can_manage && (
                <Link
                  to={`/clubs/${club.id}/manage`}
                  className="shrink-0 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-bold text-gray-600"
                >
                  회원 관리
                </Link>
              )}
            </section>

            {/* 탭: 일정 / 채팅 */}
            <nav className="mx-4 mt-4 grid grid-cols-2 p-1 rounded-2xl bg-gray-200/70 text-sm font-bold" aria-label="동호회 메뉴">
              <span aria-current="page" className="py-2 rounded-xl bg-white text-gray-900 text-center shadow-sm">
                📅 일정
              </span>
              <Link to={`/clubs/${clubId}/chat`} className="py-2 rounded-xl text-gray-500 text-center hover:text-gray-700">
                💬 채팅
              </Link>
            </nav>

            {/* 일정 */}
            <section className="mx-4 mt-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-black text-gray-900">
                  {scope === 'upcoming' ? '다가오는 일정 📅' : '지난 일정 🗂️'}
                </h2>
                <div className="flex p-1 rounded-full bg-gray-200/70 text-xs font-bold">
                  {[
                    ['upcoming', '예정'],
                    ['past', '지난'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setScope(key)}
                      aria-pressed={scope === key}
                      className={`px-3 py-1 rounded-full transition ${scope === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {!schedules ? (
                <div className="space-y-3 animate-pulse">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-36 bg-white rounded-2xl shadow-card" />
                  ))}
                </div>
              ) : schedules.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl shadow-card">
                  <p className="text-4xl">🗓️</p>
                  <p className="mt-3 text-sm text-gray-500">
                    {scope === 'upcoming' ? '예정된 일정이 없어요.' : '지난 일정이 없어요.'}
                  </p>
                  {scope === 'upcoming' && data.can_manage && (
                    <p className="mt-1 text-xs text-gray-400">오른쪽 아래 버튼으로 첫 일정을 만들어 보세요!</p>
                  )}
                </div>
              ) : (
                <ul className="space-y-3">
                  {schedules.map((s) => (
                    <ScheduleCard key={s.id} schedule={s} onClick={openSheet} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* 동호회 탈퇴 (방장은 불가) */}
        {data && (
          <div className="mx-4 mt-10 pt-5 border-t border-gray-200 text-center">
            {data.my_role === 'owner' ? (
              <p className="text-xs text-gray-400">방장은 동호회를 탈퇴할 수 없어요.</p>
            ) : (
              <button type="button" onClick={onLeave} className="text-sm font-bold text-gray-400 underline underline-offset-4 hover:text-red-500">
                동호회 탈퇴
              </button>
            )}
          </div>
        )}

        {/* 방장·운영진: 새 일정 만들기 FAB */}
        {data?.can_manage && (
          <Link
            to={`/clubs/${clubId}/schedules/new`}
            className="fixed z-30 bottom-6 right-[max(1rem,calc(50vw-224px))] flex items-center gap-1.5 pl-4 pr-5 h-14
                       rounded-full bg-mint-500 text-white font-black shadow-lg shadow-mint-500/30
                       transition active:scale-95 hover:bg-mint-600"
          >
            <span className="text-2xl leading-none" aria-hidden>＋</span>새 일정 만들기
          </Link>
        )}

        <BottomSheet open={openId !== null} onClose={closeSheet} labelledBy="schedule-sheet-title">
          <ScheduleSheet
            schedule={detail}
            loading={detailLoading}
            voting={voting}
            canSeeList={data?.can_manage}
            canManage={data?.can_manage}
            onVote={onVote}
            onEdit={onEditSchedule}
            onDelete={onDeleteSchedule}
          />
        </BottomSheet>

        {toast && (
          <div
            role="status"
            className={`fixed ${openId !== null ? 'top-4' : 'bottom-24'} left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-[448px]
                       px-4 py-3 rounded-xl bg-gray-900/90 text-white text-sm text-center shadow-lg`}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
