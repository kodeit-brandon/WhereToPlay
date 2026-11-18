import { useEffect, useMemo, useState } from 'react';
import { AdminPageHeader, VenueStatusBadge, formatAdminDate } from './AdminLayout';
import { useAdmin } from './AdminContext';
import { EmptyRow, SearchBox, Table } from './AdminTable';
import { sportEmoji } from '../components/VenueList';
import { deleteAdminClub, fetchAdminClubs } from '../api/admin';
import { errorMessage } from '../api/auth';

const RECRUIT = { recruiting: '모집중', closing_soon: '마감임박', closed: '모집마감' };
const COLUMNS = [
  { label: 'ID', className: 'w-14' },
  { label: '동호회' },
  { label: '장소' },
  { label: '장소 상태' },
  { label: '회원', className: 'text-right' },
  { label: '가입 대기', className: 'text-right' },
  { label: '방장' },
  { label: '개설일' },
  { label: '', key: 'actions', className: 'w-20' },
];

export default function AdminClubs() {
  const { refreshStats } = useAdmin();
  const [clubs, setClubs] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [venueFilter, setVenueFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchAdminClubs()
      .then(setClubs)
      .catch((err) => setError(errorMessage(err, '동호회 목록을 불러오지 못했어요.')));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (clubs || []).filter(
      (c) =>
        (venueFilter === 'all' || c.venue.status === venueFilter) &&
        (!k || `${c.name} ${c.venue.name} ${c.owner.nickname} ${c.owner.email}`.toLowerCase().includes(k))
    );
  }, [clubs, q, venueFilter]);

  const remove = async (c) => {
    if (
      !window.confirm(
        `'${c.name}' 동호회를 삭제할까요?\n회원 ${c.member_count}명의 가입 정보, 일정 ${c.schedule_count}개, 단체 채팅이 모두 함께 삭제되며 되돌릴 수 없어요.`
      )
    )
      return;
    setDeletingId(c.id);
    try {
      const res = await deleteAdminClub(c.id);
      setClubs((list) => list.filter((x) => x.id !== c.id));
      setToast(res.message);
      refreshStats();
    } catch (err) {
      window.alert(errorMessage(err, '삭제하지 못했어요.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="동호회 관리"
        description={clubs ? `전체 ${clubs.length}개 · 검색 결과 ${shown.length}개` : '전체 동호회 목록'}
        actions={
          <div className="flex gap-2">
            <select
              value={venueFilter}
              onChange={(e) => setVenueFilter(e.target.value)}
              aria-label="장소 상태 필터"
              className="px-3 py-2.5 rounded-xl bg-white shadow-card text-sm outline-none"
            >
              <option value="all">장소 상태: 전체</option>
              <option value="approved">승인됨</option>
              <option value="pending">승인 대기</option>
              <option value="rejected">반려됨</option>
            </select>
            <SearchBox value={q} onChange={setQ} placeholder="동호회명·장소·방장 검색" label="동호회 검색" />
          </div>
        }
      />

      {error ? (
        <p className="p-6 bg-white rounded-2xl text-sm text-red-600">{error}</p>
      ) : (
        <Table columns={COLUMNS} label="동호회 목록">
          {!clubs && <EmptyRow colSpan={COLUMNS.length}>불러오는 중…</EmptyRow>}
          {clubs && shown.length === 0 && <EmptyRow colSpan={COLUMNS.length}>조건에 맞는 동호회가 없어요.</EmptyRow>}
          {shown.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-400">{c.id}</td>
              <td className="px-4 py-3">
                <p className="font-bold">
                  <span aria-hidden>{sportEmoji(c.venue.sport)} </span>
                  {c.name}
                </p>
                <p className="text-xs text-gray-400">
                  {RECRUIT[c.recruit_status]}
                  {!c.is_public && ' · 비공개'}
                </p>
              </td>
              <td className="px-4 py-3 text-gray-700">{c.venue.name}</td>
              <td className="px-4 py-3">
                <VenueStatusBadge status={c.venue.status} />
              </td>
              <td className="px-4 py-3 text-right font-bold">
                {c.member_count}
                {c.max_members ? <span className="text-gray-400 font-normal">/{c.max_members}</span> : null}
              </td>
              <td className="px-4 py-3 text-right">{c.pending_count > 0 ? <span className="font-bold text-amber-600">{c.pending_count}</span> : <span className="text-gray-300">0</span>}</td>
              <td className="px-4 py-3">
                <p>{c.owner.nickname}</p>
                <p className="text-xs text-gray-400">{c.owner.email}</p>
              </td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatAdminDate(c.created_at)}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => remove(c)}
                  disabled={deletingId === c.id}
                  aria-label={`${c.name} 삭제`}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === c.id ? '삭제 중' : '삭제'}
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {toast && (
        <div role="status" className="fixed bottom-8 left-[calc(50%+7.5rem)] -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-gray-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
