import { useNavigate } from 'react-router-dom';
import { ChatIcon, HomeIcon, SearchIcon, UserIcon, UsersIcon } from './Icons';

// path가 없는 탭은 아직 화면이 없어서 눌러도 이동하지 않는다
const TABS = [
  { key: 'home', label: '홈', Icon: HomeIcon, path: '/' },
  { key: 'search', label: '검색', Icon: SearchIcon, path: '/explore' },
  { key: 'meetups', label: '내 모임', Icon: UsersIcon, path: '/my-clubs' },
  { key: 'chat', label: '채팅', Icon: ChatIcon },
  // /my 는 로그인 안 된 경우 /login 으로 보내준다
  { key: 'my', label: '마이페이지', Icon: UserIcon, path: '/my' },
];

export default function BottomNav({ active = 'home' }) {
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-30 w-full max-w-[480px] bg-white shadow-nav rounded-t-2xl">
      <ul className="grid grid-cols-5 h-16 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ key, label, Icon, path }) => {
          const isActive = key === active;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => path && !isActive && navigate(path)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full h-full flex flex-col items-center justify-center gap-0.5 text-[11px]
                  ${isActive ? 'text-mint-500 font-bold' : 'text-gray-400 font-medium'}`}
              >
                <Icon className="w-6 h-6" filled={isActive} />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
