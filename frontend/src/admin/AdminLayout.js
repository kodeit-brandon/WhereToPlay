import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AdminContext } from './AdminContext';
import { fetchAdminStats } from '../api/admin';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/admin', end: true, icon: '📊', label: '대시보드' },
  { to: '/admin/venues', icon: '📍', label: '장소 검수·관리', badge: 'pending' },
  { to: '/admin/clubs', icon: '🏸', label: '동호회 관리' },
  { to: '/admin/users', icon: '👥', label: '회원 관리' },
  { to: '/admin/sports', icon: '🏅', label: '종목 관리' },
];

/**
 * /admin/* 전용 PC 레이아웃 (모바일 480px 제한 없음)
 * 좌측 고정 사이드바 + 우측 메인 컨텐츠
 */
export default function AdminLayout() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  const refreshStats = useCallback(() => {
    fetchAdminStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const ctx = useMemo(() => ({ stats, refreshStats }), [stats, refreshStats]);

  return (
    <AdminContext.Provider value={ctx}>
      <div className="min-h-screen bg-gray-100 text-gray-900">
        {/* 사이드바 */}
        <aside className="fixed inset-y-0 left-0 w-60 bg-gray-900 text-gray-300 flex flex-col">
          <div className="px-6 py-6 border-b border-white/10">
            <p className="text-lg font-black text-white">
              Where<span className="text-mint-400">To</span>Play
            </p>
            <p className="mt-0.5 text-xs font-bold text-gray-500 tracking-wide">SUPER ADMIN</p>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1" aria-label="관리자 메뉴">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition
                   ${isActive ? 'bg-mint-500 text-white' : 'hover:bg-white/5 hover:text-white'}`
                }
              >
                <span aria-hidden>{n.icon}</span>
                <span className="flex-1">{n.label}</span>
                {n.badge === 'pending' && stats?.venues.pending > 0 && (
                  <span
                    className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-400 text-gray-900 text-[11px] font-black flex items-center justify-center"
                    aria-label={`승인 대기 ${stats.venues.pending}건`}
                  >
                    {stats.venues.pending}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="px-3 py-4 border-t border-white/10 space-y-3">
            <div className="px-3 text-xs">
              <p className="font-bold text-white truncate">{user?.nickname}</p>
              <p className="text-gray-500 truncate">{user?.email}</p>
            </div>
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold hover:bg-white/5 hover:text-white transition"
            >
              <span aria-hidden>↩️</span>서비스로 돌아가기
            </Link>
          </div>
        </aside>

        {/* 메인 */}
        <main className="ml-60 min-h-screen">
          <div className="max-w-[1400px] mx-auto px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </AdminContext.Provider>
  );
}

/** 관리자 화면 공통 페이지 제목 */
export function AdminPageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export const VENUE_STATUS_META = {
  pending: { label: '승인 대기', className: 'bg-amber-100 text-amber-800' },
  approved: { label: '승인됨', className: 'bg-mint-100 text-mint-700' },
  rejected: { label: '반려됨', className: 'bg-red-100 text-red-700' },
};

export function VenueStatusBadge({ status }) {
  const meta = VENUE_STATUS_META[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${meta.className}`}>{meta.label}</span>;
}

/** SQLite UTC 문자열 → 'YYYY. M. D.' */
export function formatAdminDate(value, withTime = false) {
  if (!value) return '-';
  const d = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return withTime ? d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString('ko-KR');
}
