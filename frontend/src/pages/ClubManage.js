import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import { sportEmoji } from '../components/VenueList';
import { changeMemberRole, fetchClubMembers, removeMember, updateClub, updateMemberStatus } from '../api/clubs';
import { errorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

const ROLE_BADGE = {
  owner: 'bg-amber-100 text-amber-700',
  manager: 'bg-violet-100 text-violet-700',
  treasurer: 'bg-sky-100 text-sky-700',
  member: 'bg-gray-100 text-gray-600',
};

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(`${value.replace(' ', 'T')}Z`); // SQLite UTC 문자열
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ko-KR');
}

function PendingRow({ member, busy, onApprove, onReject }) {
  return (
    <li className="flex items-center gap-3 p-4">
      <Avatar src={member.profile_image} name={member.nickname} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 truncate">{member.nickname}</p>
        <p className="text-xs text-gray-400 truncate">
          {member.bio ? `${member.bio} · ` : ''}신청 {formatDate(member.applied_at)}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => onReject(member)}
          aria-label={`${member.nickname} 거절`}
          className="px-3 py-2 rounded-full bg-gray-100 text-gray-600 text-sm font-bold transition enabled:active:scale-95 disabled:opacity-50"
        >
          거절
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(member)}
          aria-label={`${member.nickname} 승인`}
          className="px-3 py-2 rounded-full bg-mint-500 text-white text-sm font-bold shadow-sm transition enabled:active:scale-95 disabled:opacity-50"
        >
          승인
        </button>
      </div>
    </li>
  );
}

/**
 * 기존 회원 한 줄. 권한에 따라 버튼이 달라진다.
 * - 방장: (방장·본인 제외) 운영진 지정/해제 + 내보내기
 * - 운영진: 일반 회원만 내보내기
 */
