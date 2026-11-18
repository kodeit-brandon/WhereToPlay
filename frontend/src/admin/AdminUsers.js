import { useEffect, useMemo, useState } from 'react';
import { AdminPageHeader, formatAdminDate } from './AdminLayout';
import { EmptyRow, SearchBox, Table } from './AdminTable';
import { fetchAdminUsers, setUserAdmin } from '../api/admin';
import { errorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

const COLUMNS = [
  { label: 'ID', className: 'w-14' },
  { label: '닉네임' },
  { label: '이메일' },
  { label: '가입일' },
  { label: '가입 동호회', className: 'text-right' },
  { label: '운영 동호회', className: 'text-right' },
  { label: '최고 관리자', className: 'text-center w-32' },
];

function Toggle({ checked, disabled, onChange, label, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed
        ${checked ? 'bg-mint-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [onlyAdmins, setOnlyAdmins] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch((err) => setError(errorMessage(err, '회원 목록을 불러오지 못했어요.')));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (users || []).filter(
      (u) => (!onlyAdmins || u.is_admin) && (!k || `${u.nickname} ${u.email}`.toLowerCase().includes(k))
    );
  }, [users, q, onlyAdmins]);

  const toggle = async (u) => {
    const next = !u.is_admin;
    const msg = next
      ? `${u.nickname}(${u.email})님에게 최고 관리자 권한을 부여할까요?\n모든 장소·동호회·회원을 관리할 수 있게 됩니다.`
      : `${u.nickname}님의 최고 관리자 권한을 해제할까요?`;
    if (!window.confirm(msg)) return;
    setBusyId(u.id);
    try {
      const res = await setUserAdmin(u.id, next);
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, is_admin: next } : x)));
      setToast(res.message);
    } catch (err) {
      window.alert(errorMessage(err, '변경하지 못했어요.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="회원 관리"
        description={users ? `전체 ${users.length}명 · 관리자 ${users.filter((u) => u.is_admin).length}명` : '전체 회원 목록'}
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
              <input type="checkbox" checked={onlyAdmins} onChange={(e) => setOnlyAdmins(e.target.checked)} className="accent-mint-500" />
              관리자만
            </label>
            <SearchBox value={q} onChange={setQ} placeholder="닉네임·이메일 검색" label="회원 검색" />
          </div>
        }
      />

      {error ? (
        <p className="p-6 bg-white rounded-2xl text-sm text-red-600">{error}</p>
      ) : (
        <Table columns={COLUMNS} label="회원 목록">
          {!users && <EmptyRow colSpan={COLUMNS.length}>불러오는 중…</EmptyRow>}
          {users && shown.length === 0 && <EmptyRow colSpan={COLUMNS.length}>조건에 맞는 회원이 없어요.</EmptyRow>}
          {shown.map((u) => {
            const isMe = u.id === me?.id;
            return (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400">{u.id}</td>
                <td className="px-4 py-3 font-bold">
                  {u.nickname}
                  {isMe && <span className="ml-1.5 text-xs font-bold text-mint-600">(나)</span>}
                  {u.is_admin && <span className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded bg-gray-900 text-white">ADMIN</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatAdminDate(u.created_at)}</td>
                <td className="px-4 py-3 text-right font-bold">{u.club_count}</td>
                <td className="px-4 py-3 text-right">{u.owned_club_count}</td>
                <td className="px-4 py-3 text-center">
                  <Toggle
                    checked={u.is_admin}
                    disabled={busyId === u.id || (isMe && u.is_admin)}
                    title={isMe && u.is_admin ? '본인의 관리자 권한은 해제할 수 없어요' : undefined}
                    label={`${u.nickname} 최고 관리자 권한`}
                    onChange={() => toggle(u)}
                  />
                </td>
              </tr>
            );
          })}
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
