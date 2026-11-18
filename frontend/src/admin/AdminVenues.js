import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageHeader, VenueStatusBadge, formatAdminDate } from './AdminLayout';
import { useAdmin } from './AdminContext';
import KakaoMapPreview from '../components/KakaoMapPreview';
import { sportEmoji } from '../components/VenueList';
import { deleteAdminVenue, fetchAdminVenue, fetchAdminVenues, mapLinks, updateAdminVenue } from '../api/admin';
import { errorMessage } from '../api/auth';
import { useSports } from '../sports/sportsStore';

const TABS = [
  ['pending', '승인 대기'],
  ['approved', '승인됨'],
  ['rejected', '반려됨'],
  ['all', '전체'],
];

const input =
  'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20';

function EditForm({ venue, onCancel, onSaved }) {
  const activeSports = useSports(); // GET /api/sports
  // 현재 종목이 비활성화돼 목록에 없더라도 선택지에 남겨 둔다
  const sportOptions = activeSports.some((s) => s.name === venue.sport)
    ? activeSports
    : [{ name: venue.sport, icon: sportEmoji(venue.sport), inactive: true }, ...activeSports];
  const [f, setF] = useState({
    name: venue.name,
    sport: venue.sport,
    address: venue.address,
    lat: String(venue.lat),
    lng: String(venue.lng),
    phone: venue.phone || '',
    description: venue.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (e) => setF((x) => ({ ...x, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await updateAdminVenue(venue.id, {
        ...f,
        lat: Number(f.lat),
        lng: Number(f.lng),
        phone: f.phone.trim() || null,
        description: f.description.trim() || null,
      });
      onSaved(res);
    } catch (err) {
      setError(errorMessage(err, '저장하지 못했어요.'));
      setSaving(false);
    }
  };

  const field = (name, label, props = {}) => (
    <label className="block">
      <span className="block mb-1 text-xs font-bold text-gray-500">{label}</span>
      <input name={name} value={f[name]} onChange={set} className={input} {...props} />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-3" aria-label="장소 정보 수정">
      <div className="grid grid-cols-2 gap-3">
        {field('name', '장소 이름', { maxLength: 30 })}
        <label className="block">
          <span className="block mb-1 text-xs font-bold text-gray-500">종목</span>
          <select name="sport" value={f.sport} onChange={set} className={input}>
            {sportOptions.map((s) => (
              <option key={s.name} value={s.name}>
                {s.icon} {s.name}
                {s.inactive ? ' (비활성)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {field('address', '주소', { maxLength: 100 })}
      <div className="grid grid-cols-3 gap-3">
        {field('lat', '위도', { inputMode: 'decimal' })}
        {field('lng', '경도', { inputMode: 'decimal' })}
        {field('phone', '전화번호', { maxLength: 20 })}
      </div>
      <label className="block">
        <span className="block mb-1 text-xs font-bold text-gray-500">설명</span>
        <textarea name="description" value={f.description} onChange={set} rows={2} maxLength={200} className={`${input} resize-none`} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">
          취소
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold disabled:opacity-50">
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </form>
  );
}

function DetailPanel({ id, onChanged, onDeleted }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setV(null);
    setEditing(false);
    setError('');
    fetchAdminVenue(id)
      .then((venue) => !cancelled && setV(venue))
      .catch((err) => !cancelled && setError(errorMessage(err, '장소 정보를 불러오지 못했어요.')));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const changeStatus = async (status) => {
    if (status === 'rejected' && !window.confirm(`'${v.name}' 장소를 반려할까요?\n반려되면 이 장소의 동호회는 지도·목록에 공개되지 않아요.`)) return;
    setBusy(true);
    try {
      const res = await updateAdminVenue(v.id, { status });
      setV((cur) => ({ ...cur, ...res.venue }));
      onChanged(res.venue, res.message);
    } catch (err) {
      window.alert(errorMessage(err, '처리하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`'${v.name}' 장소를 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      let res;
      try {
        res = await deleteAdminVenue(v.id);
      } catch (err) {
        // 이 장소를 쓰는 동호회가 있으면 한 번 더 확인 후 함께 삭제
        if (err?.response?.status === 409 && err.response.data?.club_count) {
          if (!window.confirm(`${err.response.data.error}\n\n그래도 삭제할까요?`)) return;
          res = await deleteAdminVenue(v.id, { force: true });
        } else throw err;
      }
      onDeleted(v.id, res.message);
    } catch (err) {
      window.alert(errorMessage(err, '삭제하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="p-10 text-center text-sm text-red-600">{error}</div>;
  if (!v) return <div className="p-6 space-y-4 animate-pulse"><div className="h-64 bg-gray-100 rounded-xl" /><div className="h-24 bg-gray-100 rounded-xl" /></div>;

  const links = mapLinks(v);

  return (
    <div className="flex flex-col h-full" aria-label="장소 상세 검수">
      <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <VenueStatusBadge status={v.status} />
            <span className="text-xs text-gray-400">#{v.id}</span>
          </div>
          <h2 className="mt-1.5 text-xl font-black truncate">
            <span aria-hidden>{sportEmoji(v.sport)} </span>
            {v.name}
          </h2>
          <p className="text-sm text-gray-500">{v.address}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {v.status !== 'approved' && (
            <button type="button" disabled={busy} onClick={() => changeStatus('approved')} className="px-4 py-2 rounded-lg bg-mint-500 text-white text-sm font-bold hover:bg-mint-600 disabled:opacity-50">
              ✓ 승인
            </button>
          )}
          {v.status !== 'rejected' && (
            <button type="button" disabled={busy} onClick={() => changeStatus('rejected')} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 disabled:opacity-50">
              반려
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => setEditing((x) => !x)} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
            {editing ? '수정 닫기' : '수정'}
          </button>
          <button type="button" disabled={busy} onClick={remove} className="px-4 py-2 rounded-lg text-gray-400 text-sm font-bold hover:text-red-600 hover:bg-red-50 disabled:opacity-50">
            삭제
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="rounded-xl overflow-hidden border border-gray-100">
          <KakaoMapPreview lat={v.lat} lng={v.lng} className="h-72 w-full" />
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50">
            <a href={links.kakaoRoadview} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-[#FEE500] text-gray-900 text-xs font-bold hover:brightness-95">
              🚶 카카오 로드뷰 보기
            </a>
            <a href={links.googleStreetView} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-800 text-xs font-bold hover:bg-gray-100">
              🌐 구글 스트리트뷰 보기
            </a>
            <a href={links.kakaoMap} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-800 text-xs font-bold hover:bg-gray-100">
              🗺️ 카카오맵에서 열기
            </a>
            <span className="ml-auto self-center text-xs text-gray-400 font-mono">
              {v.lat.toFixed(6)}, {v.lng.toFixed(6)}
            </span>
          </div>
        </div>

        {editing ? (
          <EditForm
            venue={v}
            onCancel={() => setEditing(false)}
            onSaved={(res) => {
              setV((cur) => ({ ...cur, ...res.venue }));
              setEditing(false);
              onChanged(res.venue, res.message);
            }}
          />
        ) : (
          <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-sm">
            <dt className="text-gray-400">종목</dt>
            <dd className="font-medium">{v.sport}</dd>
            <dt className="text-gray-400">설명</dt>
            <dd className="font-medium whitespace-pre-line">{v.description || '-'}</dd>
            <dt className="text-gray-400">전화번호</dt>
            <dd className="font-medium">{v.phone || '-'}</dd>
            <dt className="text-gray-400">제보자</dt>
            <dd className="font-medium">
              {v.submitted_by ? `${v.submitted_by.nickname} (${v.submitted_by.email})` : '관리자 등록'}
            </dd>
            <dt className="text-gray-400">등록일</dt>
            <dd className="font-medium">{formatAdminDate(v.created_at, true)}</dd>
          </dl>
        )}

        <div>
          <h3 className="text-sm font-black text-gray-900">이 장소의 동호회 {v.clubs.length}개</h3>
          {v.clubs.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">아직 이 장소를 쓰는 동호회가 없어요.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {v.clubs.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-bold">{c.name}</span>
                  <span className="text-gray-500">
                    방장 {c.owner_nickname} · 회원 {c.member_count}명
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminVenues() {
  const { refreshStats } = useAdmin();
  const [params, setParams] = useSearchParams();
  const status = TABS.some(([k]) => k === params.get('status')) ? params.get('status') : 'pending';
  const selectedId = Number(params.get('id')) || null;
  const [data, setData] = useState(null); // { venues, counts }
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    fetchAdminVenues(status)
      .then(setData)
      .catch((err) => setData({ venues: [], counts: null, error: errorMessage(err, '목록을 불러오지 못했어요.') }));
  }, [status]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const select = (id, replace = false) => {
    const next = new URLSearchParams(params);
    if (id) next.set('id', String(id));
    else next.delete('id');
    setParams(next, { replace });
  };

  const shown = useMemo(() => {
    const list = data?.venues || [];
    const k = q.trim().toLowerCase();
    return k ? list.filter((v) => `${v.name} ${v.address} ${v.submitted_by?.nickname || ''}`.toLowerCase().includes(k)) : list;
  }, [data, q]);

  // 선택된 게 없으면 첫 항목 자동 선택
  useEffect(() => {
    if (data && !selectedId && shown.length > 0) select(shown[0].id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedId, shown]);

  const refreshCounts = () =>
    fetchAdminVenues(status)
      .then((r) => setData((d) => (d ? { ...d, counts: r.counts } : d)))
      .catch(() => {});

  const onChanged = (venue, message) => {
    setToast(message);
    refreshStats();
    const list = data?.venues || [];
    const stillInTab = status === 'all' || venue.status === status;
    if (stillInTab) {
      setData((d) => ({ ...d, venues: d.venues.map((x) => (x.id === venue.id ? { ...x, ...venue } : x)) }));
    } else {
      // 현재 탭에서 빠지면 목록에서 제거하고 다음 항목을 선택 → 연속 검수
      const idx = list.findIndex((x) => x.id === venue.id);
      const rest = list.filter((x) => x.id !== venue.id);
      setData((d) => ({ ...d, venues: d.venues.filter((x) => x.id !== venue.id) }));
      select((rest[idx] || rest[idx - 1])?.id ?? null, true);
    }
    refreshCounts();
  };

  const onDeleted = (id, message) => {
    setToast(message);
    refreshStats();
    const idx = (data?.venues || []).findIndex((x) => x.id === id);
    const venues = (data?.venues || []).filter((x) => x.id !== id);
    setData((d) => ({ ...d, venues }));
    select((venues[idx] || venues[idx - 1])?.id ?? null, true);
    refreshCounts();
  };

  return (
    <>
      <AdminPageHeader title="장소 검수·관리" description="유저가 제보한 장소를 확인하고 승인하거나 반려하세요." />

      <div className="flex items-center gap-3 mb-4">
        <div className="flex p-1 rounded-xl bg-white shadow-card" role="tablist" aria-label="장소 상태">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={status === key}
              onClick={() => setParams({ status: key })}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                status === key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {label}
              {data?.counts && (
                <span className={`ml-1.5 ${status === key ? 'text-white/70' : key === 'pending' && data.counts.pending ? 'text-amber-600' : 'text-gray-400'}`}>
                  {data.counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="장소명·주소·제보자 검색"
          aria-label="장소 검색"
          className="ml-auto w-72 px-4 py-2.5 rounded-xl bg-white shadow-card text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
        />
      </div>

      <div className="flex gap-5 h-[calc(100vh-200px)] min-h-[560px]">
        {/* 좌측 리스트 */}
        <ul className="w-[380px] shrink-0 bg-white rounded-2xl shadow-card overflow-y-auto divide-y divide-gray-100" aria-label="장소 목록">
          {!data && [0, 1, 2, 3].map((i) => <li key={i} className="h-20 m-3 rounded-xl bg-gray-100 animate-pulse" />)}
          {data?.error && <li className="p-6 text-sm text-red-600">{data.error}</li>}
          {data && !data.error && shown.length === 0 && (
            <li className="p-10 text-center text-sm text-gray-400">{status === 'pending' ? '승인 대기 중인 장소가 없어요 ✨' : '장소가 없어요.'}</li>
          )}
          {shown.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => select(v.id)}
                aria-current={selectedId === v.id ? 'true' : undefined}
                className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition border-l-4 ${
                  selectedId === v.id ? 'bg-mint-50 border-mint-500' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <span className="text-xl mt-0.5" aria-hidden>
                  {sportEmoji(v.sport)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-bold truncate">{v.name}</span>
                    {status === 'all' && <VenueStatusBadge status={v.status} />}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">{v.address}</span>
                  <span className="block mt-0.5 text-[11px] text-gray-400">
                    {v.submitted_by ? `제보 ${v.submitted_by.nickname}` : '관리자 등록'} · {formatAdminDate(v.created_at)} · 동호회 {v.club_count}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* 우측 상세 패널 */}
        <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-card overflow-hidden">
          {selectedId ? (
            <DetailPanel key={selectedId} id={selectedId} onChanged={onChanged} onDeleted={onDeleted} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">왼쪽 목록에서 장소를 선택하세요.</div>
          )}
        </section>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-8 left-[calc(50%+7.5rem)] -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-gray-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
