import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import MyScheduleCard from '../components/MyScheduleCard';
import { useAuth } from '../auth/AuthContext';
import { changePassword, fetchMySchedules, updateProfile } from '../api/me';
import { errorMessage } from '../api/auth';

const NICKNAME_MAX = 20;
const BIO_MAX = 100;
const PREVIEW_COUNT = 3;

const field =
  'w-full px-4 py-3 rounded-xl bg-gray-50 text-[15px] text-gray-900 placeholder-gray-300 border-2 border-transparent outline-none transition focus:border-mint-500 focus:bg-white';

function formatDate(value) {
  if (!value) return '-';
  // SQLite CURRENT_TIMESTAMP는 UTC 문자열("YYYY-MM-DD HH:MM:SS")
  const d = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ko-KR');
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-3.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 truncate ml-4">{value || '-'}</span>
    </div>
  );
}

function FieldError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  );
}

/* ---------- 프로필 카드 (보기 ↔ 수정) ---------- */
function ProfileCard({ user, onSaved }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = () => {
    setNickname(user?.nickname || '');
    setBio(user?.bio || '');
    setError('');
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const n = nickname.replace(/\s+/g, ' ').trim();
    if (!n) return setError('닉네임을 입력해 주세요. 공백만으로는 만들 수 없어요.');
    if (n.length > NICKNAME_MAX) return setError(`닉네임은 ${NICKNAME_MAX}자 이내로 입력해 주세요.`);
    if (bio.trim().length > BIO_MAX) return setError(`한 줄 소개는 ${BIO_MAX}자 이내로 입력해 주세요.`);
    setSaving(true);
    setError('');
    try {
      const res = await updateProfile({ nickname: n, bio: bio.trim() });
      updateUser(res.user, res.token); // 화면에 즉시 반영
      setEditing(false);
      onSaved('프로필이 저장되었어요 ✨');
    } catch (err) {
      setError(errorMessage(err, '프로필을 저장하지 못했어요.'));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const avatar = (
    <div className="w-16 h-16 shrink-0 rounded-full bg-mint-50 flex items-center justify-center overflow-hidden text-2xl font-black text-mint-600">
      {user?.profile_image ? (
        <img src={user.profile_image} alt="" className="w-full h-full object-cover" />
      ) : (
        ((editing ? nickname.trim() : user?.nickname) || '?').slice(0, 1)
      )}
    </div>
  );

  if (editing) {
    return (
      <section className="mx-4 mt-4 bg-white rounded-2xl shadow-card p-5">
        <form onSubmit={save} aria-label="프로필 수정" className="space-y-4">
          <div className="flex items-center gap-4">
            {avatar}
            <p className="text-sm text-gray-500">
              다른 회원에게 보이는 이름과 소개예요.
              <br />
              <span className="text-gray-400">{user?.email}</span>
            </p>
          </div>
          <div>
            <label className="block">
              <span className="block mb-1 text-xs font-bold text-gray-500">닉네임</span>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={NICKNAME_MAX} className={field} />
            </label>
            <span className="block mt-1 text-right text-[11px] text-gray-400">
              {nickname.length}/{NICKNAME_MAX}
            </span>
          </div>
          <div>
            <label className="block">
              <span className="block mb-1 text-xs font-bold text-gray-500">한 줄 소개</span>
              <input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={BIO_MAX}
                placeholder="예) 주말 배드민턴 좋아해요 🏸"
                className={field}
              />
            </label>
            <span className="block mt-1 text-right text-[11px] text-gray-400">
              {bio.length}/{BIO_MAX}
            </span>
          </div>
          <FieldError>{error}</FieldError>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 h-11 rounded-xl bg-gray-100 text-sm font-bold text-gray-600"
            >
              취소
            </button>
            <button type="submit" disabled={saving} className="flex-[2] h-11 rounded-xl bg-mint-500 text-white text-sm font-black disabled:opacity-50">
              {saving ? '저장 중…' : '저장하기'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="mx-4 mt-4 bg-white rounded-2xl shadow-card p-5 flex items-center gap-4">
      {avatar}
      <div className="flex-1 min-w-0">
        <p className="text-lg font-black text-gray-900 truncate">
          {user?.nickname || '회원'}님 <span aria-hidden>👋</span>
        </p>
        <p className="text-sm text-gray-500 truncate">{user?.email}</p>
        <p className={`mt-1 text-xs truncate ${user?.bio ? 'text-gray-500' : 'text-gray-300'}`}>
          {user?.bio || '한 줄 소개를 적어 보세요'}
        </p>
      </div>
      <button
        type="button"
        onClick={startEdit}
        className="shrink-0 self-start px-3 py-1.5 rounded-full border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
      >
        프로필 수정
      </button>
    </section>
  );
}

/* ---------- 다가오는 내 일정 ---------- */
function UpcomingSchedules() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMySchedules()
      .then((l) => !cancelled && setList(l))
      .catch((err) => !cancelled && setError(errorMessage(err, '일정을 불러오지 못했어요.')));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-4 mt-6" aria-labelledby="my-upcoming-title">
      <div className="flex items-center justify-between mb-3">
        <h2 id="my-upcoming-title" className="text-[15px] font-black text-gray-900">
          📅 다가오는 내 일정 {list && list.length > 0 && <span className="text-mint-600">{list.length}</span>}
        </h2>
        {list && list.length > PREVIEW_COUNT && (
          <Link to="/my/schedules" className="text-sm font-bold text-mint-600">
            전체 보기 ›
          </Link>
        )}
      </div>
      {error && <p className="p-4 rounded-2xl bg-red-50 text-sm text-red-600">{error}</p>}
      {!error && !list && (
        <div className="space-y-2 animate-pulse">
          {[0, 1].map((i) => (
            <div key={i} className="h-[92px] bg-white rounded-2xl shadow-card" />
          ))}
        </div>
      )}
      {list && list.length === 0 && (
        <div className="py-8 text-center bg-white rounded-2xl shadow-card">
          <p className="text-3xl" aria-hidden>
            🗓️
          </p>
          <p className="mt-2 text-sm text-gray-500">참석하기로 한 예정 일정이 없어요.</p>
          <Link to="/my-clubs" className="mt-3 inline-block text-sm font-bold text-mint-600">
            내 모임에서 일정 보기 ›
          </Link>
        </div>
      )}
      {list && list.length > 0 && (
        <ul className="space-y-2" aria-label="다가오는 내 일정">
          {list.slice(0, PREVIEW_COUNT).map((s) => (
            <MyScheduleCard key={s.id} schedule={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- 비밀번호 변경 ---------- */
function PasswordCard({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.current) return setError('현재 비밀번호를 입력해 주세요.');
    if (form.next.length < 8) return setError('새 비밀번호는 8자 이상이어야 해요.');
    if (form.next !== form.confirm) return setError('새 비밀번호가 일치하지 않아요.');
    if (form.next === form.current) return setError('새 비밀번호가 현재 비밀번호와 같아요.');
    setSaving(true);
    setError('');
    try {
      await changePassword({ currentPassword: form.current, newPassword: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setOpen(false);
      onSaved('비밀번호가 변경되었어요 🔒');
    } catch (err) {
      setError(errorMessage(err, '비밀번호를 변경하지 못했어요.'));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <section className="mx-4 mt-3 bg-white rounded-2xl shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-bold text-gray-700"
      >
        <span>🔒 비밀번호 변경</span>
        <span className="text-gray-400" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <form onSubmit={save} aria-label="비밀번호 변경" className="px-5 pb-5 space-y-3" noValidate>
          {[
            ['current', '현재 비밀번호', 'current-password'],
            ['next', '새 비밀번호 (8자 이상)', 'new-password'],
            ['confirm', '새 비밀번호 확인', 'new-password'],
          ].map(([name, label, ac]) => (
            <label key={name} className="block">
              <span className="block mb-1 text-xs font-bold text-gray-500">{label}</span>
              <input type="password" name={name} value={form[name]} onChange={set} autoComplete={ac} className={field} />
            </label>
          ))}
          <FieldError>{error}</FieldError>
          <button type="submit" disabled={saving} className="w-full h-11 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">
            {saving ? '변경 중…' : '비밀번호 변경'}
          </button>
        </form>
      )}
    </section>
  );
}

export default function MyPage() {
  const navigate = useNavigate();
  const { isLoggedIn, isAdmin, user, logout } = useAuth();
  const loggingOut = useRef(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // 로그인 안 했으면 로그인 화면으로 (방금 로그아웃한 경우엔 onLogout이 메인으로 보낸다)
  if (!isLoggedIn) return loggingOut.current ? null : <Navigate to="/login" replace />;

  const onLogout = () => {
    loggingOut.current = true;
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="relative mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-24 shadow-xl">
        <header className="sticky top-0 z-20 bg-white h-14 flex items-center justify-center">
          <h1 className="text-[17px] font-bold text-gray-900">마이페이지</h1>
        </header>

        <ProfileCard user={user} onSaved={setToast} />
        <UpcomingSchedules />

        {/* 내 정보 */}
        <h2 className="mx-4 mt-6 mb-3 text-[15px] font-black text-gray-900">내 정보</h2>
        <section className="mx-4 bg-white rounded-2xl shadow-card px-5 divide-y divide-gray-100">
          <Row label="닉네임" value={user?.nickname} />
          <Row label="이메일" value={user?.email} />
          <Row label="휴대폰" value={user?.phone} />
          <Row label="가입일" value={formatDate(user?.created_at)} />
        </section>
        <PasswordCard onSaved={setToast} />

        {/* 최고 관리자에게만 노출 */}
        {isAdmin && (
          <Link
            to="/admin"
            className="mx-4 mt-3 flex items-center gap-3 px-5 py-4 rounded-2xl bg-gray-900 text-white shadow-card active:scale-[0.99] transition"
          >
            <span className="text-2xl" aria-hidden>
              🖥️
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-black">최고 관리자 페이지</span>
              <span className="block text-xs text-gray-400">PC에서 장소·동호회·회원을 관리해요</span>
            </span>
            <span className="text-gray-500" aria-hidden>
              ›
            </span>
          </Link>
        )}

        <div className="mx-4 mt-6">
          <button
            type="button"
            onClick={onLogout}
            className="w-full h-12 rounded-2xl bg-white border border-gray-200 text-sm font-bold text-gray-600
                       shadow-card transition active:scale-[0.98] hover:bg-gray-100"
          >
            로그아웃
          </button>
        </div>

        {toast && (
          <div
            role="status"
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[448px] px-4 py-3 rounded-xl bg-gray-900/90 text-white text-sm text-center shadow-lg"
          >
            {toast}
          </div>
        )}

        <BottomNav active="my" />
      </div>
    </div>
  );
}
