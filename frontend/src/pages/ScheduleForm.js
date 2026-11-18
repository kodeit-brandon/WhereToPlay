import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { FormError, SubmitButton, TextField } from '../components/AuthLayout';
import { createSchedule, fetchClubSchedules, fetchSchedule, fetchVenues, updateSchedule } from '../api/schedules';
import { errorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { toDateInput } from '../utils/datetime';

const fieldBox =
  'w-full px-4 py-3.5 rounded-2xl bg-white text-[15px] text-gray-900 placeholder-gray-300 border-2 border-transparent outline-none transition shadow-card focus:border-mint-500';

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-bold text-gray-700 mb-1.5 pl-1">
      {children}
    </label>
  );
}

function validate(f) {
  if (!f.title.trim()) return '일정 제목을 입력해 주세요.';
  if (f.title.trim().length > 50) return '일정 제목은 50자 이내로 입력해 주세요.';
  if (!f.date || !f.startTime) return '모임 날짜와 시작 시간을 입력해 주세요.';
  const start = new Date(`${f.date}T${f.startTime}`);
  if (start <= new Date()) return '모임 시작 일시는 지금 이후여야 해요.';
  if (f.endTime && f.endTime <= f.startTime) return '종료 시간은 시작 시간 이후여야 해요.';
  if (f.capacity && (!Number.isInteger(Number(f.capacity)) || Number(f.capacity) < 1 || Number(f.capacity) > 999))
    return '정원은 1~999명 사이로 입력해 주세요.';
  if (f.fee && (!Number.isInteger(Number(f.fee)) || Number(f.fee) < 0)) return '참가비는 0원 이상의 숫자로 입력해 주세요.';
  if (f.deadline) {
    const d = new Date(f.deadline);
    if (d <= new Date() || d > start) return '투표 마감은 지금 이후, 모임 시작 전이어야 해요.';
  }
  return '';
}

/** 서버 일정(현지 시각 'YYYY-MM-DD HH:MM:SS') → 폼 값 */
function scheduleToForm(s) {
  return {
    title: s.title,
    date: s.start_at.slice(0, 10),
    startTime: s.start_at.slice(11, 16),
    endTime: s.end_at ? s.end_at.slice(11, 16) : '',
    venueId: s.venue ? String(s.venue.id) : '',
    capacity: s.capacity != null ? String(s.capacity) : '',
    fee: s.fee ? String(s.fee) : '',
    deadline: s.rsvp_deadline ? s.rsvp_deadline.slice(0, 16).replace(' ', 'T') : '',
    description: s.description || '',
  };
}

