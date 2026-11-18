import { Link } from 'react-router-dom';
import { ChevronRightIcon, ClockIcon, PinIcon } from './Icons';

const STATUS_STYLE = {
  모집중: 'bg-mint-500 text-white',
  마감임박: 'bg-red-500 text-white',
  마감: 'bg-gray-400 text-white',
};

function MeetupCard({ meetup }) {
  return (
    <li className="snap-start shrink-0 w-44 bg-white rounded-2xl shadow-card overflow-hidden">
      <Link to={`/venues/${meetup.venueId}`} className="block active:scale-[0.98] transition">
        {/* 카드 이미지 영역 */}
        <div
          className={`relative h-28 bg-gradient-to-br ${meetup.gradient} flex items-center justify-center`}
        >
          <span className="text-5xl drop-shadow" aria-hidden>
            {meetup.emoji}
          </span>
          <span
            className={`absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[meetup.status]}`}
          >
            {meetup.status}
          </span>
          <span className="absolute bottom-2 right-2 text-[11px] font-medium text-white bg-black/30 rounded-full px-2 py-0.5">
            {meetup.joined}/{meetup.capacity}명
          </span>
        </div>

        <div className="p-3">
          <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug min-h-[2.5rem]">
            {meetup.title}
          </h3>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
            <ClockIcon /> {meetup.time}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 truncate">
            <PinIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{meetup.place}</span>
          </p>
        </div>
      </Link>
    </li>
  );
}

function MeetupSkeleton() {
  return (
    <li className="snap-start shrink-0 w-44 bg-white rounded-2xl shadow-card overflow-hidden animate-pulse">
      <div className="h-28 bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
    </li>
  );
}

export default function MeetupCarousel({ meetups, loading }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-lg font-black text-gray-900">오늘의 번개 모임 ⚡</h2>
        <button type="button" className="flex items-center text-sm text-gray-500">
          전체보기 <ChevronRightIcon />
        </button>
      </div>

      <ul className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-4 px-4 pb-2">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <MeetupSkeleton key={i} />)
          : meetups.map((m) => <MeetupCard key={m.id} meetup={m} />)}
      </ul>
    </section>
  );
}
