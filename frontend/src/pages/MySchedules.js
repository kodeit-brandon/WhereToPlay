import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import MyScheduleCard from '../components/MyScheduleCard';
import { fetchMySchedules } from '../api/me';
import { errorMessage } from '../api/auth';
import { parseLocal } from '../utils/datetime';

/** 다가오는 내 일정 전체 (월별로 묶어서) */
export default function MySchedules() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMySchedules()
      .then(setList)
      .catch((err) => setError(errorMessage(err, '일정을 불러오지 못했어요.')));
  }, []);

  const groups = [];
  (list || []).forEach((s) => {
    const d = parseLocal(s.start_at);
    const key = d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월` : '';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(s);
    else groups.push({ key, items: [s] });
  });

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-10 shadow-xl">
        <PageHeader title="다가오는 내 일정" back fallback="/my" />
        {error && <p className="m-4 p-4 rounded-2xl bg-red-50 text-sm text-red-600">{error}</p>}
        {!error && !list && <div className="m-4 h-40 bg-white rounded-2xl shadow-card animate-pulse" />}
        {list && list.length === 0 && (
          <div className="m-4 py-12 text-center bg-white rounded-2xl shadow-card">
            <p className="text-4xl" aria-hidden>
              🗓️
            </p>
            <p className="mt-3 text-sm text-gray-500">참석하기로 한 예정 일정이 없어요.</p>
            <Link to="/my-clubs" className="mt-3 inline-block text-sm font-bold text-mint-600">
              내 모임에서 일정 보기 ›
            </Link>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.key} className="mx-4 mt-5">
            <h2 className="mb-2 text-sm font-black text-gray-500">{g.key}</h2>
            <ul className="space-y-2">
              {g.items.map((s) => (
                <MyScheduleCard key={s.id} schedule={s} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