/** 새 일정 만들기 + 일정 수정 (scheduleId 가 있으면 수정 모드) */
export default function ScheduleForm() {
  const { clubId, scheduleId } = useParams();
  const isEdit = Boolean(scheduleId);
  const [started, setStarted] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [info, setInfo] = useState(null); // { club, can_manage }
  const [venues, setVenues] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    date: toDateInput(new Date(Date.now() + 86400000)), // 기본값: 내일
    startTime: '19:00',
    endTime: '21:00',
    venueId: '',
    capacity: '',
    fee: '',
    deadline: '',
    description: '',
  });

  useEffect(() => {
    Promise.all([fetchClubSchedules(clubId), fetchVenues(), isEdit ? fetchSchedule(scheduleId) : null])
      .then(([res, venueList, schedule]) => {
        setInfo(res);
        if (schedule) {
          // 기존 값이 채워진 폼. 일정 장소가 승인 목록에 없으면(승인 대기 장소 등) 선택지에 추가
          const v = schedule.venue;
          setVenues(v && !venueList.some((x) => x.id === v.id) ? [{ id: v.id, name: v.name, sport: '승인 대기 장소' }, ...venueList] : venueList);
          setForm(scheduleToForm(schedule));
          setStarted(schedule.close_reason === 'started');
        } else {
          setVenues(venueList);
          setForm((f) => ({ ...f, venueId: String(res.club.venue_id) }));
        }
      })
      .catch((err) => {
        if (err?.response?.status === 401) logout();
        else setLoadError(errorMessage(err, '동호회 정보를 불러오지 못했어요.'));
      });
  }, [clubId, scheduleId, isEdit, logout]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    const msg = validate(form);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setLoading(true);
    const body = {
      title: form.title.trim(),
      start_at: `${form.date}T${form.startTime}`,
      end_at: form.endTime ? `${form.date}T${form.endTime}` : undefined,
      venue_id: form.venueId ? Number(form.venueId) : undefined,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      fee: form.fee ? Number(form.fee) : 0,
      rsvp_deadline: form.deadline || undefined,
      description: form.description.trim() || undefined,
    };
    try {
      if (isEdit) {
        await updateSchedule(scheduleId, body);
        navigate(`/clubs/${clubId}`, { replace: true, state: { toast: '일정을 수정했어요 ✏️' } });
      } else {
        await createSchedule(clubId, body);
        navigate(`/clubs/${clubId}`, { replace: true, state: { toast: '새 일정이 등록되었어요 🎉' } });
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        logout();
        return;
      }
      setError(errorMessage(err, isEdit ? '일정을 수정하지 못했어요.' : '일정을 등록하지 못했어요.'));
      setLoading(false);
    }
  };

  const denied = loadError || (info && !info.can_manage) || (isEdit && started);

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="mx-auto max-w-[480px] min-h-screen bg-gray-50 pb-10 shadow-xl">
        <PageHeader title={isEdit ? '일정 수정하기' : '새 일정 만들기'} back fallback={`/clubs/${clubId}`} />

        {denied && (
          <div className="px-4 py-20 text-center">
            <p className="text-4xl">🔒</p>
            <p className="mt-3 text-sm text-gray-600">{loadError ||
                (info && !info.can_manage ? '방장 또는 운영진만 일정을 만들 수 있어요.' : '이미 시작했거나 지난 일정은 수정할 수 없어요.')}</p>
            <Link to={`/clubs/${clubId}`} className="inline-block mt-5 px-5 py-2 rounded-full bg-mint-500 text-white text-sm font-bold">
              돌아가기
            </Link>
          </div>
        )}

        {!denied && !info && <div className="m-4 h-96 bg-white rounded-2xl shadow-card animate-pulse" />}

        {!denied && info && (
          <form onSubmit={onSubmit} noValidate className="px-5 pt-5 space-y-5">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="px-2 py-0.5 rounded-full bg-mint-50 text-mint-700 font-bold text-xs">{info.club.name}</span>
              {isEdit ? '의 일정을 수정해요 ✏️' : '에 새 운동 일정을 올려요 🏃'}
            </div>

            <TextField
              id="title"
              name="title"
              label="일정 제목 *"
              placeholder="예) 토요 정기 운동"
              maxLength={50}
              value={form.title}
              onChange={onChange}
            />

            <div>
              <Label htmlFor="date">모임 날짜 *</Label>
              <input id="date" name="date" type="date" className={fieldBox} value={form.date} onChange={onChange} min={toDateInput(new Date())} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="startTime">시작 시간 *</Label>
                <input id="startTime" name="startTime" type="time" className={fieldBox} value={form.startTime} onChange={onChange} />
              </div>
              <div>
                <Label htmlFor="endTime">종료 시간</Label>
                <input id="endTime" name="endTime" type="time" className={fieldBox} value={form.endTime} onChange={onChange} />
              </div>
            </div>

            <div>
              <Label htmlFor="venueId">장소</Label>
              <select id="venueId" name="venueId" className={fieldBox} value={form.venueId} onChange={onChange}>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.sport}){v.id === info.club.venue_id ? ' · 기본 장소' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TextField
                id="capacity"
                name="capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                label="정원 (명)"
                placeholder="제한 없음"
                value={form.capacity}
                onChange={onChange}
              />
              <TextField
                id="fee"
                name="fee"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                label="참가비 (원)"
                placeholder="0"
                value={form.fee}
                onChange={onChange}
              />
            </div>

            <div>
              <Label htmlFor="deadline">투표 마감 (선택)</Label>
              <input id="deadline" name="deadline" type="datetime-local" className={fieldBox} value={form.deadline} onChange={onChange} />
              <p className="mt-1.5 pl-1 text-xs text-gray-400">비워두면 모임 시작 전까지 투표할 수 있어요.</p>
            </div>

            <div>
              <Label htmlFor="description">설명 (선택)</Label>
              <textarea
                id="description"
                name="description"
                rows={4}
                maxLength={500}
                placeholder="준비물, 진행 방식 등을 적어주세요"
                className={`${fieldBox} resize-none`}
                value={form.description}
                onChange={onChange}
              />
            </div>

            <FormError message={error} />
            <SubmitButton loading={loading}>{isEdit ? '수정 완료' : '일정 등록하기'}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