function MemberRow({ member, myRole, myId, busy, onToggleManager, onKick }) {
  const isSelf = member.user_id === myId;
  const isOwner = member.role === 'owner';
  const canChangeRole = myRole === 'owner' && !isOwner && !isSelf;
  const canKick = !isOwner && !isSelf && (myRole === 'owner' || (myRole === 'manager' && member.role === 'member'));

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar src={member.profile_image} name={member.nickname} size="w-10 h-10 text-sm" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 truncate">
          {member.nickname}
          {isSelf && <span className="ml-1 text-xs font-bold text-mint-600">(나)</span>}
        </p>
        <p className="text-xs text-gray-400">가입 {formatDate(member.joined_at)}</p>
      </div>
      <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[member.role] || ROLE_BADGE.member}`}>
        {member.role_label}
      </span>
      {(canChangeRole || canKick) && (
        <div className="flex gap-1 shrink-0">
          {canChangeRole && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onToggleManager(member)}
              aria-label={`${member.nickname} ${member.role === 'manager' ? '운영진 해제' : '운영진 지정'}`}
              className="px-2.5 py-1.5 rounded-full border border-violet-200 text-[11px] font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {member.role === 'manager' ? '운영진 해제' : '운영진 지정'}
            </button>
          )}
          {canKick && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onKick(member)}
              aria-label={`${member.nickname} 내보내기`}
              className="px-2.5 py-1.5 rounded-full border border-red-200 text-[11px] font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              내보내기
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** 동호회 이름 / 한 줄 소개 수정 */
function ClubInfoForm({ club, onSaved }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    const n = name.trim();
    const d = description.trim();
    if (n.length < 2 || n.length > 30) return setError('동호회 이름은 2~30자로 입력해 주세요.');
    if (!d || d.length > 60) return setError('한 줄 소개는 1~60자로 입력해 주세요.');
    setSaving(true);
    setError('');
    try {
      const res = await updateClub(club.id, { name: n, description: d });
      onSaved(res);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, '저장하지 못했어요.'));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const field =
    'w-full px-4 py-3 rounded-xl bg-gray-50 text-[15px] text-gray-900 border-2 border-transparent outline-none focus:border-mint-500';

  return (
    <section className="mx-4 mt-3 bg-white rounded-2xl shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-bold text-gray-700"
      >
        <span>✏️ 동호회 정보 수정</span>
        <span className="text-gray-400" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <form onSubmit={save} className="px-4 pb-4 space-y-3" aria-label="동호회 정보 수정">
          <label className="block">
            <span className="block mb-1 text-xs font-bold text-gray-500">동호회 이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} className={field} />
          </label>
          <div>
            <label className="block">
              <span className="block mb-1 text-xs font-bold text-gray-500">한 줄 소개</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={60} className={field} />
            </label>
            <span className="block mt-1 text-right text-[11px] text-gray-400">{description.length}/60</span>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-xl bg-mint-500 text-white text-sm font-black disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장하기'}
          </button>
        </form>
      )}
    </section>
  );
}

export default function ClubManage() {
  const { clubId } = useParams();
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    return fetchClubMembers(clubId)
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => {
        if (err?.response?.status === 401) logout();
        else setError(errorMessage(err, '회원 목록을 불러오지 못했어요.'));
      });
  }, [clubId, logout]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const changeStatus = async (member, status) => {
    setBusyId(member.user_id);
    try {
      const res = await updateMemberStatus(clubId, member.user_id, status);
      setData((d) => {
        const pending = d.pending.filter((p) => p.user_id !== member.user_id);
        const members = status === 'approved' ? [...d.members, res.member] : d.members;
        return { ...d, pending, members, club: { ...d.club, member_count: members.length } };
      });
      setToast(status === 'approved' ? `${member.nickname}님의 가입을 승인했어요 🎉` : `${member.nickname}님의 가입을 거절했어요.`);
    } catch (err) {
      if (err?.response?.status === 401) {
        logout();
        return;
      }
      window.alert(errorMessage(err, '처리하지 못했어요. 다시 시도해 주세요.'));
      // 다른 운영진이 먼저 처리했을 수 있으니 최신 상태로 다시 불러온다
      if (err?.response?.status === 409) load();
    } finally {
      setBusyId(null);
    }
  };

  const failWith = (err, fallback) => {
    if (err?.response?.status === 401) {
      logout();
      return;
    }
    window.alert(errorMessage(err, fallback));
    load(); // 다른 운영진이 먼저 처리했을 수 있으니 최신 상태로
  };

  const onToggleManager = async (member) => {
    const toManager = member.role !== 'manager';
    const msg = toManager
      ? `${member.nickname}님을 운영진으로 지정할까요?\n운영진은 가입 승인, 일정 관리, 일반 회원 내보내기를 할 수 있어요.`
      : `${member.nickname}님의 운영진 권한을 해제할까요?`;
    if (!window.confirm(msg)) return;
    setBusyId(member.user_id);
    try {
      const res = await changeMemberRole(clubId, member.user_id, toManager ? 'manager' : 'member');
      setData((d) => ({
        ...d,
        members: d.members.map((m) => (m.user_id === member.user_id ? { ...m, ...res.member } : m)),
      }));
      setToast(res.message);
    } catch (err) {
      failWith(err, '역할을 바꾸지 못했어요.');
    } finally {
      setBusyId(null);
    }
  };

  const onKick = async (member) => {
    if (!window.confirm(`${member.nickname}님을 동호회에서 내보낼까요?\n내보낸 회원은 다시 가입 신청을 할 수 없어요.`)) return;
    setBusyId(member.user_id);
    try {
      const res = await removeMember(clubId, member.user_id);
      setData((d) => {
        const members = d.members.filter((m) => m.user_id !== member.user_id);
        return { ...d, members, club: { ...d.club, member_count: members.length } };
      });
      setToast(res.message);
    } catch (err) {
      failWith(err, '내보내지 못했어요.');
    } finally {
      setBusyId(null);
    }
  };

  const onClubSaved = (res) => {
    setData((d) => ({ ...d, club: { ...d.club, ...res.club } }));
    setToast(res.message);
  };

  const onApprove = (member) => changeStatus(member, 'approved');
  const onReject = (member) => {
    if (window.confirm(`${member.nickname}님의 가입 신청을 거절하시겠습니까?`)) changeStatus(member, 'rejected');
  };

  const club = data?.club;

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="relative mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-10 shadow-xl">
        <PageHeader title="동호회 관리" back fallback="/my-clubs" />

        {error && (
          <div className="px-4 py-20 text-center">
            <p className="text-4xl">🔒</p>
            <p className="mt-3 text-sm text-gray-600">{error}</p>
            <Link
              to="/my-clubs"
              className="inline-block mt-5 px-5 py-2 rounded-full bg-mint-500 text-white text-sm font-bold"
            >
              내 모임으로
            </Link>
          </div>
        )}

        {!error && !data && (
          <div className="px-4 mt-4 space-y-3 animate-pulse">
            <div className="h-24 bg-white rounded-2xl shadow-card" />
            <div className="h-40 bg-white rounded-2xl shadow-card" />
            <div className="h-56 bg-white rounded-2xl shadow-card" />
          </div>
        )}

        {data && (
          <>
            {/* 동호회 요약 */}
            <section className="mx-4 mt-4 p-4 bg-white rounded-2xl shadow-card flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-mint-50 flex items-center justify-center text-3xl">
                <span aria-hidden>{sportEmoji(club.sport)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-gray-900 truncate">{club.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {club.venue_name} · 회원 {club.member_count}
                  {club.max_members ? `/${club.max_members}` : ''}명
                </p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[data.my_role]}`}>
                {data.my_role === 'owner' ? '방장' : '운영진'}
              </span>
            </section>

            {/* 동호회 이름 / 소개 수정 */}
            <ClubInfoForm key={club.id} club={club} onSaved={onClubSaved} />

            {/* 신규 가입 대기 */}
            <section className="mx-4 mt-5">
              <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-black text-gray-900">
                신규 가입 대기
                <span
                  className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] flex items-center justify-center
                    ${data.pending.length ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}
                >
                  {data.pending.length}
                </span>
              </h2>
              {data.pending.length > 0 ? (
                <ul className="bg-white rounded-2xl shadow-card divide-y divide-gray-100">
                  {data.pending.map((m) => (
                    <PendingRow
                      key={m.user_id}
                      member={m}
                      busy={busyId === m.user_id}
                      onApprove={onApprove}
                      onReject={onReject}
                    />
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center bg-white rounded-2xl shadow-card text-sm text-gray-400">
                  새로운 가입 신청이 없어요 ✨
                </div>
              )}
            </section>

            {/* 기존 회원 목록 */}
            <section className="mx-4 mt-6">
              <h2 className="mb-3 text-[15px] font-black text-gray-900">
                기존 회원 목록 <span className="text-mint-600">{data.members.length}</span>
              </h2>
              <ul className="bg-white rounded-2xl shadow-card divide-y divide-gray-100">
                {data.members.map((m) => (
                  <MemberRow
                    key={m.user_id}
                    member={m}
                    myRole={data.my_role}
                    myId={user?.id}
                    busy={busyId === m.user_id}
                    onToggleManager={onToggleManager}
                    onKick={onKick}
                  />
                ))}
              </ul>
            </section>
          </>
        )}

        {toast && (
          <div
            role="status"
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-[448px]
                       px-4 py-3 rounded-xl bg-gray-900/90 text-white text-sm text-center shadow-lg"
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
