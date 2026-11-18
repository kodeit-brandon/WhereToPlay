import { Link } from 'react-router-dom';
import { BellIcon, ChevronDownIcon, SearchIcon } from './Icons';

export default function TopBar({ location = '송파구 잠실동' }) {
  return (
    <header className="sticky top-0 z-20 bg-white">
      <div className="flex items-center justify-between h-14 px-4">
        <button type="button" aria-label="알림" className="relative p-1.5 text-gray-800">
          <BellIcon />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>

        <button
          type="button"
          className="flex items-center gap-1 text-[17px] font-bold text-gray-900"
        >
          {location}
          <ChevronDownIcon className="w-4 h-4 text-gray-500" />
        </button>

        <Link to="/explore" aria-label="장소·동호회 검색" className="p-1.5 text-gray-800">
          <SearchIcon />
        </Link>
      </div>
    </header>
  );
}
