import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPageHeader, formatAdminDate } from './AdminLayout';
import { useAdmin } from './AdminContext';
import { fetchAdminVenues } from '../api/admin';
import { sportEmoji } from '../components/VenueList';

function StatCard({ icon, label, value, sub, highlight, to }) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${highlight ? 'text-amber-800' : 'text-gray-500'}`}>{label}</span>
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
      </div>
      <p className={`mt-3 text-4xl font-black ${highlight ? 'text-amber-600' : 'text-gray-900'}`}>
        {value ?? '–'}
      </p>
      {sub && <p className={`mt-1 text-xs ${highlight ? 'text-amber-700' : 'text-gray-400'}`}>{sub}</p>}
    </>
  );
  const cls = `block p-6 rounded-2xl shadow-card transition ${
    highlight ? 'bg-amber-50 ring-2 ring-amber-300 hover:ring-amber-400' : 'bg-white hover:shadow-md'
  }`;
  return to ? (
    <Link to={to} className={cls} aria-label={`${label} ${value ?? ''}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function AdminDashboard() {
  const { stats, refreshStats } = useAdmin();
  const [pending, setPending] = useState(null);

  useEffect(() => {
    refreshStats();
    fetchAdminVenues('pending')
      .then((r) => setPending(r.venues))
      .catch(() => setPending([]));
  }, [refreshStats]);

  const pendingCount = stats?.venues.pending ?? 0;

  return (
    <>
      <AdminPageHeader title="대시보드" description="서비스 전체 현황을 한눈에 확인하세요." />

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard icon="👥" label="전체 회원" value={stats?.users} to="/admin/users" />
        <StatCard icon="🏸" label="전체 동호회" value={stats?.clubs} to="/admin/clubs" />
        <StatCard
          icon="📍"
          label="전체 장소"
          value={stats?.venues.total}
          sub={stats && `승인 ${stats.venues.approved} · 반려 ${stats.venues.rejected}`}
          to="/admin/venues?status=all"
        />
        <StatCard
          icon="⏳"
          label="승인 대기 장소"
          value={stats?.venues.pending}
          sub={pendingCount > 0 ? '검수가 필요해요 →' : '모두 처리했어요 ✨'}
          highlight={pendingCount > 0}
          to="/admin/venues?status=pending"
        />
      </section>

      <section className="mt-8 bg-white rounded-2xl shadow-card">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-lg font-black">최근 승인 대기 장소</h2>
          <Link to="/admin/venues?status=pending" className="text-sm font-bold text-mint-600 hover:underline">
            전체 보기 →
          </Link>
        </div>
        {!pending ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">승인 대기 중인 장소가 없어요 ✨</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pending.slice(0, 5).map((v) => (
              <li key={v.id}>
                <Link
                  to={`/admin/venues?status=pending&id=${v.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition"
                >
                  <span className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl" aria-hidden>
                    {sportEmoji(v.sport)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate">{v.name}</span>
                    <span className="block text-xs text-gray-500 truncate">{v.address}</span>
                  </span>
                  <span className="text-xs text-gray-500 text-right shrink-0">
                    <span className="block">제보 {v.submitted_by?.nickname || '-'}</span>
                    <span className="block text-gray-400">{formatAdminDate(v.created_at)}</span>
                  </span>
                  <span className="text-xs font-bold text-gray-400 shrink-0">동호회 {v.club_count}</span>
                  <span className="text-sm font-bold text-mint-600 shrink-0">검수하기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
