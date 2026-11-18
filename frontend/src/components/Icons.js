// 아이콘 라이브러리 없이 쓰는 간단한 인라인 SVG 아이콘 모음
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
};

export const BellIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export const SearchIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const ChevronDownIcon = ({ className = 'w-4 h-4' }) => (
  <svg {...base} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ChevronRightIcon = ({ className = 'w-4 h-4' }) => (
  <svg {...base} className={className}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const HomeIcon = ({ className = 'w-6 h-6', filled }) => (
  <svg {...base} fill={filled ? 'currentColor' : 'none'} className={className}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const UsersIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const ChatIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />
  </svg>
);

export const UserIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const PinIcon = ({ className = 'w-3.5 h-3.5' }) => (
  <svg {...base} className={className}>
    <path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

export const ClockIcon = ({ className = 'w-3.5 h-3.5' }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const ChevronLeftIcon = ({ className = 'w-6 h-6' }) => (
  <svg {...base} className={className}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const PhoneIcon = ({ className = 'w-3.5 h-3.5' }) => (
  <svg {...base} className={className}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
