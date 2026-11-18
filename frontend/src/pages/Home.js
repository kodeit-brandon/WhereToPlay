import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import TopBar from '../components/TopBar';
import EventBanner from '../components/EventBanner';
import CategoryGrid, { buildCategories } from '../components/CategoryGrid';
import { useSports } from '../sports/sportsStore';
import MeetupCarousel from '../components/MeetupCarousel';
import VenueList from '../components/VenueList';
import BottomNav from '../components/BottomNav';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

/**
 * 번개 모임 임시 데이터 템플릿.
 * 아직 모임(schedules) API가 없어서, /api/venues 로 받은 실제 장소에
 * 종목별 템플릿을 붙여 카드를 만든다. 모임 API가 생기면 이 부분만 교체하면 된다.
 */
const MEETUP_TEMPLATES = {
  풋살: { title: '풋살 게스트 모집! 실력 무관 🙌', emoji: '⚽', gradient: 'from-green-400 to-emerald-600' },
  축구: { title: '주말 아침 축구 한 판 하실 분', emoji: '⚽', gradient: 'from-green-400 to-emerald-600' },
  농구: { title: '저녁 농구 같이 해요! 3:3 반코트', emoji: '🏀', gradient: 'from-orange-400 to-amber-600' },
  배드민턴: { title: '퇴근 후 배드민턴 복식 파트너 구해요', emoji: '🏸', gradient: 'from-sky-400 to-blue-600' },
  테니스: { title: '테니스 랠리 연습 같이 하실 분 🎾', emoji: '🎾', gradient: 'from-lime-400 to-green-600' },
};
const DEFAULT_TEMPLATE = { title: '오늘 같이 운동해요!', emoji: '🏃', gradient: 'from-mint-400 to-mint-600' };
const TIMES = ['오늘 19:00', '오늘 20:30', '오늘 18:00', '오늘 21:00', '오늘 07:30', '오늘 12:00'];
const STATUSES = ['모집중', '마감임박', '모집중', '마감', '모집중', '마감임박'];

function buildMeetups(venues) {
  return venues.map((v, i) => {
    const tpl = MEETUP_TEMPLATES[v.sport] || DEFAULT_TEMPLATE;
    const capacity = 6 + (i % 3) * 2;
    const status = STATUSES[i % STATUSES.length];
    const joined = status === '마감' ? capacity : status === '마감임박' ? capacity - 1 : Math.max(1, capacity - 4);
    // 장소 이름 앞부분(예: "잠실")을 제목에 붙여 실제 모임 느낌을 낸다
    const area = v.name.split(' ')[0];
    return {
      id: v.id,
      venueId: v.id,
      title: `${area} ${tpl.title}`,
      emoji: tpl.emoji,
      gradient: tpl.gradient,
      time: TIMES[i % TIMES.length],
      place: v.name,
      status,
      joined,
      capacity,
    };
  });
}

export default function Home() {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_BASE}/api/venues`)
      .then((res) => {
        if (!cancelled) setVenues(res.data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError('장소 목록을 불러오지 못했어요. 백엔드 서버가 켜져 있는지 확인해 주세요.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const meetups = useMemo(() => buildMeetups(venues), [venues]);

  // 카테고리 선택에 따라 장소 리스트 필터링
  // 카테고리 = 고정 메뉴 + DB 종목 (GET /api/sports)
  const sports = useSports();
  const categories = useMemo(() => buildCategories(sports), [sports]);
  const selected = categories.find((c) => c.key === category);
  const filteredVenues = useMemo(() => {
    if (!selected) return venues;
    if (selected.key === 'popular') return [...venues].sort((a, b) => b.club_count - a.club_count);
    if (selected.key === 'guest') return venues;
    return venues.filter((v) => selected.sports.includes(v.sport));
  }, [venues, selected]);

  const listTitle = selected
    ? selected.key === 'popular'
      ? '👑 동호회가 많은 장소'
      : `${selected.emoji} ${selected.label} 장소`
    : '내 주변 운동 장소 📍';

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="relative mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-24 shadow-xl">
        <TopBar />
        <EventBanner />
        <CategoryGrid categories={categories} selected={category} onSelect={setCategory} />
        {!error && <MeetupCarousel meetups={meetups} loading={loading} />}
        <VenueList
          title={listTitle}
          venues={filteredVenues}
          loading={loading}
          error={error}
          onReset={selected ? () => setCategory(null) : undefined}
        />
        <BottomNav active="home" />
      </div>
    </div>
  );
}
