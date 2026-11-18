import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import LocationPicker from '../components/LocationPicker';
import { FormError, SubmitButton, TextField } from '../components/AuthLayout';
import { sportEmoji } from '../components/VenueList';
import { PinIcon } from '../components/Icons';
import { createClub } from '../api/clubs';
import { fetchVenues } from '../api/schedules';
import { errorMessage } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { useSports } from '../sports/sportsStore';

const NAME_MAX = 30;
const INTRO_MAX = 60;

const fieldBox =
  'w-full px-4 py-3.5 rounded-2xl bg-white text-[15px] text-gray-900 placeholder-gray-300 border-2 border-transparent outline-none transition shadow-card focus:border-mint-500';

// 서버(POST /api/clubs) 검증 규칙과 동일
function validate(f, mode) {
  if (mode === 'list' && !f.venueId) return '주 활동 장소를 선택해 주세요.';
  if (mode === 'new') {
    if (f.lat == null || f.lng == null) return '지도에서 장소 위치를 선택해 주세요.';
    const vn = f.venueName.trim();
    if (vn.length < 2 || vn.length > 30) return '장소 이름은 2~30자로 입력해 주세요.';
    if (!f.venueSport) return '장소의 종목을 선택해 주세요.';
    if (!f.venueAddress.trim()) return '장소 주소를 입력해 주세요.';
  }
  const name = f.name.trim();
  if (name.length < 2 || name.length > NAME_MAX) return `동호회 이름은 2~${NAME_MAX}자로 입력해 주세요.`;
  const intro = f.description.trim();
  if (!intro || intro.length > INTRO_MAX) return `한 줄 소개는 1~${INTRO_MAX}자로 입력해 주세요.`;
  if (f.maxMembers && (!Number.isInteger(Number(f.maxMembers)) || Number(f.maxMembers) < 2 || Number(f.maxMembers) > 999))
    return '정원은 2~999명 사이로 입력해 주세요.';
  if (f.monthlyFee && (!Number.isInteger(Number(f.monthlyFee)) || Number(f.monthlyFee) < 0))
    return '월 회비는 0원 이상의 숫자로 입력해 주세요.';
  return '';
}

function SectionTitle({ step, children, optional }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-black text-gray-900">
      <span className="w-6 h-6 rounded-full bg-mint-500 text-white text-xs flex items-center justify-center">{step}</span>
      {children}
      {optional && <span className="text-xs font-medium text-gray-400">(선택)</span>}
    </h2>
  );
}

