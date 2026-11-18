import { Link } from 'react-router-dom';
import { PinIcon } from './Icons';
import { sportEmoji } from '../sports/sportsStore';

// 종목 아이콘은 DB(sports 테이블)에서 관리 — 기존 import 경로 호환을 위해 다시 내보낸다
export { sportEmoji };

function VenueCard({ venue }) {
  return (
    <li>
      <Link
        to={`/venues/${venue.id}`}
        className="flex gap-3 p-3 bg-white rounded-2xl shadow-card active:scale-[0.99] transition hover:shadow-md"
      >
        <div className="w-20 h-20 shrink-0 rounded-xl bg-mint-50 overflow-hidden flex items-center justify-center text-4xl">
          {venue.image_url ? (
            <img src={venue.image_url} alt={venue.name} className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden>{sportEmoji(venue.sport)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="font-bold text-gray-900 truncate">{venue.name}</h3>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-mint-50 text-mint-700">
              {venue.sport}
            </span>
            <span className="text-xs text-gray-500">
              동호회 <b className="text-gray-800">{venue.club_count}</b>개
            </span>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
            <PinIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{venue.address}</span>
          </p>
          {venue.description && <p className="mt-0.5 text-xs text-gray-400 truncate">{venue.description}</p>}
        </div>
      </Link>
    </li>
  );
}

export default function VenueList({ title, venues, loading, error, onReset }) {
  return (
    <section className="mt-6 px-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-black text-gray-900">{title}</h2>
        {onReset ? (
          <button type="button" onClick={onReset} className="text-sm font-medium text-mint-600">
            전체 보기
          </button>
        ) : (
          !loading && !error && <span className="text-sm text-gray-500">{venues.length}곳</span>
        )}
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm">{error}</div>}

      {!error && (
        <ul className="space-y-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="h-[104px] bg-white rounded-2xl shadow-card animate-pulse" />
              ))
            : venues.map((v) => <VenueCard key={v.id} venue={v} />)}
        </ul>
      )}

      {!loading && !error && venues.length === 0 && (
        <div className="py-10 text-center bg-white rounded-2xl shadow-card">
          <p className="text-3xl">🥲</p>
          <p className="mt-2 text-sm text-gray-500">아직 이 종목의 운동 장소가 없어요.</p>
        </div>
      )}
    </section>
  );
}
