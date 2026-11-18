import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ClubCard from '../components/ClubCard';
import Modal from '../components/Modal';
import { fetchVenueClubs, joinClub } from '../api/clubs';
import { errorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { sportEmoji } from '../components/VenueList';
import { ChevronLeftIcon, PhoneIcon, PinIcon } from '../components/Icons';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'open', label: '모집중' },
  { key: 'closed', label: '마감' },
];

function Header({ title, onBack }) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
      <div className="relative flex items-center h-14 px-2">
        <button type="button" onClick={onBack} aria-label="뒤로가기" className="p-2 text-gray-800">
          <ChevronLeftIcon />
        </button>
        <h1 className="absolute left-14 right-14 text-center text-[17px] font-bold text-gray-900 truncate">
          {title}
        </h1>
      </div>
    </header>
  );
}

function VenueInfo({ venue, clubs }) {
  const openCount = clubs.filter((c) => c.recruit_status !== 'closed').length;
  return (
    <section className="bg-white pb-5">
      {/* 대표 이미지 */}
      <div className="h-40 bg-gradient-to-br from-mint-400 to-mint-600 flex items-center justify-center overflow-hidden">
        {venue.image_url ? (
          <img src={venue.image_url} alt={venue.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-7xl drop-shadow-lg" aria-hidden>{sportEmoji(venue.sport)}</span>
        )}
      </div>

      {/* 정보 카드 (이미지에 살짝 겹치게) */}
      <div className="-mt-8 mx-4 relative bg-white rounded-2xl shadow-card px-5 py-4 text-center">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-mint-50 text-mint-700">
          {venue.sport}
        </span>
        <h2 className="mt-1.5 text-xl font-black text-gray-900">{venue.name}</h2>
        {venue.description && <p className="mt-1 text-sm text-gray-500">{venue.description}</p>}
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-center gap-6 text-sm">
          <div>
            <p className="text-gray-400 text-xs">동호회</p>
            <p className="font-black text-gray-900">{clubs.length}개</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">모집중</p>
            <p className="font-black text-mint-600">{openCount}개</p>
          </div>
        </div>
      </div>

      <div className="mx-5 mt-4 space-y-1 text-[13px] text-gray-600">
        <p className="flex items-center gap-1.5">
          <PinIcon className="w-4 h-4 text-gray-400 shrink-0" /> {venue.address}
        </p>
        {venue.phone && (
          <p className="flex items-center gap-1.5">
            <PhoneIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <a href={`tel:${venue.phone}`} className="underline-offset-2 hover:underline">{venue.phone}</a>
          </p>
        )}
      </div>
    </section>
  );
}

function LoadingView() {
  return (
    <div className="animate-pulse">
      <div className="h-40 bg-gray-200" />
      <div className="-mt-8 mx-4 h-32 bg-white rounded-2xl shadow-card" />
      <div className="px-4 mt-6 space-y-3">
        {[0, 1].map((i) => <div key={i} className="h-56 bg-white rounded-2xl shadow-card" />)}
      </div>
    </div>
  );
}

export default function VenueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const highlightClubId = Number(searchParams.get('club')) || null;
  const { token, isLoggedIn, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  const [modal, setModal] = useState(null); // 'login' | { type: 'success' | 'fail', ... }

  // 로그인 상태가 바뀌면(토큰 변경) 내 가입 상태까지 포함해서 다시 불러온다
  useEffect(() => {
    let cancelled = false;
    setError(null);
    // 다른 장소로 이동했으면 이전 장소 데이터를 지우고 로딩 표시 (같은 장소 재조회면 그대로 유지)
    setData((d) => (d && String(d.venue.id) === String(id) ? d : null));
    fetchVenueClubs(id, token)
      .then((res) => !cancelled && setData(res))
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(
          err.response?.status === 404
            ? '존재하지 않는 장소예요.'
            : '동호회 목록을 불러오지 못했어요. 백엔드 서버가 켜져 있는지 확인해 주세요.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  // 탐색(지도)에서 특정 동호회를 눌러 들어왔으면 그 카드로 스크롤
  useEffect(() => {
    if (!highlightClubId || !data) return;
    document.getElementById(`club-${highlightClubId}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [highlightClubId, data]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const clubs = useMemo(() => {
    const list = data?.clubs || [];
    if (filter === 'open') return list.filter((c) => c.recruit_status !== 'closed');
    if (filter === 'closed') return list.filter((c) => c.recruit_status === 'closed');
    return list;
  }, [data, filter]);

  // 메인에서 들어온 게 아니라 주소로 바로 열었으면 뒤로가기 대신 홈으로
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));

  // 모집 마감된 동호회의 '문의하기'는 아직 기능이 없어서 안내만 띄운다
  const handleContact = (club) => setToast(`'${club.name}' 문의 기능은 곧 열려요!`);

  const setMyStatus = (clubId, status) =>
    setData((d) => ({ ...d, clubs: d.clubs.map((c) => (c.id === clubId ? { ...c, my_status: status } : c)) }));

  const goLogin = () => {
    setModal(null);
    // 로그인 후 이 화면으로 돌아오도록 현재 위치를 넘긴다
    navigate('/login', { state: { from: location.pathname } });
  };

  const handleJoin = async (club) => {
    if (!isLoggedIn) {
      setModal({ type: 'login' });
      return;
    }
    // 실수로 누르는 것을 막기 위해 한 번 더 확인 ('취소'면 아무것도 하지 않음)
    if (!window.confirm('가입하시겠습니까?')) return;
    setJoiningId(club.id);
    try {
      const res = await joinClub(club.id);
      setMyStatus(club.id, 'pending');
      setModal({ type: 'success', clubName: club.name, message: res.message });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        // 토큰 만료·위조 → 로그아웃 후 다시 로그인 유도
        logout();
        setModal({ type: 'login' });
      } else {
        // 이미 신청/가입된 경우 서버가 현재 상태를 알려주므로 버튼에 반영
        const serverStatus = err?.response?.data?.status;
        if (status === 409 && serverStatus) setMyStatus(club.id, serverStatus);
        setModal({ type: 'fail', message: errorMessage(err, '가입 신청에 실패했어요.') });
      }
    } finally {
      setJoiningId(null);
    }
  };

  const closeModal = () => setModal(null);
  const modalProps =
    modal?.type === 'login'
      ? {
          emoji: '🔐',
          title: '로그인이 필요한 기능입니다.',
          message: '로그인하고 동호회에 가입 신청해 보세요!',
          onClose: closeModal,
          actions: [
            { label: '다음에 할게요', variant: 'secondary', onClick: closeModal },
            { label: '로그인하러 가기', onClick: goLogin },
          ],
        }
      : modal?.type === 'success'
        ? {
            emoji: '🎉',
            title: `'${modal.clubName}'\n가입 신청 완료!`,
            message: modal.message || '가입 신청이 완료되었습니다. 방장의 승인을 기다려주세요!',
            onClose: closeModal,
            actions: [{ label: '확인', onClick: closeModal }],
          }
        : modal?.type === 'fail'
          ? {
              emoji: '🙏',
              title: '가입 신청을 할 수 없어요',
              message: modal.message,
              onClose: closeModal,
              actions: [{ label: '확인', onClick: closeModal }],
            }
          : null;

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="relative mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-10 shadow-xl">
        <Header title={data?.venue.name || '장소 정보'} onBack={goBack} />

        {error && (
          <div className="px-4 py-20 text-center">
            <p className="text-4xl">🥲</p>
            <p className="mt-3 text-sm text-gray-600">{error}</p>
            <Link to="/" className="inline-block mt-5 px-5 py-2 rounded-full bg-mint-500 text-white text-sm font-bold">
              홈으로 가기
            </Link>
          </div>
        )}

        {!error && !data && <LoadingView />}

        {data && (
          <>
            <VenueInfo venue={data.venue} clubs={data.clubs} />

            {/* 메뉴판 */}
            <section className="mt-2 bg-gray-50">
              <div className="sticky top-14 z-10 bg-gray-50/95 backdrop-blur px-4 pt-4 pb-3">
                <h2 className="text-lg font-black text-gray-900">동호회 메뉴판 📋</h2>
                <div className="mt-3 flex gap-2">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-bold border transition
                        ${filter === f.key
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {clubs.length > 0 ? (
                <ul className="px-4 space-y-3">
                  {clubs.map((c) => (
                    <ClubCard
                      key={c.id}
                      club={c}
                      highlight={c.id === highlightClubId}
                      sport={data.venue.sport}
                      joining={joiningId === c.id}
                      onJoin={handleJoin}
                      onContact={handleContact}
                    />
                  ))}
                </ul>
              ) : (
                <div className="mx-4 py-12 text-center bg-white rounded-2xl shadow-card">
                  <p className="text-3xl">🏟️</p>
                  <p className="mt-2 text-sm text-gray-500">
                    {data.clubs.length === 0 ? '아직 이 장소에 등록된 동호회가 없어요.' : '조건에 맞는 동호회가 없어요.'}
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        <Modal open={Boolean(modalProps)} {...modalProps} />

        {/* 토스트 */}
        {toast && (
          <div
            role="status"
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-[448px]
                       px-4 py-3 rounded-xl bg-gray-900/90 text-white text-sm text-center shadow-lg"
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
