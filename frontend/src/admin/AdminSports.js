import { useEffect, useState } from 'react';
import { AdminPageHeader } from './AdminLayout';
import { EmptyRow, Table } from './AdminTable';
import { createAdminSport, deleteAdminSport, fetchAdminSports, updateAdminSport } from '../api/admin';
import { errorMessage } from '../api/auth';
import { refreshSports } from '../sports/sportsStore';

const EMOJI_PICKS = ['⚽', '🏀', '🏐', '⚾', '🎾', '🏸', '🏓', '🏃', '🧗', '🏊', '🚴', '⛳', '🥊', '🎳', '🛹', '🏒', '🥏', '🏋️', '🧘', '🎲'];
const COLUMNS = [
  { label: '순서', className: 'w-24' },
  { label: '아이콘', className: 'w-20' },
  { label: '종목명' },
  { label: '등록된 장소', className: 'text-right w-32' },
  { label: '활성', className: 'text-center w-24' },
  { label: '', key: 'actions', className: 'w-40' },
];
const input =
  'px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20';
const byOrder = (a, b) => a.sort_order - b.sort_order || a.id - b.id;

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-40 ${checked ? 'bg-mint-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

/** 상단 '새 종목 추가' 폼 */
function AddSportForm({ onAdded }) {
  const [f, setF] = useState({ icon: '', name: '', sort_order: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (e) => setF((x) => ({ ...x, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.icon.trim()) return setError('아이콘(이모지)을 골라 주세요.');
    if (!f.name.trim()) return setError('종목명을 입력해 주세요.');
    setSaving(true);
    setError('');
    try {
      const res = await createAdminSport({
        icon: f.icon.trim(),
        name: f.name.trim(),
        sort_order: f.sort_order === '' ? undefined : Number(f.sort_order),
      });
      setF({ icon: '', name: '', sort_order: '' });
      onAdded(res);
    } catch (err) {
      setError(errorMessage(err, '종목을 추가하지 못했어요.'));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <form onSubmit={submit} aria-label="새 종목 추가" className="mb-6 p-5 bg-white rounded-2xl shadow-card">
      <h2 className="text-sm font-black text-gray-900">＋ 새 종목 추가</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block mb-1 text-xs font-bold text-gray-500">아이콘</span>
          <input name="icon" value={f.icon} onChange={set} placeholder="🏸" maxLength={8} className={`${input} w-20 text-center text-lg`} />
        </label>
        <label className="block flex-1 min-w-[200px]">
          <span className="block mb-1 text-xs font-bold text-gray-500">종목명</span>
          <input name="name" value={f.name} onChange={set} placeholder="예) 피클볼" maxLength={20} className={`${input} w-full`} />
        </label>
        <label className="block">
          <span className="block mb-1 text-xs font-bold text-gray-500">노출 순서</span>
          <input name="sort_order" value={f.sort_order} onChange={set} inputMode="numeric" placeholder="비우면 맨 뒤" className={`${input} w-32`} />
        </label>
        <button type="submit" disabled={saving} className="h-[38px] px-5 rounded-lg bg-gray-900 text-white text-sm font-bold disabled:opacity-50">
          {saving ? '추가 중…' : '추가'}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1" aria-label="아이콘 빠른 선택">
        {EMOJI_PICKS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => setF((x) => ({ ...x, icon: em }))}
            aria-label={`아이콘 ${em} 선택`}
            className={`w-9 h-9 rounded-lg text-lg hover:bg-gray-100 ${f.icon === em ? 'bg-mint-50 ring-2 ring-mint-500' : ''}`}
          >
            {em}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

/** 표 한 줄 (보기 ↔ 수정) */
function SportRow({ sport, busy, onSave, onToggle, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ icon: sport.icon, name: sport.name, sort_order: String(sport.sort_order) });
  const set = (e) => setF((x) => ({ ...x, [e.target.name]: e.target.value }));

  const startEdit = () => {
    setF({ icon: sport.icon, name: sport.name, sort_order: String(sport.sort_order) });
    setEditing(true);
  };
  const save = async () => {
    const ok = await onSave(sport, { icon: f.icon.trim(), name: f.name.trim(), sort_order: f.sort_order === '' ? undefined : Number(f.sort_order) });
    if (ok) setEditing(false);
  };

  return (
    <tr className={`hover:bg-gray-50 ${sport.is_active ? '' : 'bg-gray-50/60 text-gray-400'}`}>
      <td className="px-4 py-3">
        {editing ? (
          <input name="sort_order" value={f.sort_order} onChange={set} inputMode="numeric" aria-label="노출 순서" className={`${input} w-20`} />
        ) : (
          <span className="font-mono text-gray-500">{sport.sort_order}</span>
        )}
      </td>
      <td className="px-4 py-3 text-2xl">
        {editing ? (
          <input name="icon" value={f.icon} onChange={set} maxLength={8} aria-label="아이콘" className={`${input} w-16 text-center text-lg`} />
        ) : (
          <span aria-hidden>{sport.icon}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <input name="name" value={f.name} onChange={set} maxLength={20} aria-label="종목명" className={`${input} w-56`} />
        ) : (
          <span className={`font-bold ${sport.is_active ? 'text-gray-900' : ''}`}>
            {sport.name}
            {!sport.is_active && <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">비활성</span>}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <b className={sport.venue_count ? 'text-gray-900' : 'text-gray-300'}>{sport.venue_count}</b>
        <span className="text-xs text-gray-400">곳</span>
        {sport.venue_count > 0 && <span className="block text-[11px] text-gray-400">공개 {sport.approved_venue_count}</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <Toggle checked={sport.is_active} disabled={busy || editing} onChange={() => onToggle(sport)} label={`${sport.name} 활성 상태`} />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {editing ? (
          <>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100">
              취소
            </button>
            <button type="button" disabled={busy} onClick={save} className="ml-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-bold disabled:opacity-50">
              저장
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={startEdit}
              aria-label={`${sport.name} 수정`}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100"
            >
              수정
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(sport)}
              aria-label={`${sport.name} 삭제`}
              className="ml-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50"
            >
              삭제
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

export default function AdminSports() {
  const [sports, setSports] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchAdminSports()
      .then((list) => setSports([...list].sort(byOrder)))
      .catch((err) => setError(errorMessage(err, '종목 목록을 불러오지 못했어요.')));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // 서버 반영 후: 표 갱신 + 유저 화면(필터 칩·드롭다운)이 쓰는 종목 목록도 다시 불러오기
  const applyChange = (sport, message) => {
    setSports((list) => [...list.filter((x) => x.id !== sport.id), sport].sort(byOrder));
    setToast(message);
    refreshSports();
  };

  const onAdded = (res) => applyChange(res.sport, res.message);

  const onSave = async (sport, body) => {
    if (body.name && body.name !== sport.name && sport.venue_count > 0) {
      const ok = window.confirm(
        `종목명을 '${sport.name}' → '${body.name}'(으)로 바꿀까요?\n이 종목을 쓰는 장소 ${sport.venue_count}곳의 종목명도 함께 바뀝니다.`
      );
      if (!ok) return false;
    }
    setBusyId(sport.id);
    try {
      const res = await updateAdminSport(sport.id, body);
      applyChange(res.sport, res.message);
      return true;
    } catch (err) {
      window.alert(errorMessage(err, '저장하지 못했어요.'));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const onToggle = async (sport) => {
    if (sport.is_active && !window.confirm(`'${sport.name}' 종목을 비활성화할까요?\n탐색 필터와 새 장소 등록에서 숨겨집니다. (기존 장소는 그대로)`)) return;
    setBusyId(sport.id);
    try {
      const res = await updateAdminSport(sport.id, { is_active: !sport.is_active });
      applyChange(res.sport, res.message);
    } catch (err) {
      window.alert(errorMessage(err, '변경하지 못했어요.'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (sport) => {
    if (!window.confirm(`'${sport.name}' 종목을 삭제할까요?`)) return;
    setBusyId(sport.id);
    try {
      const res = await deleteAdminSport(sport.id);
      setSports((list) => list.filter((x) => x.id !== sport.id));
      setToast(res.message);
      refreshSports();
    } catch (err) {
      const data = err?.response?.data;
      // 사용 중인 종목이면 삭제 대신 비활성화를 권한다
      if (err?.response?.status === 409 && data?.can_deactivate) {
        if (window.confirm(`${data.error}\n\n지금 비활성화할까요?`)) {
          try {
            const res = await updateAdminSport(sport.id, { is_active: false });
            applyChange(res.sport, res.message);
          } catch (e2) {
            window.alert(errorMessage(e2, '비활성화하지 못했어요.'));
          }
        }
      } else {
        window.alert(errorMessage(err, '삭제하지 못했어요.'));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="종목 관리"
        description={
          sports
            ? `전체 ${sports.length}개 · 활성 ${sports.filter((s) => s.is_active).length}개 — 탐색 필터, 메인 카테고리, 장소 등록 드롭다운에 순서대로 노출돼요.`
            : '서비스 전체에서 쓰는 운동 종목을 관리해요.'
        }
      />
      <AddSportForm onAdded={onAdded} />
      {error ? (
        <p className="p-6 bg-white rounded-2xl text-sm text-red-600">{error}</p>
      ) : (
        <Table columns={COLUMNS} label="종목 목록">
          {!sports && <EmptyRow colSpan={COLUMNS.length}>불러오는 중…</EmptyRow>}
          {sports && sports.length === 0 && <EmptyRow colSpan={COLUMNS.length}>등록된 종목이 없어요.</EmptyRow>}
          {sports?.map((s) => (
            <SportRow key={s.id} sport={s} busy={busyId === s.id} onSave={onSave} onToggle={onToggle} onDelete={onDelete} />
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