/** 목록에서 기존 장소 고르기 */
function VenueListPicker({ venues, selectedId, onSelect }) {
  const [sport, setSport] = useState('전체');
  const sports = useMemo(() => ['전체', ...new Set((venues || []).map((v) => v.sport))], [venues]);
  const shown = (venues || []).filter((v) => sport === '전체' || v.sport === sport);

  return (
    <>
      <div className="mt-3 -mx-5 px-5 flex gap-2 overflow-x-auto no-scrollbar">
        {sports.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSport(s)}
            aria-pressed={sport === s}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border transition
              ${sport === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {s === '전체' ? s : `${sportEmoji(s)} ${s}`}
          </button>
        ))}
      </div>
      <ul role="radiogroup" aria-label="주 활동 장소" className="mt-3 space-y-2">
        {!venues && [0, 1, 2].map((i) => <li key={i} className="h-[76px] bg-white rounded-2xl shadow-card animate-pulse" />)}
        {shown.map((v) => {
          const checked = selectedId === v.id;
          return (
            <li key={v.id}>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onSelect(v.id)}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-white shadow-card border-2 transition
                  ${checked ? 'border-mint-500' : 'border-transparent'}`}
              >
                <span className="w-12 h-12 shrink-0 rounded-xl bg-mint-50 flex items-center justify-center text-2xl" aria-hidden>
                  {sportEmoji(v.sport)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-gray-900 truncate">{v.name}</span>
                  <span className="flex items-center gap-1 text-xs text-gray-500 truncate">
                    <PinIcon className="w-3 h-3 shrink-0" />
                    {v.address}
                  </span>
                </span>
                <span
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-black
                    ${checked ? 'bg-mint-500 text-white' : 'border-2 border-gray-200'}`}
                  aria-hidden
                >
                  {checked ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 지도 핀 + 장소 정보 입력 (직접 등록) */
function NewVenueForm({ form, onChange, onLocation, onAddress, onPlaceSelect }) {
  const sports = useSports(); // GET /api/sports (활성 종목)
  return (
    <div className="mt-3 bg-white rounded-2xl shadow-card overflow-hidden">
      <LocationPicker searchable onChange={onLocation} onAddress={onAddress} onPlaceSelect={onPlaceSelect} className="h-64" />
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-xl bg-mint-50 text-[13px] text-mint-700">
          <span aria-hidden>📍</span>
          <p data-testid="picked-coords">
            {form.lat != null ? `위도 ${form.lat.toFixed(5)} · 경도 ${form.lng.toFixed(5)}` : '지도에서 위치를 선택해 주세요'}
          </p>
        </div>
        <TextField
          id="venueAddress"
          name="venueAddress"
          label="장소 주소"
          placeholder="지도를 움직이면 자동으로 채워져요"
          maxLength={100}
          value={form.venueAddress}
          onChange={onChange}
        />
        <TextField
          id="venueName"
          name="venueName"
          label="장소 이름"
          placeholder="예) 석촌호수 야외 배드민턴장"
          maxLength={30}
          value={form.venueName}
          onChange={onChange}
        />
        <div>
          <label htmlFor="venueSport" className="block text-sm font-bold text-gray-700 mb-1.5 pl-1">
            종목
          </label>
          <select
            id="venueSport"
            name="venueSport"
            value={form.venueSport}
            onChange={onChange}
            className={`${fieldBox} ${form.venueSport ? '' : 'text-gray-400'}`}
          >
            <option value="" disabled>
              어떤 운동을 할 수 있나요?
            </option>
            {sports.map((s) => (
              <option key={s.name} value={s.name} className="text-gray-900">
                {s.icon} {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="venueDescription" className="block text-sm font-bold text-gray-700 mb-1.5 pl-1">
            장소 설명 <span className="text-xs font-medium text-gray-400">(선택)</span>
          </label>
          <textarea
            id="venueDescription"
            name="venueDescription"
            rows={2}
            maxLength={200}
            placeholder="예) 우레탄 바닥, 야간 조명 있음"
            className={`${fieldBox} resize-none`}
            value={form.venueDescription}
            onChange={onChange}
          />
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          ⏳ 직접 등록한 장소는 관리자 승인 후 지도에 공개돼요. 그 전에도 동호회는 바로 운영할 수 있어요.
        </p>
      </div>
    </div>
  );
}

export default function ClubCreate() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [venues, setVenues] = useState(null);
  const [venueMode, setVenueMode] = useState('list'); // 'list' | 'new'
  const [form, setForm] = useState({
    venueId: null,
    // 직접 등록
    lat: null,
    lng: null,
    venueAddress: '',
    venueName: '',
    venueSport: '',
    venueDescription: '',
    // 동호회
    name: '',
    description: '',
    skillLevel: '',
    activityTime: '',
    maxMembers: '',
    monthlyFee: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchVenues()
      .then(setVenues)
      .catch((err) => setError(errorMessage(err, '장소 목록을 불러오지 못했어요.')));
  }, []);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const onLocation = useCallback(({ lat, lng }) => setForm((f) => ({ ...f, lat, lng })), []);
  const onAddress = useCallback((venueAddress) => setForm((f) => ({ ...f, venueAddress })), []);
  // 검색 결과 선택: 좌표·주소는 지도가 채우고, 장소명은 비어 있을 때만 검색된 이름으로 채운다
  const onPlaceSelect = useCallback(
    ({ name, lat, lng }) =>
      setForm((f) => ({ ...f, lat, lng, venueName: f.venueName.trim() || !name ? f.venueName : name.slice(0, 30) })),
    []
  );

  const placeholderName = (() => {
    if (venueMode === 'new' && form.venueName) return `예) ${form.venueName.split(' ')[0]} ${form.venueSport || '운동'} 클럽`;
    const v = venues?.find((x) => x.id === form.venueId);
    return v ? `예) ${v.name.split(' ')[0]} ${v.sport} 클럽` : '예) 잠실 셔틀콕즈';
  })();

  const onSubmit = async (e) => {
    e.preventDefault();
    const msg = validate(form, venueMode);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setLoading(true);
    const venuePart =
      venueMode === 'new'
        ? {
            new_venue: {
              name: form.venueName.trim(),
              sport: form.venueSport,
              address: form.venueAddress.trim(),
              lat: form.lat,
              lng: form.lng,
              description: form.venueDescription.trim() || undefined,
            },
          }
        : { venue_id: form.venueId };
    try {
      const { club } = await createClub({
        ...venuePart,
        name: form.name.trim(),
        description: form.description.trim(),
        skill_level: form.skillLevel.trim() || undefined,
        activity_time: form.activityTime.trim() || undefined,
        max_members: form.maxMembers ? Number(form.maxMembers) : undefined,
        monthly_fee: form.monthlyFee ? Number(form.monthlyFee) : undefined,
      });
      const toast =
        club.venue_status === 'pending'
          ? `'${club.name}' 개설 완료! 장소는 승인 후 지도에 공개돼요 ⏳`
          : `'${club.name}' 동호회가 개설되었어요 🎉`;
      // 방금 만든 동호회 상세 화면으로 (뒤로가기 시 폼으로 돌아오지 않게 replace)
      navigate(`/clubs/${club.id}`, { replace: true, state: { toast } });
    } catch (err) {
      if (err?.response?.status === 401) {
        logout();
        return;
      }
      // 직접 등록하려던 장소가 이미 목록에 있으면 목록 모드로 바꾸고 그 장소를 골라 준다
      const existing = err?.response?.data?.existing_venue;
      if (existing && venues?.some((v) => v.id === existing.id)) {
        setVenueMode('list');
        setForm((f) => ({ ...f, venueId: existing.id }));
        setError(`'${existing.name}'은(는) 이미 등록된 장소라 목록에서 선택해 두었어요. 다시 개설하기를 눌러 주세요.`);
      } else {
        setError(errorMessage(err, '동호회를 개설하지 못했어요.'));
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="mx-auto max-w-[480px] min-h-screen bg-gray-50 shadow-xl">
        <PageHeader title="새 동호회 만들기" back fallback="/my-clubs" />

        <form onSubmit={onSubmit} noValidate className="pb-28">
          <div className="px-5 pt-6 pb-2">
            <p className="text-4xl" aria-hidden>🎉</p>
            <h1 className="mt-3 text-2xl font-black text-gray-900 leading-snug">
              우리 동네 운동 모임,
              <br />
              직접 만들어 볼까요?
            </h1>
            <p className="mt-2 text-sm text-gray-500">개설하면 내가 방장이 되어 회원과 일정을 관리할 수 있어요.</p>
          </div>

          {/* 1. 장소 */}
          <section className="mt-6 px-5">
            <SectionTitle step={1}>주 활동 장소</SectionTitle>

            {/* 목록 / 직접 등록 탭 */}
            <div className="mt-3 grid grid-cols-2 p-1 rounded-2xl bg-gray-200/70 text-sm font-bold" role="tablist" aria-label="장소 선택 방식">
              {[
                ['list', '목록에서 고르기'],
                ['new', '📍 직접 등록하기'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={venueMode === key}
                  onClick={() => setVenueMode(key)}
                  className={`py-2 rounded-xl transition ${venueMode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {venueMode === 'list' ? (
              <>
                <VenueListPicker
                  venues={venues}
                  selectedId={form.venueId}
                  onSelect={(id) => setForm((f) => ({ ...f, venueId: id }))}
                />
                <button
                  type="button"
                  onClick={() => setVenueMode('new')}
                  className="mt-3 w-full py-3.5 rounded-2xl border-2 border-dashed border-gray-300 text-sm font-bold text-gray-500 hover:border-mint-500 hover:text-mint-600 transition"
                >
                  찾는 장소가 없나요? <span className="text-mint-600">직접 등록하기 ›</span>
                </button>
              </>
            ) : (
              <NewVenueForm
                form={form}
                onChange={onChange}
                onLocation={onLocation}
                onAddress={onAddress}
                onPlaceSelect={onPlaceSelect}
              />
            )}
          </section>

          {/* 2. 기본 정보 */}
          <section className="mt-8 px-5 space-y-4">
            <SectionTitle step={2}>동호회 소개</SectionTitle>
            <TextField
              id="name"
              name="name"
              label="동호회 이름"
              placeholder={placeholderName}
              maxLength={NAME_MAX}
              value={form.name}
              onChange={onChange}
              hint={`${form.name.length}/${NAME_MAX}`}
            />
            <TextField
              id="description"
              name="description"
              label="한 줄 소개"
              placeholder="예) 초보 환영! 매주 토요일 오전에 함께 쳐요"
              maxLength={INTRO_MAX}
              value={form.description}
              onChange={onChange}
              hint={`${form.description.length}/${INTRO_MAX}`}
            />
          </section>

          {/* 3. 추가 정보 */}
          <section className="mt-8 px-5 space-y-4">
            <SectionTitle step={3} optional>
              모집 정보
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <TextField id="skillLevel" name="skillLevel" label="실력" placeholder="예) 초보~중수" maxLength={20} value={form.skillLevel} onChange={onChange} />
              <TextField id="activityTime" name="activityTime" label="주 활동 시간" placeholder="예) 매주 토 오전" maxLength={30} value={form.activityTime} onChange={onChange} />
              <TextField id="maxMembers" name="maxMembers" type="number" inputMode="numeric" min={2} max={999} label="정원 (명)" placeholder="제한 없음" value={form.maxMembers} onChange={onChange} />
              <TextField id="monthlyFee" name="monthlyFee" type="number" inputMode="numeric" min={0} step={1000} label="월 회비 (원)" placeholder="0" value={form.monthlyFee} onChange={onChange} />
            </div>
          </section>

          <div className="px-5 mt-6">
            <FormError message={error} />
          </div>

          {/* 하단 고정 버튼 */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-[480px] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-gray-50 via-gray-50 to-gray-50/0">
            <SubmitButton loading={loading}>동호회 개설하기</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
