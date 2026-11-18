import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import ExploreMap from '../components/ExploreMap';
import { sportEmoji } from '../components/VenueList';
import { PinIcon, SearchIcon } from '../components/Icons';
import { searchVenues } from '../api/explore';
import { errorMessage } from '../api/auth';
import { useSports } from '../sports/sportsStore';

const DEBOUNCE_MS = 250;

const RECRUIT_CHIP = {
  recruiting: 'bg-mint-50 text-mint-700',
  closing_soon: 'bg-orange-50 text-orange-600',
  closed: 'bg-gray-100 text-gray-500',
};

/** 동호회를 눌렀을 때 갈 곳: 내 동호회면 상세, 아니면 장소 메뉴판(가입/문의) */
function clubLink(venueId, club) {
  return club.my_status === 'approved' ? `/clubs/${club.id}` : `/venues/${venueId}?club=${club.id}`;
}

function clubActionLabel(club) {
  if (club.my_status === 'approved') return '내 동호회 ›';
  if (club.my_status === 'pending') return '승인 대기 ›';
  if (club.recruit_status === 'closed') return '보기 ›';
  return '가입/문의 ›';
}

/* ---------------- 목록 보기 카드 ---------------- */
function VenueResultCard({ venue }) {
  return (
    <li className="bg-white rounded-2xl shadow-card overflow-hidden">
      <Link to={`/venues/${venue.id}`} className="flex gap-3 p-3 active:bg-gray-50 transition">
        <div className="w-16 h-16 shrink-0 rounded-xl bg-mint-50 flex items-center justify-center text-3xl" aria-hidden>
          {sportEmoji(venue.sport)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate">{venue.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-mint-50 text-mint-700">{venue.sport}</span>
            <span className="text-xs text-gray-500">
              동호회 <b className="text-gray-800">{venue.club_count}</b>개
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <PinIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{venue.address}</span>
          </p>
        </div>
      </Link>
      {venue.clubs.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-3 pb-3">
          {venue.clubs.map((c) => (
            <Link
              key={c.id}
              to={clubLink(venue.id, c)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-bold text-gray-700 hover:bg-mint-50 hover:text-mint-700"
            >
              {c.name}
              {c.my_status === 'approved' && <span className="ml-1 text-mint-600">✓</span>}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

/* ---------------- 지도 보기: 마커 클릭 시 하단 요약 카드 ---------------- */
function VenueSummarySheet({ venue, onClose }) {
  return (
    <section
      aria-label={`${venue.name} 요약`}
      className="absolute left-3 right-3 bottom-3 z-20 max-h-[55%] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden"
    >
      <div className="flex items-start gap-3 p-4 pb-3 border-b border-gray-100">
        <div className="w-12 h-12 shrink-0 rounded-xl bg-mint-50 flex items-center justify-center text-2xl" aria-hidden>
          {sportEmoji(venue.sport)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="font-black text-gray-900 truncate">{venue.name}</h2>
            <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-mint-50 text-mint-700">{venue.sport}</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500 truncate">{venue.address}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="요약 닫기" className="p-1 -m-1 text-gray-400 text-lg leading-none">
          ✕
        </button>
      </div>

      <div className="overflow-y-auto">
        <p className="px-4 pt-3 pb-1 text-xs font-bold text-gray-500">활동 중인 동호회 {venue.clubs.length}개</p>
        {venue.clubs.length === 0 ? (
          <div className="px-4 pb-4 pt-1 text-sm text-gray-500">
            아직 이 장소에 동호회가 없어요.{' '}
            <Link to="/clubs/new" className="font-bold text-mint-600">
              첫 동호회 만들기 ›
            </Link>
          </div>
        ) : (
          <ul className="px-2 pb-2" aria-label="이 장소의 동호회">
            {venue.clubs.map((c) => (
              <li key={c.id}>
                <Link to={clubLink(venue.id, c)} className="flex items-center gap-2 px-2 py-2.5 rounded-xl hover:bg-gray-50 active:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1.5">
                      <span className="font-bold text-[15px] text-gray-900 truncate">{c.name}</span>
                      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${RECRUIT_CHIP[c.recruit_status]}`}>
                        {c.recruit_status_label}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      회원 {c.member_count}
                      {c.max_members ? `/${c.max_members}` : ''}명{c.description ? ` · ${c.description}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold ${c.my_status === 'approved' ? 'text-mint-600' : 'text-gray-500'}`}>
                    {clubActionLabel(c)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to={`/venues/${venue.id}`} className="block py-3 text-center text-sm font-bold text-mint-600 border-t border-gray-100">
        장소 상세 보기 ›
      </Link>
    </section>
  );
}

/* ---------------- 탐색 화면 ---------------- */
export default function Explore() {
  const navigate = useNavigate();
  // 필터/보기 상태는 URL 에 둬서 동호회 화면에 갔다가 뒤로 와도 그대로 유지
  const [params, setParams] = useSearchParams();
  const sports = useSports(); // GET /api/sports (활성 종목)
  const sport = params.get('sport') || '전체';
  const q = params.get('q') || '';
  const view = params.get('view') === 'map' ? 'map' : 'list';

  const [input, setInput] = useState(q);
  const [venues, setVenues] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const reqSeq = useRef(0);

  const updateParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  // 입력이 멈추면(250ms) 검색어 반영 → 실시간 필터
  useEffect(() => {
    if (input.trim() === q) return undefined;
    const t = setTimeout(() => updateParams({ q: input.trim() }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, q, updateParams]);

  // 필터가 바뀔 때마다 서버 검색 (늦게 도착한 이전 응답은 무시)
  useEffect(() => {
    const seq = ++reqSeq.current;
    setError('');
    searchVenues({ sport: sport === '전체' ? '' : sport, q })
      .then((list) => {
        if (seq !== reqSeq.current) return;
        setVenues(list);
        setSelectedId((id) => (list.some((v) => v.id === id) ? id : null));
      })
      .catch((err) => seq === reqSeq.current && setError(errorMessage(err, '장소를 불러오지 못했어요.')));
  }, [sport, q]);

  const selected = venues?.find((v) => v.id === selectedId);
  const isMap = view === 'map';

  return (
    <div className="min-h-screen bg-gray-200">
      <div className={`relative mx-auto max-w-[480px] bg-gray-50 shadow-xl flex flex-col ${isMap ? 'h-[100dvh]' : 'min-h-screen pb-24'}`}>
        {/* 상단: 검색창 + 지도/목록 토글 + 종목 칩 */}
        <header className="sticky top-0 z-30 bg-white pt-3 pb-2 shadow-sm">
          <div className="flex items-center gap-2 px-4">
            <label className="flex-1 flex items-center gap-2 h-11 px-3.5 rounded-xl bg-gray-100 focus-within:ring-2 focus-within:ring-mint-500/40">
              <SearchIcon className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && updateParams({ q: input.trim() })}
                placeholder="장소명·지역·동호회명 검색"
                aria-label="장소명·지역·동호회명 검색"
                className="flex-1 min-w-0 bg-transparent text-[15px] text-gray-900 placeholder-gray-400 outline-none"
              />
              {input && (
                <button type="button" onClick={() => setInput('')} aria-label="검색어 지우기" className="text-gray-400">
                  ✕
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                updateParams({ view: isMap ? '' : 'map' });
              }}
              className="shrink-0 h-11 px-3.5 rounded-xl bg-gray-900 text-white text-sm font-bold active:scale-95 transition"
            >
              {isMap ? '📋 목록 보기' : '🗺️ 지도 보기'}
            </button>
          </div>

          <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar px-4" role="group" aria-label="종목 필터">
            {[{ name: '전체', icon: '' }, ...sports].map((s) => (
              <button
                key={s.name}
                type="button"
                aria-pressed={sport === s.name}
                onClick={() => updateParams({ sport: s.name === '전체' ? '' : s.name })}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border transition
                  ${sport === s.name ? 'bg-mint-500 text-white border-mint-500' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {s.icon ? `${s.icon} ${s.name}` : s.name}
              </button>
            ))}
          </div>
        </header>

        {error && <p className="m-4 p-4 rounded-2xl bg-red-50 text-sm text-red-600">{error}</p>}

        {isMap ? (
          /* 지도 보기 */
          <div className="relative flex-1 min-h-0 mb-16">
            <ExploreMap
              venues={venues || []}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onFallback={() => updateParams({ view: '' })}
              className="h-full w-full"
            />
            {venues && (
              <span className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-full bg-white/95 shadow text-xs font-bold text-gray-700">
                {venues.length}곳
              </span>
            )}
            {selected && <VenueSummarySheet venue={selected} onClose={() => setSelectedId(null)} />}
          </div>
        ) : (
          /* 목록 보기 */
          <section className="px-4 pt-4">
            <p className="mb-3 text-sm text-gray-500" aria-live="polite">
              {venues ? (
                <>
                  {q && <b className="text-gray-900">'{q}' </b>}
                  검색 결과 <b className="text-mint-600">{venues.length}</b>곳
                </>
              ) : (
                '불러오는 중…'
              )}
            </p>
            {!venues && (
              <ul className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="h-28 bg-white rounded-2xl shadow-card animate-pulse" />
                ))}
              </ul>
            )}
            {venues && venues.length === 0 && (
              <div className="py-14 text-center bg-white rounded-2xl shadow-card">
                <p className="text-4xl">🔍</p>
                <p className="mt-3 text-sm text-gray-600">조건에 맞는 장소가 없어요.</p>
                <button type="button" onClick={() => navigate('/clubs/new')} className="mt-4 text-sm font-bold text-mint-600">
                  찾는 곳이 없다면 직접 동호회를 만들어 보세요 ›
                </button>
              </div>
            )}
            {venues && venues.length > 0 && (
              <ul className="space-y-3" aria-label="검색 결과">
                {venues.map((v) => (
                  <VenueResultCard key={v.id} venue={v} />
                ))}
              </ul>
            )}
          </section>
        )}

        <BottomNav active="search" />
      </div>
    </div>
  );
}
