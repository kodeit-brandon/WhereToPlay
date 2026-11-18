import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import PageHeader from '../components/PageHeader';
import { sportEmoji } from '../components/VenueList';
import { ChevronRightIcon } from '../components/Icons';
import { VenuePendingBadge } from '../components/VenuePendingNotice';
import { fetchMyClubs } from '../api/clubs';
import { errorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

const ROLE_BADGE = {
  owner: 'bg-amber-100 text-amber-700',
  manager: 'bg-violet-100 text-violet-700',
  treasurer: 'bg-sky-100 text-sky-700',
  member: 'bg-gray-100 text-gray-600',
};

function ClubRow({ club }) {
  // 승인된 동호회는 일정 화면(상세), 승인 대기 중이면 동호회가 있는 장소 화면으로
  const to = club.my_status === 'approved' ? `/clubs/${club.id}` : `/venues/${club.venue.id}`;
  return (
    <li className="flex items-center bg-white rounded-2xl shadow-card overflow-hidden">
      <Link to={to} className="flex-1 min-w-0 flex items-center gap-3 p-4 active:bg-gray-50 transition">
        <div className="w-14 h-14 shrink-0 rounded-xl bg-mint-50 flex items-center justify-center text-3xl">
          <span aria-hidden>{sportEmoji(club.venue.sport)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[club.my_role] || ROLE_BADGE.member}`}>
              {club.my_role_label}
            </span>
            <VenuePendingBadge status={club.venue.status} />
            {club.my_status === 'pending' && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                승인 대기중
              </span>
            )}
          </div>
          <p className="mt-1 font-black text-gray-900 truncate">{club.name}</p>
          <p className="text-xs text-gray-500 truncate">
            {club.venue.name} · 회원 {club.member_count}
            {club.max_members ? `/${club.max_members}` : ''}명
          </p>
        </div>
        {!club.can_manage && <ChevronRightIcon className="w-4 h-4 text-gray-400 shrink-0" />}
      </Link>

      {/* 방장·운영진: 회원 관리 바로가기 (가입 대기 인원 표시) */}
      {club.can_manage && (
        <Link
          to={`/clubs/${club.id}/manage`}
          aria-label={`${club.name} 회원 관리${club.pending_count ? `, 가입 대기 ${club.pending_count}명` : ''}`}
          className="relative self-stretch shrink-0 w-[72px] flex flex-col items-center justify-center gap-0.5
                     border-l border-gray-100 text-mint-600 text-xs font-bold active:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>⚙️</span>
          관리
          {club.pending_count > 0 && (
            <span className="absolute top-3 right-3 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
              {club.pending_count}
            </span>
          )}
        </Link>
      )}
    </li>
  );
}

function Section({ title, clubs }) {
  if (clubs.length === 0) return null;
  return (
    <section className="px-4 mt-5">
      <h2 className="mb-3 text-[15px] font-black text-gray-900">
        {title} <span className="text-mint-600">{clubs.length}</span>
      </h2>
      <ul className="space-y-3">
        {clubs.map((c) => (
          <ClubRow key={c.id} club={c} />
        ))}
      </ul>
    </section>
  );
}

export default function MyClubs() {
  const { logout } = useAuth();
  const [clubs, setClubs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMyClubs()
      .then((list) => !cancelled && setClubs(list))
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 401) logout(); // RequireAuth가 로그인 화면으로 보낸다
        else setError(errorMessage(err, '내 모임을 불러오지 못했어요.'));
      });
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const managing = (clubs || []).filter((c) => c.can_manage);
  const joined = (clubs || []).filter((c) => !c.can_manage && c.my_status === 'approved');
  const waiting = (clubs || []).filter((c) => c.my_status === 'pending');

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="relative mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-40 shadow-xl">
        <PageHeader title="내 모임" />

        {error && <div className="m-4 p-4 rounded-2xl bg-red-50 text-red-600 text-sm">{error}</div>}

        {!error && !clubs && (
          <div className="px-4 mt-5 space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[88px] bg-white rounded-2xl shadow-card" />
            ))}
          </div>
        )}

        {clubs && clubs.length === 0 && (
          <div className="mx-4 mt-10 py-12 text-center bg-white rounded-2xl shadow-card">
            <p className="text-4xl">🏃</p>
            <p className="mt-3 text-sm text-gray-600">아직 가입한 동호회가 없어요.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link to="/" className="px-5 py-2 rounded-full bg-gray-100 text-gray-600 text-sm font-bold">
                동호회 둘러보기
              </Link>
              <Link to="/clubs/new" className="px-5 py-2 rounded-full bg-mint-500 text-white text-sm font-bold">
                직접 만들기
              </Link>
            </div>
          </div>
        )}

        {clubs && (
          <>
            <Section title="운영 중인 동호회" clubs={managing} />
            <Section title="가입한 동호회" clubs={joined} />
            <Section title="승인 대기 중" clubs={waiting} />
          </>
        )}

        {/* 새 동호회 만들기 FAB (하단 탭 위) */}
        <Link
          to="/clubs/new"
          className="fixed z-30 bottom-20 right-[max(1rem,calc(50vw-224px))] flex items-center gap-1.5 pl-4 pr-5 h-12
                     rounded-full bg-mint-500 text-white text-sm font-black shadow-lg shadow-mint-500/30
                     transition active:scale-95 hover:bg-mint-600"
        >
          새 동호회 만들기 <span aria-hidden>➕</span>
        </Link>

        <BottomNav active="meetups" />
      </div>
    </div>
  );
}
