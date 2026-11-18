import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthContext';
import { resetSportsCache } from './sports/sportsStore';

jest.mock('axios');

// 실제 서버 없이 소켓 동작을 흉내 내는 가짜 socket.io-client
// (CRA는 테스트마다 jest.fn 구현을 초기화하므로 일반 함수로 만든다)
jest.mock('socket.io-client', () => {
  class FakeSocket {
    constructor(url, opts) {
      this.url = url;
      this.opts = opts;
      this.handlers = {};
      this.emitted = [];
      this.responders = {};
      this.disconnected = false;
    }
    on(ev, cb) {
      this.handlers[ev] = cb;
      return this;
    }
    timeout() {
      return this;
    }
    emit(ev, payload, cb) {
      this.emitted.push({ ev, payload });
      const respond = this.responders[ev];
      if (respond && cb) {
        const res = respond(payload);
        if (res !== undefined) cb(...(ev === 'chat:send' ? [null, res] : [res]));
      }
    }
    fire(ev, data) {
      this.handlers[ev]?.(data);
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const state = { sockets: [] };
  return {
    io: (url, opts) => {
      const s = new FakeSocket(url, opts);
      state.sockets.push(s);
      return s;
    },
    __state: state,
  };
});

const VENUES = [
  { id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴', address: '서울 송파구', club_count: 2 },
  { id: 2, name: '성수 루프탑 풋살장', sport: '풋살', address: '서울 성동구', club_count: 1 },
];

const CLUBS_RESPONSE = {
  venue: { id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴', address: '서울 송파구', phone: null },
  clubs: [
    {
      id: 1, name: '잠실 셔틀콕즈', description: '초보 환영', is_public: true,
      recruit_status: 'recruiting', is_new: true, member_count: 4, max_members: 30,
      monthly_fee: 20000, skill_level: '초보~중수', activity_time: '매주 토 09:00~12:00',
      owner: { id: 1, nickname: '민수' },
    },
    {
      id: 4, name: '반포 3on3', description: null, is_public: true,
      recruit_status: 'closed', is_new: false, member_count: 2, max_members: 10,
      monthly_fee: 0, skill_level: '중수~고수', activity_time: '매주 토 16:00~19:00',
      owner: { id: 5, nickname: '동현' },
    },
  ],
};

function renderApp(path = '/') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );
}

// 테스트용 JWT (payload: { userId: 7, exp: 2100년 })
const FAKE_TOKEN = `x.${btoa(JSON.stringify({ userId: 7, exp: 4102444800 }))}.y`;
const ME = { id: 7, email: 'test@example.com', nickname: '테스터', phone: null, created_at: '2026-11-18 05:00:00' };

beforeEach(() => {
  localStorage.clear();
  resetSportsCache();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
    return Promise.resolve({ data: url.endsWith('/clubs') ? CLUBS_RESPONSE : VENUES });
  });
});

test('메인 화면의 주요 섹션과 API 데이터를 보여준다', async () => {
  renderApp();
  expect(screen.getByText('송파구 잠실동')).toBeInTheDocument();
  expect(screen.getByText('장비 챙겨서 운동장으로!')).toBeInTheDocument();
  expect(screen.getByText('오늘의 번개 모임 ⚡')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: '잠실 배드민턴 체육관' })).toBeInTheDocument();
});

test('카테고리를 누르면 해당 종목 장소만 보여준다', async () => {
  renderApp();
  await screen.findByRole('heading', { name: '성수 루프탑 풋살장' });
  fireEvent.click(screen.getByRole('button', { name: /🏸\s*배드민턴/ }));
  expect(screen.getByText('🏸 배드민턴 장소')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '성수 루프탑 풋살장' })).not.toBeInTheDocument();
});

test('장소 카드를 누르면 동호회 메뉴판 화면으로 이동한다', async () => {
  renderApp();
  fireEvent.click(await screen.findByRole('heading', { name: '잠실 배드민턴 체육관' }));
  expect(await screen.findByText('잠실 셔틀콕즈')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith('http://localhost:5001/api/venues/1/clubs', { headers: {} });
});

test('동호회 카드에 상태 뱃지, 회원 수, 실력, 활동 시간, 버튼을 보여준다', async () => {
  renderApp('/venues/1');
  expect(await screen.findByText('🔥 신규 모집중')).toBeInTheDocument();
  expect(screen.getByText('🔒 마감')).toBeInTheDocument();
  expect(screen.getByText('4 / 30명')).toBeInTheDocument();
  expect(screen.getByText('초보~중수')).toBeInTheDocument();
  expect(screen.getByText('매주 토 09:00~12:00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '가입/문의' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '문의하기' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '마감' }));
  expect(screen.queryByText('잠실 셔틀콕즈')).not.toBeInTheDocument();
});

test('존재하지 않는 장소면 안내와 홈 버튼을 보여준다', async () => {
  axios.get.mockRejectedValueOnce({ response: { status: 404 } });
  renderApp('/venues/999');
  expect(await screen.findByText('존재하지 않는 장소예요.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '홈으로 가기' })).toBeInTheDocument();
});

test('로그인 안 한 상태에서 마이페이지를 누르면 로그인 화면으로 간다', async () => {
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: '마이페이지' }));
  expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
});

test('로그인 성공 시 토큰을 저장하고 메인으로 이동, 마이페이지에 프로필과 로그아웃이 보인다', async () => {
  axios.post.mockResolvedValueOnce({ data: { token: FAKE_TOKEN, user: ME } });
  renderApp('/login');

  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByText('오늘의 번개 모임 ⚡')).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith('http://localhost:5001/api/auth/login', {
    email: 'test@example.com',
    password: 'password123',
  });
  expect(localStorage.getItem('wtp.token')).toBe(FAKE_TOKEN);

  fireEvent.click(screen.getByRole('button', { name: '마이페이지' }));
  expect(await screen.findByText('test@example.com', { selector: 'p' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
  await waitFor(() => expect(localStorage.getItem('wtp.token')).toBeNull());
  expect(await screen.findByText('오늘의 번개 모임 ⚡')).toBeInTheDocument();
});

test('로그인 실패 시 서버 에러 메시지를 보여준다', async () => {
  axios.post.mockRejectedValueOnce({ response: { status: 401, data: { error: '이메일 또는 비밀번호가 올바르지 않습니다.' } } });
  renderApp('/login');
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrongpass' } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.');
  expect(localStorage.getItem('wtp.token')).toBeNull();
});

test('회원가입은 입력값을 검증하고, 성공하면 바로 로그인 상태가 된다', async () => {
  renderApp('/register');
  fireEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
  expect(screen.getByText('올바른 이메일 형식이 아니에요.')).toBeInTheDocument();
  expect(axios.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '새친구' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password999' } });
  expect(screen.getByText('비밀번호가 일치하지 않아요.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password123' } });

  axios.post.mockResolvedValueOnce({ data: { token: FAKE_TOKEN, user: { ...ME, nickname: '새친구' } } });
  fireEvent.click(screen.getByRole('button', { name: '가입하고 시작하기' }));
  expect(await screen.findByText('오늘의 번개 모임 ⚡')).toBeInTheDocument();
  expect(localStorage.getItem('wtp.token')).toBe(FAKE_TOKEN);
});

test('만료된 토큰은 무시하고 로그아웃 상태로 시작한다', async () => {
  const expired = `x.${btoa(JSON.stringify({ userId: 7, exp: 1 }))}.y`;
  localStorage.setItem('wtp.token', expired);
  renderApp('/my');
  expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
  expect(localStorage.getItem('wtp.token')).toBeNull();
});

describe('동호회 가입 신청', () => {
  test('비로그인 상태에서 누르면 로그인 안내 후, 로그인하면 원래 화면으로 돌아온다', async () => {
    renderApp('/venues/1');
    fireEvent.click(await screen.findByRole('button', { name: '가입/문의' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('로그인이 필요한 기능입니다.');
    expect(axios.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '로그인하러 가기' }));
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();

    axios.post.mockResolvedValueOnce({ data: { token: FAKE_TOKEN, user: ME } });
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    // 메인이 아니라 보던 동호회 화면으로 복귀, 이번엔 토큰을 담아 목록을 다시 조회
    expect(await screen.findByText('동호회 메뉴판 📋')).toBeInTheDocument();
    await waitFor(() =>
      expect(axios.get).toHaveBeenCalledWith('http://localhost:5001/api/venues/1/clubs', {
        headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
      })
    );
  });

  test('로그인 상태에서 누르면 토큰을 담아 신청하고, 완료 모달과 함께 버튼이 신청 완료로 바뀐다', async () => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify(ME));
    axios.post.mockResolvedValueOnce({
      data: { message: '가입 신청이 완료되었습니다. 방장의 승인을 기다려주세요!', membership: { status: 'pending' } },
    });
    renderApp('/venues/1');

    fireEvent.click(await screen.findByRole('button', { name: '가입/문의' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      '가입 신청이 완료되었습니다. 방장의 승인을 기다려주세요!'
    );
    expect(axios.post).toHaveBeenCalledWith('http://localhost:5001/api/clubs/1/join', null, {
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    });
    const done = screen.getByRole('button', { name: /신청 완료/ });
    expect(done).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test("확인창에서 '취소'를 누르면 가입 API를 호출하지 않는다", async () => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    window.confirm.mockReturnValueOnce(false);
    renderApp('/venues/1');

    fireEvent.click(await screen.findByRole('button', { name: '가입/문의' }));
    expect(window.confirm).toHaveBeenCalledWith('가입하시겠습니까?');
    expect(axios.post).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가입/문의' })).toBeEnabled();
  });

  test('이미 신청한 동호회면 서버 안내를 보여주고 버튼을 신청 완료로 바꾼다', async () => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    axios.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: '이미 가입 신청한 동호회입니다. 방장의 승인을 기다려주세요.', status: 'pending' } },
    });
    renderApp('/venues/1');

    fireEvent.click(await screen.findByRole('button', { name: '가입/문의' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('이미 가입 신청한 동호회입니다.');
    expect(screen.getByRole('button', { name: /신청 완료/ })).toBeDisabled();
  });

  test('서버가 알려준 내 가입 상태(my_status)를 버튼에 반영한다', async () => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      return Promise.resolve({
        data: { ...CLUBS_RESPONSE, clubs: [{ ...CLUBS_RESPONSE.clubs[0], my_status: 'approved' }] },
      });
    });
    renderApp('/venues/1');
    expect(await screen.findByRole('button', { name: /가입 완료/ })).toBeDisabled();
  });
});

describe('내 모임 / 동호회 관리', () => {
  const MY_CLUBS = [
    {
      id: 1, name: '잠실 셔틀콕즈', venue: { id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴' },
      member_count: 4, max_members: 30, my_role: 'owner', my_role_label: '방장', my_status: 'approved',
      can_manage: true, pending_count: 2,
    },
    {
      id: 2, name: '성수 FC', venue: { id: 2, name: '성수 루프탑 풋살장', sport: '풋살' },
      member_count: 3, max_members: 16, my_role: 'member', my_role_label: '회원', my_status: 'approved',
      can_manage: false,
    },
  ];
  const MEMBERS = {
    club: { id: 1, name: '잠실 셔틀콕즈', venue_id: 1, venue_name: '잠실 배드민턴 체육관', sport: '배드민턴', max_members: 30, member_count: 2 },
    my_role: 'owner',
    pending: [
      { user_id: 2, nickname: '지영', bio: '풋살 3년차', role: 'member', role_label: '회원', status: 'pending', applied_at: '2026-11-18 01:00:00' },
      { user_id: 9, nickname: '새친구', bio: null, role: 'member', role_label: '회원', status: 'pending', applied_at: '2026-11-18 02:00:00' },
    ],
    members: [
      { user_id: 1, nickname: '민수', role: 'owner', role_label: '방장', status: 'approved', joined_at: '2026-09-01 10:00:00' },
      { user_id: 3, nickname: '현우', role: 'manager', role_label: '운영진', status: 'approved', joined_at: '2026-09-05 10:00:00' },
    ],
  };

  beforeEach(() => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      if (url.endsWith('/api/me/clubs')) return Promise.resolve({ data: { clubs: MY_CLUBS } });
      if (url.endsWith('/members')) return Promise.resolve({ data: MEMBERS });
      return Promise.resolve({ data: VENUES });
    });
  });

  test('비로그인으로 내 모임 탭을 누르면 로그인 화면으로 간다', async () => {
    localStorage.clear();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: '내 모임' }));
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  test('내 모임 탭: 동호회를 누르면 일정 화면으로, 관리 버튼을 누르면 회원 관리 화면으로 간다', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: '내 모임' }));

    expect(await screen.findByText('운영 중인 동호회')).toBeInTheDocument();
    expect(screen.getByText('가입한 동호회')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /성수 FC/ })).toHaveAttribute('href', '/clubs/2');
    const hrefs = screen.getAllByRole('link', { name: /잠실 셔틀콕즈/ }).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/clubs/1', '/clubs/1/manage']);

    fireEvent.click(screen.getByRole('link', { name: '잠실 셔틀콕즈 회원 관리, 가입 대기 2명' }));
    expect(await screen.findByText('신규 가입 대기')).toBeInTheDocument();
    expect(screen.getByText('기존 회원 목록')).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith('http://localhost:5001/api/clubs/1/members', {
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    });
  });

  test('승인을 누르면 PUT API를 호출하고 대기자가 회원 목록으로 옮겨간다', async () => {
    axios.put.mockResolvedValueOnce({
      data: {
        message: '가입을 승인했습니다.',
        member: { ...MEMBERS.pending[0], status: 'approved', joined_at: '2026-11-18 06:00:00' },
      },
    });
    renderApp('/clubs/1/manage');

    fireEvent.click(await screen.findByRole('button', { name: '지영 승인' }));

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith(
        'http://localhost:5001/api/clubs/1/members/2',
        { status: 'approved' },
        { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } }
      )
    );
    expect(await screen.findByRole('status')).toHaveTextContent('지영님의 가입을 승인했어요');
    expect(screen.queryByRole('button', { name: '지영 승인' })).not.toBeInTheDocument();
    expect(screen.getByText('기존 회원 목록').textContent).toContain('3');
  });

  test('거절은 확인창을 거치고, 취소하면 호출하지 않는다', async () => {
    renderApp('/clubs/1/manage');
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(await screen.findByRole('button', { name: '새친구 거절' }));
    expect(axios.put).not.toHaveBeenCalled();

    axios.put.mockResolvedValueOnce({ data: { message: '가입을 거절했습니다.', member: { ...MEMBERS.pending[1], status: 'rejected' } } });
    fireEvent.click(screen.getByRole('button', { name: '새친구 거절' }));
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith(
        'http://localhost:5001/api/clubs/1/members/9',
        { status: 'rejected' },
        expect.anything()
      )
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: '새친구 거절' })).not.toBeInTheDocument());
  });

  test('관리 권한이 없으면 서버 안내를 보여준다', async () => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      return Promise.reject({ response: { status: 403, data: { error: '방장 또는 운영진만 이용할 수 있습니다.' } } });
    });
    renderApp('/clubs/2/manage');
    expect(await screen.findByText('방장 또는 운영진만 이용할 수 있습니다.')).toBeInTheDocument();
  });
});

describe('동호회 일정 & 참석 투표', () => {
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const base = {
    club_id: 1, description: '복식 위주', end_at: '2099-11-21 12:00:00', venue: { id: 1, name: '잠실 배드민턴 체육관', address: '서울 송파구' },
    fee: 5000, rsvp_deadline: null, created_by: { id: 1, nickname: '민수' },
  };
  const S1 = {
    ...base, id: 1, title: '토요 정기 운동', start_at: '2099-11-21 09:00:00', capacity: 20,
    counts: { attend: 2, maybe: 1, absent: 0 }, my_response: null,
    is_closed: false, close_reason: null, can_vote: true, can_attend: true,
  };
  const S5 = {
    ...base, id: 5, title: '평일 새벽 랠리', start_at: '2099-11-24 06:30:00', capacity: 2,
    counts: { attend: 2, maybe: 0, absent: 0 }, my_response: null,
    is_closed: true, close_reason: 'full', can_vote: true, can_attend: false,
  };
  const ATTENDEES = {
    attend: [{ user_id: 1, nickname: '민수' }, { user_id: 4, nickname: '서연' }],
    maybe: [{ user_id: 3, nickname: '현우' }],
    absent: [],
  };
  const listResponse = (canManage) => ({
    club: { id: 1, name: '잠실 셔틀콕즈', venue_id: 1, venue_name: '잠실 배드민턴 체육관', sport: '배드민턴', member_count: 5, max_members: 30 },
    my_role: canManage ? 'owner' : 'member',
    my_role_label: canManage ? '방장' : '회원',
    can_manage: canManage,
    schedules: [S1, S5],
  });

  function mockGets(canManage = false) {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      if (url.includes('/api/clubs/1/schedules')) return Promise.resolve({ data: listResponse(canManage) });
      if (url.endsWith('/api/schedules/1')) return Promise.resolve({ data: { schedule: { ...S1, attendees: ATTENDEES } } });
      if (url.endsWith('/api/schedules/5')) return Promise.resolve({ data: { schedule: { ...S5, attendees: { ...ATTENDEES, maybe: [] } } } });
      if (url.endsWith('/api/venues')) return Promise.resolve({ data: VENUES });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }

  beforeEach(() => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
  });

  test('다가오는 일정을 카드로 보여준다 (날짜, 장소, 참석 인원, 마감 여부)', async () => {
    mockGets();
    renderApp('/clubs/1');
    expect(await screen.findByText('토요 정기 운동')).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith('http://localhost:5001/api/clubs/1/schedules?scope=upcoming', AUTH);
    expect(screen.getByText('모집중')).toBeInTheDocument();
    expect(screen.getByText('🔥 정원 마감')).toBeInTheDocument();
    expect(screen.getAllByText('잠실 배드민턴 체육관').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /토요 정기 운동 11월 21일/ })).toHaveTextContent('2 / 20명');
    // 일반 회원에게는 FAB가 없다
    expect(screen.queryByRole('link', { name: /새 일정 만들기/ })).not.toBeInTheDocument();
  });

  test('일정을 누르면 바텀시트가 열리고, 참석 투표 후 참석자 닉네임이 보인다', async () => {
    mockGets();
    axios.post.mockResolvedValueOnce({
      data: {
        message: '참석으로 투표했어요!',
        schedule: {
          ...S1, my_response: 'attend', counts: { attend: 3, maybe: 1, absent: 0 },
          attendees: { ...ATTENDEES, attend: [...ATTENDEES.attend, { user_id: 7, nickname: '테스터' }] },
        },
      },
    });
    renderApp('/clubs/1');
    fireEvent.click(await screen.findByRole('button', { name: /토요 정기 운동/ }));

    const sheet = await screen.findByRole('dialog');
    expect(await screen.findByText('투표하면 누가 오는지 볼 수 있어요 👀')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /참석/, pressed: false }));
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('http://localhost:5001/api/schedules/1/rsvp', { response: 'attend' }, AUTH)
    );

    const list = await screen.findByRole('list', { name: '참석자 목록' });
    expect(list).toHaveTextContent('민수');
    expect(list).toHaveTextContent('서연');
    expect(list).toHaveTextContent('테스터');
    expect(sheet).toHaveTextContent('미정: 현우');
    expect(screen.getByRole('button', { name: /참석/, pressed: true })).toBeInTheDocument();
    // 목록 카드도 갱신
    expect(screen.getByRole('button', { name: /토요 정기 운동 11월 21일/ })).toHaveTextContent('3 / 20명');
  });

  test('정원이 찬 일정은 참석 버튼이 비활성화되고 불참·미정만 누를 수 있다', async () => {
    mockGets();
    renderApp('/clubs/1');
    fireEvent.click(await screen.findByRole('button', { name: /평일 새벽 랠리/ }));
    expect(await screen.findByText('정원이 다 찼어요. 불참·미정으로만 응답할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^참석/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^불참/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^미정/ })).toBeEnabled();
  });

  test('방장에게는 새 일정 FAB가 보이고, 폼을 제출하면 일정 생성 API를 호출한 뒤 돌아온다', async () => {
    mockGets(true);
    axios.post.mockResolvedValueOnce({ data: { message: '새 일정이 등록되었습니다.', schedule: { id: 9 } } });
    renderApp('/clubs/1');

    fireEvent.click(await screen.findByRole('link', { name: /새 일정 만들기/ }));
    expect(await screen.findByLabelText('일정 제목 *')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('장소')).toHaveValue('1'));

    fireEvent.change(screen.getByLabelText('일정 제목 *'), { target: { value: '송년 번개' } });
    fireEvent.change(screen.getByLabelText('모임 날짜 *'), { target: { value: '2099-12-20' } });
    fireEvent.change(screen.getByLabelText('정원 (명)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('참가비 (원)'), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText('장소'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '일정 등록하기' }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5001/api/clubs/1/schedules',
        {
          title: '송년 번개', start_at: '2099-12-20T19:00', end_at: '2099-12-20T21:00', venue_id: 2,
          capacity: 12, fee: 10000, rsvp_deadline: undefined, description: undefined,
        },
        AUTH
      )
    );
    expect(await screen.findByText('새 일정이 등록되었어요 🎉')).toBeInTheDocument();
    expect(await screen.findByText('다가오는 일정 📅')).toBeInTheDocument();
  });

  test('일정 폼은 지난 시각이면 제출하지 않는다', async () => {
    mockGets(true);
    renderApp('/clubs/1/schedules/new');
    fireEvent.change(await screen.findByLabelText('일정 제목 *'), { target: { value: '과거 일정' } });
    fireEvent.change(screen.getByLabelText('모임 날짜 *'), { target: { value: '2020-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: '일정 등록하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('모임 시작 일시는 지금 이후여야 해요.');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('일반 회원이 폼 주소로 직접 들어오면 권한 안내를 보여준다', async () => {
    mockGets(false);
    renderApp('/clubs/1/schedules/new');
    expect(await screen.findByText('방장 또는 운영진만 일정을 만들 수 있어요.')).toBeInTheDocument();
  });
});

describe('동호회 단체 채팅', () => {
  const { __state: socketState } = require('socket.io-client');
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const HISTORY = {
    room_id: 1,
    club: { id: 1, name: '잠실 셔틀콕즈', member_count: 5 },
    has_more: false,
    messages: [
      { id: 1, room_id: 1, type: 'system', content: '잠실 셔틀콕즈 단체방이 생성되었습니다.', created_at: '2026-09-01 10:00:00', sender: { id: 1, nickname: '민수' } },
      { id: 2, room_id: 1, type: 'text', content: '이번 주 토요일 9시 정기 운동 있습니다!', created_at: '2026-11-17 20:00:00', sender: { id: 1, nickname: '민수' } },
      { id: 3, room_id: 1, type: 'text', content: '저 참석할게요', created_at: '2026-11-17 20:05:00', sender: { id: 7, nickname: '테스터' } },
    ],
  };
  const lastSocket = () => socketState.sockets[socketState.sockets.length - 1];

  beforeEach(() => {
    socketState.sockets.length = 0;
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify(ME));
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      if (url.includes('/api/clubs/1/chat/messages')) return Promise.resolve({ data: HISTORY });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  async function openChat() {
    renderApp('/clubs/1/chat');
    await screen.findByText('이번 주 토요일 9시 정기 운동 있습니다!');
    const socket = lastSocket();
    socket.responders['chat:join'] = () => ({ ok: true, roomId: 1 });
    act(() => socket.fire('connect'));
    await screen.findByText('회원 5명');
    return socket;
  }

  test('입장하면 이전 대화를 불러오고, 내 말풍선은 오른쪽(민트)·남의 말풍선은 왼쪽(회색, 프로필)으로 보여준다', async () => {
    const socket = await openChat();

    expect(axios.get).toHaveBeenCalledWith('http://localhost:5001/api/clubs/1/chat/messages?limit=50', AUTH);
    expect(socket.opts.auth).toEqual({ token: FAKE_TOKEN });
    expect(socket.emitted).toContainEqual({ ev: 'chat:join', payload: { clubId: 1 } });

    const others = screen.getByText('이번 주 토요일 9시 정기 운동 있습니다!');
    expect(others).toHaveClass('bg-gray-100');
    expect(others.closest('li')).toHaveTextContent('민수'); // 닉네임 + 프로필
    const mine = screen.getByText('저 참석할게요');
    expect(mine).toHaveClass('bg-mint-500');
    expect(mine.closest('li')).toHaveClass('justify-end');
    expect(screen.getByText('잠실 셔틀콕즈 단체방이 생성되었습니다.')).toBeInTheDocument(); // 시스템 메시지
    expect(screen.getByText('2026년 11월 17일 화요일')).toBeInTheDocument(); // 날짜 구분선
  });

  test('메시지를 보내면 소켓으로 전송하고, 서버 응답 후 확정된다', async () => {
    const socket = await openChat();
    socket.responders['chat:send'] = (p) => ({
      ok: true,
      message: { id: 10, room_id: 1, type: 'text', content: p.content, created_at: '2026-11-18 16:30:00', sender: { id: 7, nickname: '테스터' } },
    });

    fireEvent.change(screen.getByLabelText('메시지 입력'), { target: { value: '  안녕하세요!  ' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    const sent = socket.emitted.find((e) => e.ev === 'chat:send');
    expect(sent.payload).toMatchObject({ clubId: 1, content: '안녕하세요!' });
    expect(sent.payload.clientId).toBeTruthy();
    expect(await screen.findByText('안녕하세요!')).toHaveClass('bg-mint-500');
    expect(screen.getByLabelText('메시지 입력')).toHaveValue('');

    // 같은 메시지가 방 전체 브로드캐스트로 다시 와도 중복되지 않는다
    act(() =>
      socket.fire('chat:message', {
        id: 10, room_id: 1, type: 'text', content: '안녕하세요!', created_at: '2026-11-18 16:30:00',
        sender: { id: 7, nickname: '테스터' }, client_id: sent.payload.clientId,
      })
    );
    expect(screen.getAllByText('안녕하세요!')).toHaveLength(1);
  });

  test('다른 사람이 보낸 메시지가 실시간으로 왼쪽에 추가된다', async () => {
    const socket = await openChat();
    act(() =>
      socket.fire('chat:message', {
        id: 11, room_id: 1, type: 'text', content: '셔틀콕 제가 챙길게요', created_at: '2026-11-18 16:31:00',
        sender: { id: 4, nickname: '서연' }, client_id: null,
      })
    );
    const bubble = await screen.findByText('셔틀콕 제가 챙길게요');
    expect(bubble).toHaveClass('bg-gray-100');
    expect(within(bubble.closest('li')).getByText('서연')).toBeInTheDocument();
  });

  test('한글 조합 중 Enter는 전송하지 않고, 조합이 끝난 Enter는 전송한다', async () => {
    const socket = await openChat();
    const input = screen.getByLabelText('메시지 입력');
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(socket.emitted.some((e) => e.ev === 'chat:send')).toBe(false);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(socket.emitted.filter((e) => e.ev === 'chat:send')).toHaveLength(1);
  });

  test('전송에 실패하면 실패 표시와 다시 보내기 버튼을 보여준다', async () => {
    const socket = await openChat();
    socket.responders['chat:send'] = () => ({ ok: false, error: '메시지를 보내지 못했습니다.' });
    fireEvent.change(screen.getByLabelText('메시지 입력'), { target: { value: '실패할 메시지' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));
    expect(await screen.findByRole('button', { name: '다시 보내기' })).toBeInTheDocument();
  });

  test('승인된 회원이 아니면(403) 채팅을 볼 수 없다', async () => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      return Promise.reject({ response: { status: 403, data: { error: '동호회 회원만 이용할 수 있습니다.' } } });
    });
    renderApp('/clubs/1/chat');
    expect(await screen.findByText('동호회 회원만 이용할 수 있습니다.')).toBeInTheDocument();
    expect(screen.queryByLabelText('메시지 입력')).not.toBeInTheDocument();
  });

  test('화면을 나가면 소켓 연결을 끊는다', async () => {
    const socket = await openChat();
    fireEvent.click(screen.getByRole('button', { name: '뒤로가기' }));
    await waitFor(() => expect(socket.disconnected).toBe(true));
    expect(socket.emitted).toContainEqual({ ev: 'chat:leave', payload: { clubId: 1 } });
  });
});

describe('동호회 만들기', () => {
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const VENUE_LIST = [
    { id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴', address: '서울 송파구 올림픽로 25' },
    { id: 4, name: '반포 한강 농구장', sport: '농구', address: '서울 서초구 신반포로11길 40' },
  ];
  const NEW_CLUB_DETAIL = {
    club: { id: 9, name: '반포 나이트 농구', venue_id: 4, venue_name: '반포 한강 농구장', sport: '농구', member_count: 1, max_members: 15 },
    my_role: 'owner',
    my_role_label: '방장',
    can_manage: true,
    schedules: [],
  };

  beforeEach(() => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify(ME));
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      if (url.endsWith('/api/me/clubs')) return Promise.resolve({ data: { clubs: [] } });
      if (url.endsWith('/api/venues')) return Promise.resolve({ data: VENUE_LIST });
      if (url.includes('/api/clubs/9/schedules')) return Promise.resolve({ data: NEW_CLUB_DETAIL });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  test('내 모임 화면의 FAB를 누르면 개설 폼(/clubs/new)으로 이동한다', async () => {
    renderApp('/my-clubs');
    fireEvent.click(await screen.findByRole('link', { name: /새 동호회 만들기/ }));
    expect(await screen.findByRole('radiogroup', { name: '주 활동 장소' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /반포 한강 농구장/ })).toBeInTheDocument();
  });

  test('장소를 고르고 이름·소개를 입력하면 개설 API를 호출하고, 새 동호회 상세로 이동한다', async () => {
    axios.post.mockResolvedValueOnce({
      data: { message: '동호회가 개설되었습니다.', club: { id: 9, name: '반포 나이트 농구', venue_id: 4, my_role: 'owner' } },
    });
    renderApp('/clubs/new');

    fireEvent.click(await screen.findByRole('radio', { name: /반포 한강 농구장/ }));
    expect(screen.getByRole('radio', { name: /반포 한강 농구장/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('동호회 이름'), { target: { value: ' 반포 나이트 농구 ' } });
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '퇴근 후 한강에서 농구해요' } });
    fireEvent.change(screen.getByLabelText('정원 (명)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '동호회 개설하기' }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5001/api/clubs',
        {
          venue_id: 4, name: '반포 나이트 농구', description: '퇴근 후 한강에서 농구해요',
          skill_level: undefined, activity_time: undefined, max_members: 15, monthly_fee: undefined,
        },
        AUTH
      )
    );
    // 새 동호회 상세 화면 + 방장 권한(FAB) + 개설 완료 안내
    expect(await screen.findByText("'반포 나이트 농구' 동호회가 개설되었어요 🎉")).toBeInTheDocument();
    expect(await screen.findByText('다가오는 일정 📅')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /새 일정 만들기/ })).toBeInTheDocument();
  });

  test('장소를 고르지 않거나 이름이 짧으면 제출하지 않는다', async () => {
    renderApp('/clubs/new');
    await screen.findByRole('radio', { name: /잠실 배드민턴 체육관/ });

    fireEvent.click(screen.getByRole('button', { name: '동호회 개설하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('주 활동 장소를 선택해 주세요.');

    fireEvent.click(screen.getByRole('radio', { name: /잠실 배드민턴 체육관/ }));
    fireEvent.change(screen.getByLabelText('동호회 이름'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '소개' } });
    fireEvent.click(screen.getByRole('button', { name: '동호회 개설하기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('동호회 이름은 2~30자로 입력해 주세요.');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('종목 칩으로 장소 목록을 거를 수 있다', async () => {
    renderApp('/clubs/new');
    await screen.findByRole('radio', { name: /잠실 배드민턴 체육관/ });
    fireEvent.click(screen.getByRole('button', { name: /농구/ }));
    expect(screen.queryByRole('radio', { name: /잠실 배드민턴 체육관/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /반포 한강 농구장/ })).toBeInTheDocument();
  });

  test('서버가 거절하면(중복 이름 등) 안내 문구를 보여준다', async () => {
    axios.post.mockRejectedValueOnce({ response: { status: 409, data: { error: '같은 장소에 같은 이름의 동호회가 이미 있어요.' } } });
    renderApp('/clubs/new');
    fireEvent.click(await screen.findByRole('radio', { name: /반포 한강 농구장/ }));
    fireEvent.change(screen.getByLabelText('동호회 이름'), { target: { value: '반포 3on3' } });
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '한강 농구' } });
    fireEvent.click(screen.getByRole('button', { name: '동호회 개설하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('같은 장소에 같은 이름의 동호회가 이미 있어요.');
  });

  test('비로그인 상태로 개설 폼에 들어오면 로그인 화면으로 보낸다', async () => {
    localStorage.clear();
    renderApp('/clubs/new');
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
  });
});

describe('동호회 개설 + 장소 직접 등록 (카카오맵)', () => {
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const VENUE_LIST = [
    { id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴', address: '서울 송파구 올림픽로 25' },
    { id: 4, name: '반포 한강 농구장', sport: '농구', address: '서울 서초구 신반포로11길 40' },
  ];
  const detail = (venueStatus) => ({
    club: { id: 12, name: '석촌 콕콕', venue_id: 7, venue_name: '석촌호수 야외 배드민턴장', venue_status: venueStatus, sport: '배드민턴', member_count: 1, max_members: null },
    my_role: 'owner',
    my_role_label: '방장',
    can_manage: true,
    schedules: [],
  });

  /** 카카오맵 SDK 흉내: 지도 이동/클릭 이벤트를 테스트에서 직접 발생시킬 수 있다 */
  function installFakeKakao() {
    const state = { map: null, marker: null, listeners: {}, geocodeCalls: [], searches: [] };
    class LatLng {
      constructor(lat, lng) {
        this.lat = lat;
        this.lng = lng;
      }
      getLat() {
        return this.lat;
      }
      getLng() {
        return this.lng;
      }
    }
    class FakeMap {
      constructor(el, opts) {
        this.center = opts.center;
        state.map = this;
      }
      getCenter() {
        return this.center;
      }
      setCenter(c) {
        this.center = c;
        state.listeners.center_changed?.();
        state.listeners.idle?.();
      }
      panTo(c) {
        this.setCenter(c);
      }
      setLevel(level) {
        this.level = level;
      }
    }
    class FakeMarker {
      constructor({ position }) {
        this.position = position;
        state.marker = this;
      }
      setPosition(p) {
        this.position = p;
      }
    }
    window.kakao = {
      maps: {
        load: (cb) => cb(),
        LatLng,
        Map: FakeMap,
        Marker: FakeMarker,
        event: {
          addListener: (target, type, handler) => {
            state.listeners[type] = handler;
          },
        },
        services: {
          Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' },
          Geocoder: class {
            coord2Address(lng, lat, cb) {
              state.geocodeCalls.push([lat, lng]);
              cb([{ road_address: { address_name: `서울 송파구 테스트로 ${Math.round(lat * 1000) % 100}` } }], 'OK');
            }
            addressSearch(query, cb) {
              state.searches.push(['address', query]);
              if (query === '올림픽로 25') {
                cb([{ address_name: '서울 송파구 잠실동 10', road_address: { address_name: '서울 송파구 올림픽로 25', building_name: '잠실종합운동장' }, address: { address_name: '서울 송파구 잠실동 10' }, x: '127.0736', y: '37.515' }], 'OK');
              } else cb([], 'ZERO_RESULT');
            }
          },
          Places: class {
            keywordSearch(query, cb, opts) {
              state.searches.push(['keyword', query, opts]);
              if (query === '잠실종합운동장') {
                cb(
                  Array.from({ length: 7 }, (_, i) => ({
                    id: String(i + 1),
                    place_name: i === 0 ? '잠실종합운동장' : `잠실종합운동장 ${i}번 시설`,
                    road_address_name: i === 0 ? '서울 송파구 올림픽로 25' : `서울 송파구 올림픽로 ${25 + i}`,
                    address_name: `서울 송파구 잠실동 ${10 + i}`,
                    category_name: '스포츠,레저 > 운동장',
                    x: String(127.0736 + i * 0.001),
                    y: String(37.515 + i * 0.001),
                  })).slice(0, opts?.size || 15),
                  'OK'
                );
              } else if (query === '올림픽로 25') {
                // 주소 검색과 같은 좌표 → 중복 제거 대상
                cb([{ id: '99', place_name: '잠실종합운동장', road_address_name: '서울 송파구 올림픽로 25', address_name: '서울 송파구 잠실동 10', x: '127.0736', y: '37.515' }], 'OK');
              } else cb([], 'ZERO_RESULT');
            }
          },
        },
      },
    };
    return { state, LatLng };
  }

  beforeEach(() => {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify(ME));
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      if (url.endsWith('/api/venues')) return Promise.resolve({ data: VENUE_LIST });
      if (url.includes('/api/clubs/12/schedules')) return Promise.resolve({ data: detail('pending') });
      if (url.endsWith('/api/me/clubs'))
        return Promise.resolve({
          data: {
            clubs: [
              { id: 12, name: '석촌 콕콕', venue: { id: 7, name: '석촌호수 야외 배드민턴장', sport: '배드민턴', status: 'pending' },
                member_count: 1, max_members: null, my_role: 'owner', my_role_label: '방장', my_status: 'approved', can_manage: true, pending_count: 0 },
              { id: 2, name: '성수 FC', venue: { id: 2, name: '성수 루프탑 풋살장', sport: '풋살', status: 'approved' },
                member_count: 3, max_members: 16, my_role: 'member', my_role_label: '회원', my_status: 'approved', can_manage: false },
            ],
          },
        });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  afterEach(() => {
    delete window.kakao;
  });

  test('마이페이지에는 더 이상 별도의 장소 제보 메뉴가 없다', async () => {
    renderApp('/my');
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.queryByText(/장소 제보하기/)).not.toBeInTheDocument();
  });

  test("'찾는 장소가 없나요? 직접 등록하기'를 누르면 지도와 장소 입력 폼이 펼쳐진다", async () => {
    installFakeKakao();
    renderApp('/clubs/new');
    fireEvent.click(await screen.findByRole('button', { name: /찾는 장소가 없나요\? 직접 등록하기/ }));

    expect(await screen.findByTestId('kakao-map')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /직접 등록하기/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('장소 이름')).toBeInTheDocument();
    expect(screen.getByLabelText('종목')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '주 활동 장소' })).not.toBeInTheDocument();
    // 기본 중심 좌표와 주소가 자동으로 채워진다
    expect(screen.getByTestId('picked-coords')).toHaveTextContent('위도 37.51330 · 경도 127.10010');
    expect(screen.getByLabelText('장소 주소')).toHaveValue('서울 송파구 테스트로 13');
  });

  test('지도에 핀을 꽂고 장소+동호회 정보를 한 번에 제출하면 new_venue와 함께 개설되고, 상세에 승인 대기 배너가 뜬다', async () => {
    const { state, LatLng } = installFakeKakao();
    axios.post.mockResolvedValueOnce({
      data: {
        message: '동호회가 개설되었습니다. 장소는 관리자 승인 후 지도에 공개됩니다.',
        club: { id: 12, name: '석촌 콕콕', venue_id: 7, venue_status: 'pending', my_role: 'owner' },
      },
    });
    renderApp('/clubs/new');
    fireEvent.click(await screen.findByRole('tab', { name: /직접 등록하기/ }));
    await screen.findByTestId('picked-coords');

    act(() => state.listeners.click({ latLng: new LatLng(37.508891, 127.100312) }));
    expect(state.marker.position.getLat()).toBe(37.508891);

    fireEvent.change(screen.getByLabelText('장소 이름'), { target: { value: '석촌호수 야외 배드민턴장' } });
    fireEvent.change(screen.getByLabelText('종목'), { target: { value: '배드민턴' } });
    fireEvent.change(screen.getByLabelText(/장소 설명/), { target: { value: '우레탄 바닥' } });
    fireEvent.change(screen.getByLabelText('동호회 이름'), { target: { value: '석촌 콕콕' } });
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '석촌호수에서 배드민턴' } });
    fireEvent.click(screen.getByRole('button', { name: '동호회 개설하기' }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5001/api/clubs',
        {
          new_venue: {
            name: '석촌호수 야외 배드민턴장', sport: '배드민턴', address: '서울 송파구 테스트로 9',
            lat: 37.508891, lng: 127.100312, description: '우레탄 바닥',
          },
          name: '석촌 콕콕', description: '석촌호수에서 배드민턴',
          skill_level: undefined, activity_time: undefined, max_members: undefined, monthly_fee: undefined,
        },
        AUTH
      )
    );
    expect(await screen.findByText(/장소는 승인 후 지도에 공개돼요/)).toBeInTheDocument();
    const banner = await screen.findByText('장소 승인 대기 중');
    expect(banner.closest('[role=status]')).toHaveTextContent('승인 후 지도에 공개됩니다');
  });

  test('직접 등록 모드에서 위치/종목이 없으면 제출하지 않는다', async () => {
    renderApp('/clubs/new'); // 카카오 SDK 없음 → 위치 선택 불가
    fireEvent.click(await screen.findByRole('tab', { name: /직접 등록하기/ }));
    expect(await screen.findByText('카카오맵을 불러오지 못했어요')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('동호회 이름'), { target: { value: '테스트 클럽' } });
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '소개' } });
    fireEvent.click(screen.getByRole('button', { name: '동호회 개설하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('지도에서 장소 위치를 선택해 주세요.');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('이미 등록된 장소를 직접 등록하려 하면 목록 모드로 돌아가 그 장소를 골라 준다', async () => {
    const { state, LatLng } = installFakeKakao();
    axios.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: '이미 등록된 장소예요. 목록에서 선택해 주세요.', existing_venue: { id: 1, name: '잠실 배드민턴 체육관' } } },
    });
    renderApp('/clubs/new');
    fireEvent.click(await screen.findByRole('tab', { name: /직접 등록하기/ }));
    await screen.findByTestId('picked-coords');
    act(() => state.listeners.click({ latLng: new LatLng(37.5155, 127.0731) }));
    fireEvent.change(screen.getByLabelText('장소 이름'), { target: { value: '잠실 배드민턴 체육관' } });
    fireEvent.change(screen.getByLabelText('종목'), { target: { value: '배드민턴' } });
    fireEvent.change(screen.getByLabelText('동호회 이름'), { target: { value: '잠실 새 클럽' } });
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '소개' } });
    fireEvent.click(screen.getByRole('button', { name: '동호회 개설하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 등록된 장소라 목록에서 선택해 두었어요');
    expect(screen.getByRole('radio', { name: /잠실 배드민턴 체육관/ })).toHaveAttribute('aria-checked', 'true');
  });

  test("'내 모임' 목록에서 장소 승인 대기 중인 동호회에 뱃지를 보여준다", async () => {
    renderApp('/my-clubs');
    const pendingRow = (await screen.findByText('석촌 콕콕')).closest('li');
    expect(within(pendingRow).getByText('⏳ 장소 승인 대기 중')).toBeInTheDocument();
    const approvedRow = screen.getByText('성수 FC').closest('li');
    expect(within(approvedRow).queryByText(/장소 승인 대기 중/)).not.toBeInTheDocument();
  });

  test('승인된 장소의 동호회 상세에는 승인 대기 배너가 없다', async () => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      return Promise.resolve({ data: detail('approved') });
    });
    renderApp('/clubs/12');
    expect(await screen.findByText('다가오는 일정 📅')).toBeInTheDocument();
    expect(screen.queryByText('장소 승인 대기 중')).not.toBeInTheDocument();
  });

  describe('지도 검색 (주소·장소명)', () => {
    async function openNewVenue() {
      const kakao = installFakeKakao();
      renderApp('/clubs/new');
      fireEvent.click(await screen.findByRole('tab', { name: /직접 등록하기/ }));
      await screen.findByTestId('picked-coords');
      return kakao;
    }
    const search = (q) => {
      fireEvent.change(screen.getByLabelText('주소 또는 장소명 검색'), { target: { value: q } });
      fireEvent.click(screen.getByRole('button', { name: '검색' }));
    };

    test('지도 위에 검색창이 있고, 키워드 검색 결과를 최대 5개 드롭다운으로 보여준다', async () => {
      const { state } = await openNewVenue();
      expect(screen.getByPlaceholderText('주소 또는 장소명 검색 (예: 잠실종합운동장)')).toBeInTheDocument();
      search('잠실종합운동장');

      const list = await screen.findByRole('listbox', { name: '검색 결과' });
      expect(within(list).getAllByRole('option')).toHaveLength(5);
      expect(list).toHaveTextContent('잠실종합운동장');
      expect(list).toHaveTextContent('서울 송파구 올림픽로 25');
      // Places(키워드)와 Geocoder(주소)를 모두 사용
      expect(state.searches.map((x) => x[0]).sort()).toEqual(['address', 'keyword']);
    });

    test('결과를 누르면 지도 중심·핀이 이동하고 좌표·주소·장소명(비어 있을 때)이 자동 입력된다', async () => {
      const { state } = await openNewVenue();
      search('잠실종합운동장');
      fireEvent.click(await screen.findByRole('button', { name: /^잠실종합운동장\s*운동장/ }));

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(state.map.getCenter().getLat()).toBeCloseTo(37.515);
      expect(state.marker.position.getLng()).toBeCloseTo(127.0736);
      expect(screen.getByTestId('picked-coords')).toHaveTextContent('위도 37.51500 · 경도 127.07360');
      // 역지오코딩(테스트로 15)으로 덮어쓰지 않고 검색 결과 주소를 그대로 사용
      expect(screen.getByLabelText('장소 주소')).toHaveValue('서울 송파구 올림픽로 25');
      expect(screen.getByLabelText('장소 이름')).toHaveValue('잠실종합운동장');
    });

    test('검색 후에도 지도를 터치/드래그해서 핀 위치를 미세 조정할 수 있다', async () => {
      const { state, LatLng } = await openNewVenue();
      search('잠실종합운동장');
      fireEvent.click(await screen.findByRole('button', { name: /^잠실종합운동장\s*운동장/ }));

      act(() => state.listeners.click({ latLng: new LatLng(37.5153, 127.0741) }));
      expect(screen.getByTestId('picked-coords')).toHaveTextContent('위도 37.51530 · 경도 127.07410');
      expect(state.marker.position.getLat()).toBe(37.5153);
      // 미세 조정 시에는 다시 역지오코딩으로 주소 갱신
      expect(screen.getByLabelText('장소 주소')).toHaveValue('서울 송파구 테스트로 15');
      // 장소명은 그대로 유지
      expect(screen.getByLabelText('장소 이름')).toHaveValue('잠실종합운동장');
    });

    test('이미 입력한 장소명은 검색 결과로 덮어쓰지 않는다', async () => {
      await openNewVenue();
      fireEvent.change(screen.getByLabelText('장소 이름'), { target: { value: '우리 동네 코트' } });
      search('잠실종합운동장');
      fireEvent.click(await screen.findByRole('button', { name: /^잠실종합운동장\s*운동장/ }));
      expect(screen.getByLabelText('장소 이름')).toHaveValue('우리 동네 코트');
      expect(screen.getByLabelText('장소 주소')).toHaveValue('서울 송파구 올림픽로 25');
    });

    test('주소 검색 결과도 보여주고, 같은 좌표의 키워드 결과와 중복되지 않는다', async () => {
      await openNewVenue();
      search('올림픽로 25');
      const list = await screen.findByRole('listbox', { name: '검색 결과' });
      expect(within(list).getAllByRole('option')).toHaveLength(1);
      expect(list).toHaveTextContent('🏠');
      expect(list).toHaveTextContent('잠실종합운동장');
    });

    test('검색창에서 Enter는 검색만 하고 동호회 폼을 제출하지 않는다', async () => {
      await openNewVenue();
      const input = screen.getByLabelText('주소 또는 장소명 검색');
      fireEvent.change(input, { target: { value: '잠실종합운동장' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(await screen.findByRole('listbox', { name: '검색 결과' })).toBeInTheDocument();
      expect(axios.post).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('결과가 없으면 안내 문구를 보여준다', async () => {
      await openNewVenue();
      search('없는장소이름xyz');
      expect(await screen.findByText(/검색 결과가 없어요/)).toBeInTheDocument();
    });
  });
});

describe('최고 관리자 백오피스', () => {
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const ADMIN = { ...ME, id: 8, nickname: '관리자', email: 'admin@test.com', is_admin: true };
  const STATS = { users: 8, clubs: 9, venues: { total: 9, approved: 6, pending: 2, rejected: 1 } };
  const PENDING = [
    { id: 7, name: '코드아이티 체육관', sport: '농구', address: '서울 성동구', lat: 37.54, lng: 127.05, status: 'pending', club_count: 1,
      submitted_by: { id: 1, nickname: '민수', email: 'minsu@test.com' }, created_at: '2026-11-18 07:00:00' },
    { id: 9, name: '한강 뚝섬 농구장', sport: '농구', address: '서울 광진구', lat: 37.53, lng: 127.07, status: 'pending', club_count: 0,
      submitted_by: { id: 6, nickname: '유나', email: 'yuna@test.com' }, created_at: '2026-11-18 08:00:00' },
  ];
  const COUNTS = { pending: 2, approved: 6, rejected: 1, all: 9 };
  const detailOf = (v) => ({ ...v, phone: null, description: '우레탄 바닥', clubs: v.club_count ? [{ id: 20, name: '코드아이티 동호회', owner_nickname: '민수', member_count: 1 }] : [] });
  const CLUBS = [
    { id: 1, name: '잠실 셔틀콕즈', recruit_status: 'recruiting', is_public: true, max_members: 30, member_count: 4, pending_count: 2, schedule_count: 3,
      venue: { id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴', status: 'approved' }, owner: { id: 1, nickname: '민수', email: 'minsu@test.com' }, created_at: '2026-09-01 01:00:00' },
    { id: 20, name: '코드아이티 동호회', recruit_status: 'recruiting', is_public: true, max_members: null, member_count: 1, pending_count: 0, schedule_count: 0,
      venue: { id: 7, name: '코드아이티 체육관', sport: '농구', status: 'pending' }, owner: { id: 1, nickname: '민수', email: 'minsu@test.com' }, created_at: '2026-11-18 07:00:00' },
  ];
  const USERS = [
    { id: 8, nickname: '관리자', email: 'admin@test.com', created_at: '2026-11-18 08:00:00', is_admin: true, club_count: 0, owned_club_count: 0 },
    { id: 6, nickname: '유나', email: 'yuna@test.com', created_at: '2026-11-18 04:00:00', is_admin: false, club_count: 2, owned_club_count: 1 },
  ];

  function mockAdminApi(me = ADMIN) {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: me } });
      if (url.endsWith('/api/admin/stats')) return Promise.resolve({ data: STATS });
      if (url.includes('/api/admin/venues?status=pending')) return Promise.resolve({ data: { venues: PENDING, counts: COUNTS } });
      if (url.includes('/api/admin/venues?status=')) return Promise.resolve({ data: { venues: [], counts: COUNTS } });
      const m = url.match(/\/api\/admin\/venues\/(\d+)$/);
      if (m) return Promise.resolve({ data: { venue: detailOf(PENDING.find((v) => v.id === Number(m[1]))) } });
      if (url.endsWith('/api/admin/clubs')) return Promise.resolve({ data: { clubs: CLUBS } });
      if (url.endsWith('/api/admin/users')) return Promise.resolve({ data: { users: USERS } });
      return Promise.resolve({ data: VENUES });
    });
  }

  function loginAs(user) {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify(user));
  }

  test('일반 회원이 /admin에 들어오면 알림 후 메인으로 돌려보낸다', async () => {
    loginAs(ME);
    mockAdminApi(ME);
    renderApp('/admin');
    expect(await screen.findByText('오늘의 번개 모임 ⚡')).toBeInTheDocument();
    expect(window.alert).toHaveBeenCalledWith('최고 관리자만 접근할 수 있는 페이지예요.');
    expect(screen.queryByText('SUPER ADMIN')).not.toBeInTheDocument();
  });

  test('저장된 프로필이 예전 것이어도 서버가 관리자라고 확인하면 들어갈 수 있다', async () => {
    loginAs(ME); // localStorage 에는 is_admin 없음
    mockAdminApi(ADMIN); // 서버는 관리자
    renderApp('/admin');
    expect(await screen.findByText('SUPER ADMIN')).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  test('비로그인으로 /admin에 들어오면 로그인 화면으로 보낸다', async () => {
    renderApp('/admin');
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  test('마이페이지의 관리자 진입 버튼은 최고 관리자에게만 보인다', async () => {
    loginAs(ME);
    mockAdminApi(ME);
    const { unmount } = renderApp('/my');
    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /최고 관리자 페이지/ })).not.toBeInTheDocument();
    unmount();

    loginAs(ADMIN);
    mockAdminApi(ADMIN);
    renderApp('/my');
    fireEvent.click(await screen.findByRole('link', { name: /최고 관리자 페이지/ }));
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument();
  });

  test('대시보드: 지표 카드 4개(승인 대기 강조)와 최근 승인 대기 목록', async () => {
    loginAs(ADMIN);
    mockAdminApi();
    renderApp('/admin');
    expect(await screen.findByRole('link', { name: '전체 회원 8' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '전체 동호회 9' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '전체 장소 9' })).toBeInTheDocument();
    const pendingCard = screen.getByRole('link', { name: '승인 대기 장소 2' });
    expect(pendingCard).toHaveClass('ring-amber-300');
    expect(await screen.findByRole('link', { name: /코드아이티 체육관.*검수하기/ })).toHaveAttribute('href', '/admin/venues?status=pending&id=7');
    // 사이드바 승인 대기 뱃지
    expect(screen.getByLabelText('승인 대기 2건')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /서비스로 돌아가기/ })).toHaveAttribute('href', '/');
  });

  test('장소 검수: 탭·리스트·상세 패널(로드뷰/스트리트뷰 링크), 승인하면 목록에서 빠지고 다음 장소가 선택된다', async () => {
    loginAs(ADMIN);
    mockAdminApi();
    axios.put.mockResolvedValueOnce({ data: { message: '장소를 승인했습니다.', venue: { ...PENDING[0], status: 'approved' } } });
    renderApp('/admin/venues?status=pending');

    expect(await screen.findByRole('tab', { name: /승인 대기\s*2/ })).toHaveAttribute('aria-selected', 'true');
    const panel = await screen.findByLabelText('장소 상세 검수');
    expect(within(panel).getByRole('heading', { name: /코드아이티 체육관/ })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /카카오 로드뷰 보기/ })).toHaveAttribute('href', 'https://map.kakao.com/link/roadview/37.54,127.05');
    expect(within(panel).getByRole('link', { name: /구글 스트리트뷰 보기/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=37.54,127.05'
    );
    expect(within(panel).getByRole('link', { name: /카카오 로드뷰 보기/ })).toHaveAttribute('target', '_blank');
    expect(within(panel).getByText('코드아이티 동호회')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: '✓ 승인' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith('http://localhost:5001/api/admin/venues/7', { status: 'approved' }, AUTH));
    expect(await screen.findByRole('status')).toHaveTextContent('장소를 승인했습니다.');
    const list = screen.getByRole('list', { name: '장소 목록' });
    await waitFor(() => expect(within(list).queryByText('코드아이티 체육관')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: /한강 뚝섬 농구장/ })).toBeInTheDocument();
  });

  test('장소 수정: 수정 폼에서 저장하면 PUT으로 정보를 보낸다', async () => {
    loginAs(ADMIN);
    mockAdminApi();
    axios.put.mockResolvedValueOnce({ data: { message: '장소 정보를 저장했습니다.', venue: { ...PENDING[0], name: '코드아이티 실내 체육관' } } });
    renderApp('/admin/venues?status=pending&id=7');
    const panel = await screen.findByLabelText('장소 상세 검수');
    fireEvent.click(await within(panel).findByRole('button', { name: '수정' }));
    const form = screen.getByRole('form', { name: '장소 정보 수정' });
    fireEvent.change(within(form).getByDisplayValue('코드아이티 체육관'), { target: { value: '코드아이티 실내 체육관' } });
    fireEvent.click(within(form).getByRole('button', { name: '저장' }));
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith(
        'http://localhost:5001/api/admin/venues/7',
        expect.objectContaining({ name: '코드아이티 실내 체육관', sport: '농구', lat: 37.54, lng: 127.05 }),
        AUTH
      )
    );
    expect(await within(panel).findByRole('heading', { name: /코드아이티 실내 체육관/ })).toBeInTheDocument();
  });

  test('동호회가 있는 장소 삭제는 한 번 더 확인한 뒤 force로 삭제한다', async () => {
    loginAs(ADMIN);
    mockAdminApi();
    axios.delete
      .mockRejectedValueOnce({ response: { status: 409, data: { error: '이 장소에 동호회 1개가 있어요.', club_count: 1 } } })
      .mockResolvedValueOnce({ data: { message: "'코드아이티 체육관' 장소를 삭제했습니다." } });
    renderApp('/admin/venues?status=pending&id=7');
    const panel = await screen.findByLabelText('장소 상세 검수');
    fireEvent.click(await within(panel).findByRole('button', { name: '삭제' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledTimes(2));
    expect(axios.delete).toHaveBeenNthCalledWith(1, 'http://localhost:5001/api/admin/venues/7', AUTH);
    expect(axios.delete).toHaveBeenNthCalledWith(2, 'http://localhost:5001/api/admin/venues/7?force=true', AUTH);
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  test('동호회 관리: 표 검색·장소 상태 필터·삭제', async () => {
    loginAs(ADMIN);
    mockAdminApi();
    axios.delete.mockResolvedValueOnce({ data: { message: "'잠실 셔틀콕즈' 동호회를 삭제했습니다." } });
    renderApp('/admin/clubs');
    const table = await screen.findByRole('table', { name: '동호회 목록' });
    expect(await within(table).findByText('잠실 셔틀콕즈')).toBeInTheDocument();
    expect(within(table).getByText('승인 대기')).toBeInTheDocument(); // 소속 장소 상태

    fireEvent.change(screen.getByLabelText('동호회 검색'), { target: { value: '코드' } });
    expect(within(table).queryByText('잠실 셔틀콕즈')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('동호회 검색'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('장소 상태 필터'), { target: { value: 'approved' } });
    expect(within(table).queryByText('코드아이티 동호회')).not.toBeInTheDocument();

    fireEvent.click(within(table).getByRole('button', { name: '잠실 셔틀콕즈 삭제' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('http://localhost:5001/api/admin/clubs/1', AUTH));
    await waitFor(() => expect(within(table).queryByText('잠실 셔틀콕즈')).not.toBeInTheDocument());
  });

  test('회원 관리: 검색과 관리자 권한 토글 (본인 해제 불가)', async () => {
    loginAs(ADMIN);
    mockAdminApi();
    axios.put.mockResolvedValueOnce({ data: { message: '유나님에게 관리자 권한을 부여했습니다.', user: { id: 6, is_admin: true } } });
    renderApp('/admin/users');
    const table = await screen.findByRole('table', { name: '회원 목록' });
    expect(await within(table).findByText('yuna@test.com')).toBeInTheDocument();
    expect(within(table).getByRole('switch', { name: '관리자 최고 관리자 권한' })).toBeDisabled();

    const yunaSwitch = within(table).getByRole('switch', { name: '유나 최고 관리자 권한' });
    expect(yunaSwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(yunaSwitch);
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith('http://localhost:5001/api/admin/users/6/admin', { is_admin: true }, AUTH));
    await waitFor(() => expect(yunaSwitch).toHaveAttribute('aria-checked', 'true'));

    fireEvent.change(screen.getByLabelText('회원 검색'), { target: { value: 'admin@' } });
    expect(within(table).queryByText('yuna@test.com')).not.toBeInTheDocument();
  });
});

describe('동호회 운영 CRUD (일정 수정·삭제 / 회원 역할·내보내기 / 정보 수정 / 탈퇴)', () => {
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const SCHEDULE = {
    id: 1, club_id: 1, title: '토요 정기 운동', description: '복식 위주', start_at: '2099-11-21 09:00:00', end_at: '2099-11-21 12:00:00',
    venue: { id: 1, name: '잠실 배드민턴 체육관', address: '서울 송파구' }, capacity: 20, fee: 5000, rsvp_deadline: '2099-11-20 22:00:00',
    counts: { attend: 2, maybe: 0, absent: 0 }, my_response: null, is_closed: false, close_reason: null, can_vote: true, can_attend: true,
    created_by: { id: 1, nickname: '민수' },
  };
  const clubSchedules = (role) => ({
    club: { id: 1, name: '잠실 셔틀콕즈', venue_id: 1, venue_name: '잠실 배드민턴 체육관', venue_status: 'approved', sport: '배드민턴', member_count: 4, max_members: 30 },
    my_role: role,
    my_role_label: { owner: '방장', manager: '운영진', member: '회원' }[role],
    can_manage: role !== 'member',
    schedules: [SCHEDULE],
  });
  const membersOf = (myRole) => ({
    club: { id: 1, name: '잠실 셔틀콕즈', description: '초보~중수 환영', venue_id: 1, venue_name: '잠실 배드민턴 체육관', sport: '배드민턴', max_members: 30, member_count: 4 },
    my_role: myRole,
    pending: [],
    members: [
      { user_id: 1, nickname: '민수', role: 'owner', role_label: '방장', status: 'approved', joined_at: '2026-09-01 10:00:00' },
      { user_id: 3, nickname: '현우', role: 'manager', role_label: '운영진', status: 'approved', joined_at: '2026-09-05 10:00:00' },
      { user_id: 6, nickname: '유나', role: 'member', role_label: '회원', status: 'approved', joined_at: '2026-10-01 10:00:00' },
    ],
  });

  function setup({ me = ME, role = 'owner' } = {}) {
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify(me));
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: me } });
      if (url.includes('/api/clubs/1/schedules')) return Promise.resolve({ data: clubSchedules(role) });
      if (url.endsWith('/api/schedules/1')) return Promise.resolve({ data: { schedule: { ...SCHEDULE, attendees: { attend: [], maybe: [], absent: [] } } } });
      if (url.endsWith('/api/clubs/1/members')) return Promise.resolve({ data: membersOf(role) });
      if (url.endsWith('/api/venues')) return Promise.resolve({ data: VENUES });
      if (url.endsWith('/api/me/clubs')) return Promise.resolve({ data: { clubs: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }

  async function openSheet() {
    renderApp('/clubs/1');
    fireEvent.click(await screen.findByRole('button', { name: /토요 정기 운동/ }));
    return screen.findByRole('dialog');
  }

  test('일반 회원의 일정 바텀시트에는 수정·삭제 버튼이 없다', async () => {
    setup({ role: 'member' });
    const sheet = await openSheet();
    await within(sheet).findByText('참석 여부를 알려주세요');
    expect(within(sheet).queryByRole('button', { name: '수정' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  test('방장/운영진: 수정을 누르면 기존 값이 채워진 폼으로 이동하고, 저장하면 PUT 후 돌아온다', async () => {
    setup({ role: 'manager' });
    axios.put.mockResolvedValueOnce({ data: { message: '일정을 수정했습니다.', schedule: SCHEDULE } });
    const sheet = await openSheet();
    fireEvent.click(await within(sheet).findByRole('button', { name: '수정' }));

    expect(await screen.findByRole('heading', { name: '일정 수정하기' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('일정 제목 *')).toHaveValue('토요 정기 운동'));
    expect(screen.getByLabelText('모임 날짜 *')).toHaveValue('2099-11-21');
    expect(screen.getByLabelText('시작 시간 *')).toHaveValue('09:00');
    expect(screen.getByLabelText('종료 시간')).toHaveValue('12:00');
    expect(screen.getByLabelText('정원 (명)')).toHaveValue(20);
    expect(screen.getByLabelText('참가비 (원)')).toHaveValue(5000);
    expect(screen.getByLabelText('투표 마감 (선택)')).toHaveValue('2099-11-20T22:00');
    expect(screen.getByLabelText('설명 (선택)')).toHaveValue('복식 위주');

    fireEvent.change(screen.getByLabelText('일정 제목 *'), { target: { value: '토요 정기 운동 (시간 변경)' } });
    fireEvent.change(screen.getByLabelText('시작 시간 *'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith(
        'http://localhost:5001/api/schedules/1',
        {
          title: '토요 정기 운동 (시간 변경)', start_at: '2099-11-21T10:00', end_at: '2099-11-21T12:00', venue_id: 1,
          capacity: 20, fee: 5000, rsvp_deadline: '2099-11-20T22:00', description: '복식 위주',
        },
        AUTH
      )
    );
    expect(await screen.findByText('일정을 수정했어요 ✏️')).toBeInTheDocument();
  });

  test('방장/운영진: 삭제는 확인창 후 DELETE하고 목록에서 사라진다 (취소하면 아무 일도 없다)', async () => {
    setup({ role: 'owner' });
    axios.delete.mockResolvedValueOnce({ data: { message: "'토요 정기 운동' 일정을 삭제했습니다." } });
    const sheet = await openSheet();

    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(await within(sheet).findByRole('button', { name: '삭제' }));
    expect(axios.delete).not.toHaveBeenCalled();

    fireEvent.click(within(sheet).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('http://localhost:5001/api/schedules/1', AUTH));
    expect(await screen.findByText('예정된 일정이 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('일정을 삭제했습니다');
  });

  test('방장: 운영진 지정/해제와 내보내기 버튼이 보이고, 확인 후 처리된다', async () => {
    setup({ me: { ...ME, id: 1, nickname: '민수' }, role: 'owner' });
    axios.put.mockResolvedValueOnce({ data: { message: '유나님을 운영진으로 지정했습니다.', member: { user_id: 6, role: 'manager', role_label: '운영진' } } });
    axios.delete.mockResolvedValueOnce({ data: { message: '현우님을 동호회에서 내보냈습니다.' } });
    renderApp('/clubs/1/manage');

    await screen.findByText('기존 회원 목록');
    // 방장 본인 행에는 버튼 없음
    expect(screen.queryByRole('button', { name: '민수 내보내기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '현우 운영진 해제' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '유나 운영진 지정' }));
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith('http://localhost:5001/api/clubs/1/members/6/role', { role: 'manager' }, AUTH)
    );
    expect(await screen.findByRole('button', { name: '유나 운영진 해제' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '현우 내보내기' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('http://localhost:5001/api/clubs/1/members/3', AUTH));
    await waitFor(() => expect(screen.queryByText('현우')).not.toBeInTheDocument());
  });

  test('운영진: 일반 회원만 내보낼 수 있고 운영진 지정 버튼은 없다', async () => {
    setup({ me: { ...ME, id: 3, nickname: '현우' }, role: 'manager' });
    renderApp('/clubs/1/manage');
    await screen.findByText('기존 회원 목록');
    expect(screen.getByRole('button', { name: '유나 내보내기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '민수 내보내기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /운영진 지정|운영진 해제/ })).not.toBeInTheDocument();
  });

  test('동호회 이름/소개 수정 폼', async () => {
    setup({ me: { ...ME, id: 1 }, role: 'owner' });
    axios.put.mockResolvedValueOnce({
      data: { message: '동호회 정보를 수정했습니다.', club: { id: 1, name: '잠실 셔틀콕즈 2기', description: '토요일 오전 복식' } },
    });
    renderApp('/clubs/1/manage');
    fireEvent.click(await screen.findByRole('button', { name: /동호회 정보 수정/ }));
    const form = screen.getByRole('form', { name: '동호회 정보 수정' });
    expect(within(form).getByLabelText('동호회 이름')).toHaveValue('잠실 셔틀콕즈');
    expect(within(form).getByLabelText('한 줄 소개')).toHaveValue('초보~중수 환영');
    fireEvent.change(within(form).getByLabelText('동호회 이름'), { target: { value: '잠실 셔틀콕즈 2기' } });
    fireEvent.change(within(form).getByLabelText('한 줄 소개'), { target: { value: '토요일 오전 복식' } });
    fireEvent.click(within(form).getByRole('button', { name: '저장하기' }));
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith(
        'http://localhost:5001/api/clubs/1',
        { name: '잠실 셔틀콕즈 2기', description: '토요일 오전 복식' },
        AUTH
      )
    );
    expect(await screen.findByText('잠실 셔틀콕즈 2기')).toBeInTheDocument();
  });

  test('일반 회원은 동호회 상세에서 확인 후 탈퇴하고 내 모임으로 이동한다', async () => {
    setup({ role: 'member' });
    axios.delete.mockResolvedValueOnce({ data: { message: "'잠실 셔틀콕즈'에서 탈퇴했습니다." } });
    renderApp('/clubs/1');
    fireEvent.click(await screen.findByRole('button', { name: '동호회 탈퇴' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith('http://localhost:5001/api/clubs/1/leave', AUTH));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("'잠실 셔틀콕즈' 동호회에서 탈퇴할까요?"));
    expect(window.alert).toHaveBeenCalledWith("'잠실 셔틀콕즈'에서 탈퇴했습니다.");
    expect(await screen.findByText('아직 가입한 동호회가 없어요.')).toBeInTheDocument();
  });

  test('방장에게는 탈퇴 버튼 대신 탈퇴 불가 안내가 보인다', async () => {
    setup({ role: 'owner' });
    renderApp('/clubs/1');
    expect(await screen.findByText('방장은 동호회를 탈퇴할 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '동호회 탈퇴' })).not.toBeInTheDocument();
  });
});

describe('탐색: 종목·검색 필터 + 지도/목록 전환', () => {
  const EXPLORE_VENUES = [
    {
      id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴', address: '서울 송파구 올림픽로 25', lat: 37.5154, lng: 127.073, club_count: 2,
      clubs: [
        { id: 1, name: '잠실 셔틀콕즈', recruit_status: 'recruiting', recruit_status_label: '모집중', member_count: 4, max_members: 30, my_status: 'approved' },
        { id: 5, name: '잠실 새벽콕', recruit_status: 'recruiting', recruit_status_label: '모집중', member_count: 2, max_members: 20, my_status: null },
      ],
    },
    { id: 2, name: '성수 루프탑 풋살장', sport: '풋살', address: '서울 성동구', lat: 37.5445, lng: 127.0557, club_count: 0, clubs: [] },
  ];
  const mapState = {};

  function installFakeKakaoMap() {
    Object.assign(mapState, { map: null, overlays: [], listeners: {}, bounds: null });
    class LatLng {
      constructor(lat, lng) { this.lat = lat; this.lng = lng; }
      getLat() { return this.lat; }
      getLng() { return this.lng; }
    }
    window.kakao = {
      maps: {
        load: (cb) => cb(),
        LatLng,
        LatLngBounds: class { constructor() { this.points = []; } extend(p) { this.points.push(p); } },
        Map: class {
          constructor(el, opts) { this.el = el; this.center = opts.center; this.level = opts.level; mapState.map = this; }
          setCenter(c) { this.center = c; }
          getCenter() { return this.center; }
          setLevel(l) { this.level = l; }
          panTo(c) { this.center = c; }
          setBounds(b) { mapState.bounds = b; }
        },
        // 오버레이 DOM을 지도 컨테이너에 붙여서 테스트에서 클릭할 수 있게
        CustomOverlay: class {
          constructor({ position, content, map }) {
            this.position = position; this.content = content; this.map = null;
            mapState.overlays.push(this);
            if (map) this.setMap(map);
          }
          setMap(map) {
            if (this.map) this.content.remove();
            this.map = map;
            if (map) map.el.appendChild(this.content);
          }
          setPosition(p) { this.position = p; }
          setZIndex() {}
        },
        event: { addListener: (t, type, h) => { mapState.listeners[type] = h; } },
      },
    };
  }

  beforeEach(() => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: ME } });
      if (url.includes('/api/venues')) {
        const qs = new URLSearchParams(url.split('?')[1] || '');
        const sport = qs.get('sport');
        const q = qs.get('q');
        return Promise.resolve({
          data: EXPLORE_VENUES.filter(
            (v) => (!sport || v.sport === sport) && (!q || `${v.name} ${v.address} ${v.clubs.map((c) => c.name).join(' ')}`.includes(q))
          ),
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    delete window.kakao;
  });

  test('하단 검색 탭과 메인 상단 돋보기로 탐색 화면에 들어간다', async () => {
    renderApp();
    expect(screen.getByRole('link', { name: '장소·동호회 검색' })).toHaveAttribute('href', '/explore');
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    expect(await screen.findByLabelText('장소명·지역·동호회명 검색')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '종목 필터' })).toBeInTheDocument();
    expect(await screen.findByText('잠실 배드민턴 체육관')).toBeInTheDocument();
  });

  test('종목 칩과 검색어로 실시간 필터링된다 (서버에 sport/q 전달)', async () => {
    renderApp('/explore');
    const results = await screen.findByRole('list', { name: '검색 결과' });
    expect(within(results).getAllByRole('listitem')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /풋살/, pressed: false }));
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith(expect.stringContaining(`sport=${encodeURIComponent('풋살')}`), expect.anything()));
    await waitFor(() => expect(screen.queryByText('잠실 배드민턴 체육관')).not.toBeInTheDocument());
    expect(screen.getByText('성수 루프탑 풋살장')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    fireEvent.change(screen.getByLabelText('장소명·지역·동호회명 검색'), { target: { value: '새벽콕' } });
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith(expect.stringContaining(`q=${encodeURIComponent('새벽콕')}`), expect.anything()));
    await waitFor(() => expect(screen.queryByText('성수 루프탑 풋살장')).not.toBeInTheDocument());
    expect(screen.getByText('잠실 배드민턴 체육관')).toBeInTheDocument();
    expect(screen.getByText(/'새벽콕'/)).toBeInTheDocument();
  });

  test('목록 카드의 동호회 칩: 내 동호회는 상세로, 아니면 장소 메뉴판(가입/문의)으로 연결된다', async () => {
    renderApp('/explore');
    expect(await screen.findByRole('link', { name: /잠실 셔틀콕즈/ })).toHaveAttribute('href', '/clubs/1');
    expect(screen.getByRole('link', { name: '잠실 새벽콕' })).toHaveAttribute('href', '/venues/1?club=5');
  });

  test('지도 보기: 필터된 장소가 핀으로 뜨고, 핀을 누르면 요약 카드와 동호회 목록이 열린다', async () => {
    installFakeKakaoMap();
    renderApp('/explore');
    fireEvent.click(await screen.findByRole('button', { name: '🗺️ 지도 보기' }));

    const pin = await screen.findByRole('button', { name: '잠실 배드민턴 체육관 지도 핀' });
    expect(screen.getByRole('button', { name: '성수 루프탑 풋살장 지도 핀' })).toBeInTheDocument();
    expect(mapState.bounds.points).toHaveLength(2); // 모든 핀이 보이도록 범위 맞춤
    expect(screen.getByRole('button', { name: '📋 목록 보기' })).toBeInTheDocument();

    fireEvent.click(pin);
    const card = await screen.findByRole('region', { name: '잠실 배드민턴 체육관 요약' });
    expect(card).toHaveTextContent('서울 송파구 올림픽로 25');
    expect(card).toHaveTextContent('배드민턴');
    expect(within(card).getByRole('link', { name: /잠실 셔틀콕즈.*내 동호회/ })).toHaveAttribute('href', '/clubs/1');
    expect(within(card).getByRole('link', { name: /잠실 새벽콕.*가입\/문의/ })).toHaveAttribute('href', '/venues/1?club=5');
    expect(pin).toHaveAttribute('aria-pressed', 'true');

    // 빈 지도를 누르면 닫힘
    act(() => mapState.listeners.click());
    expect(screen.queryByRole('region', { name: /요약/ })).not.toBeInTheDocument();

    // 필터를 바꾸면 핀도 다시 그려진다
    fireEvent.click(within(screen.getByRole('group', { name: '종목 필터' })).getByRole('button', { name: /풋살/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '잠실 배드민턴 체육관 지도 핀' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '성수 루프탑 풋살장 지도 핀' })).toBeInTheDocument();
  });

  test('요약 카드의 동호회를 누르면 장소 메뉴판으로 가서 그 동호회가 강조된다', async () => {
    installFakeKakaoMap();
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/venues/1/clubs')) {
        return Promise.resolve({
          data: {
            venue: { id: 1, name: '잠실 배드민턴 체육관', sport: '배드민턴', address: '서울 송파구' },
            clubs: [{ id: 5, name: '잠실 새벽콕', is_public: true, recruit_status: 'recruiting', is_new: true, member_count: 2, max_members: 20, owner: { id: 4, nickname: '서연' } }],
          },
        });
      }
      if (url.includes('/api/venues')) return Promise.resolve({ data: EXPLORE_VENUES });
      return Promise.resolve({ data: { user: ME } });
    });
    renderApp('/explore?view=map');
    fireEvent.click(await screen.findByRole('button', { name: '잠실 배드민턴 체육관 지도 핀' }));
    fireEvent.click(await screen.findByRole('link', { name: /잠실 새벽콕/ }));
    expect(await screen.findByText('동호회 메뉴판 📋')).toBeInTheDocument();
    expect(document.getElementById('club-5')).toHaveClass('ring-mint-500');
  });

  test("'내 주변 보기'를 누르면 현재 위치로 지도를 이동한다", async () => {
    installFakeKakaoMap();
    const getCurrentPosition = jest.fn((ok) => ok({ coords: { latitude: 37.55, longitude: 127.02 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    renderApp('/explore?view=map');
    fireEvent.click(await screen.findByRole('button', { name: '📍 내 주변 보기' }));
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(mapState.map.center.getLat()).toBe(37.55);
    expect(mapState.map.level).toBe(5);
    expect(screen.getByLabelText('내 위치')).toBeInTheDocument();
  });

  test('카카오맵을 못 불러오면 안내와 함께 목록 보기로 돌아갈 수 있다', async () => {
    renderApp('/explore?view=map');
    expect(await screen.findByText('카카오맵을 불러오지 못했어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '📋 목록으로 보기' }));
    expect(await screen.findByRole('list', { name: '검색 결과' })).toBeInTheDocument();
  });
});

describe('마이페이지: 프로필 수정 · 비밀번호 변경 · 다가오는 내 일정', () => {
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const NEW_TOKEN = `x.${btoa(JSON.stringify({ userId: 7, exp: 4102444800, v: 2 }))}.y`;
  const mkSchedule = (id, start, extra = {}) => ({
    id, title: `일정 ${id}`, start_at: start, end_at: null, fee: 5000, capacity: 20, attend_count: 3, my_response: 'attend',
    club: { id: 10 + id, name: `동호회 ${id}`, sport: '배드민턴' }, venue: { id: 1, name: '잠실 배드민턴 체육관', address: '서울' }, ...extra,
  });
  let mySchedules;
  let meUser; // 서버의 현재 내 정보 (프로필 저장 후 갱신)

  beforeEach(() => {
    meUser = { ...ME, bio: '주말 배드민턴' };
    mySchedules = [mkSchedule(1, '2099-11-21 09:00:00', { title: '토요 정기 운동', club: { id: 1, name: '잠실 셔틀콕즈', sport: '배드민턴' } }), mkSchedule(2, '2099-11-25 20:00:00')];
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify({ ...ME, bio: '주말 배드민턴' }));
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: meUser } });
      if (url.endsWith('/api/users/me/schedules')) return Promise.resolve({ data: { schedules: mySchedules } });
      if (url.includes('/api/clubs/1/schedules')) {
        return Promise.resolve({
          data: {
            club: { id: 1, name: '잠실 셔틀콕즈', venue_id: 1, venue_name: '잠실 배드민턴 체육관', venue_status: 'approved', sport: '배드민턴', member_count: 4, max_members: 30 },
            my_role: 'member', my_role_label: '회원', can_manage: false, schedules: [],
          },
        });
      }
      return Promise.resolve({ data: CLUBS_RESPONSE });
    });
  });

  test('프로필 수정: 기존 값이 채워진 폼에서 저장하면 즉시 반영되고 완료 알림이 뜬다', async () => {
    axios.put.mockImplementationOnce(() => {
      meUser = { ...ME, nickname: '새닉네임', bio: '평일 풋살도 해요' };
      return Promise.resolve({ data: { message: '프로필을 저장했습니다.', user: meUser, token: NEW_TOKEN } });
    });
    renderApp('/my');
    fireEvent.click(await screen.findByRole('button', { name: '프로필 수정' }));
    const form = screen.getByRole('form', { name: '프로필 수정' });
    expect(within(form).getByLabelText('닉네임')).toHaveValue('테스터');
    expect(within(form).getByLabelText('한 줄 소개')).toHaveValue('주말 배드민턴');

    fireEvent.change(within(form).getByLabelText('닉네임'), { target: { value: '  새닉네임 ' } });
    fireEvent.change(within(form).getByLabelText('한 줄 소개'), { target: { value: '평일 풋살도 해요' } });
    fireEvent.click(within(form).getByRole('button', { name: '저장하기' }));

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith('http://localhost:5001/api/users/me', { nickname: '새닉네임', bio: '평일 풋살도 해요' }, AUTH)
    );
    expect(await screen.findByText(/새닉네임님/)).toBeInTheDocument();
    expect(screen.getAllByText('평일 풋살도 해요').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('프로필이 저장되었어요');
    // 저장소에도 반영 (새로고침해도 유지) + 새 토큰으로 교체
    await waitFor(() => expect(JSON.parse(localStorage.getItem('wtp.user')).nickname).toBe('새닉네임'));
    expect(localStorage.getItem('wtp.token')).toBe(NEW_TOKEN);
  });

  test('프로필 수정: 공백만 있는 닉네임은 저장하지 않는다', async () => {
    renderApp('/my');
    fireEvent.click(await screen.findByRole('button', { name: '프로필 수정' }));
    const form = screen.getByRole('form', { name: '프로필 수정' });
    fireEvent.change(within(form).getByLabelText('닉네임'), { target: { value: '    ' } });
    fireEvent.click(within(form).getByRole('button', { name: '저장하기' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('공백만으로는 만들 수 없어요');
    expect(axios.put).not.toHaveBeenCalled();
  });

  test('비밀번호 변경: 확인 불일치는 막고, 현재 비밀번호가 틀리면 서버 안내를 보여주며, 성공하면 알림', async () => {
    axios.put
      .mockRejectedValueOnce({ response: { status: 400, data: { error: '현재 비밀번호가 올바르지 않습니다.' } } })
      .mockResolvedValueOnce({ data: { message: '비밀번호를 변경했습니다.' } });
    renderApp('/my');
    fireEvent.click(await screen.findByRole('button', { name: /비밀번호 변경/ }));
    const form = screen.getByRole('form', { name: '비밀번호 변경' });
    const fill = (cur, next, confirm) => {
      fireEvent.change(within(form).getByLabelText('현재 비밀번호'), { target: { value: cur } });
      fireEvent.change(within(form).getByLabelText('새 비밀번호 (8자 이상)'), { target: { value: next } });
      fireEvent.change(within(form).getByLabelText('새 비밀번호 확인'), { target: { value: confirm } });
      fireEvent.click(within(form).getByRole('button', { name: '비밀번호 변경' }));
    };

    fill('password123', 'newpass123', 'newpass999');
    expect(within(form).getByRole('alert')).toHaveTextContent('새 비밀번호가 일치하지 않아요.');
    expect(axios.put).not.toHaveBeenCalled();

    fill('wrongpass', 'newpass123', 'newpass123');
    expect(await within(form).findByRole('alert')).toHaveTextContent('현재 비밀번호가 올바르지 않습니다.');
    expect(localStorage.getItem('wtp.token')).toBe(FAKE_TOKEN); // 400이므로 로그아웃되지 않음

    fill('password123', 'newpass123', 'newpass123');
    await waitFor(() =>
      expect(axios.put).toHaveBeenLastCalledWith(
        'http://localhost:5001/api/users/me/password',
        { current_password: 'password123', new_password: 'newpass123' },
        AUTH
      )
    );
    expect(await screen.findByRole('status')).toHaveTextContent('비밀번호가 변경되었어요');
  });

  test('다가오는 내 일정: 날짜순 카드(D-day, 동호회명, 장소)를 보여주고 누르면 동호회 상세로 간다', async () => {
    renderApp('/my');
    const list = await screen.findByRole('list', { name: '다가오는 내 일정' });
    const cards = within(list).getAllByRole('link');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('토요 정기 운동');
    expect(cards[0]).toHaveTextContent('잠실 셔틀콕즈');
    expect(cards[0]).toHaveTextContent('잠실 배드민턴 체육관');
    expect(cards[0]).toHaveTextContent(/D-\d+/);
    expect(cards[0]).toHaveTextContent('11월 21일');
    expect(cards[0]).toHaveAttribute('href', '/clubs/1');
    expect(axios.get).toHaveBeenCalledWith('http://localhost:5001/api/users/me/schedules', AUTH);

    fireEvent.click(cards[0]);
    expect(await screen.findByText('다가오는 일정 📅')).toBeInTheDocument();
  });

  test('일정이 많으면 3개만 보여주고 전체 보기 화면으로 연결된다', async () => {
    mySchedules = [1, 2, 3, 4, 5].map((i) => mkSchedule(i, `2099-1${i % 2}-0${i} 10:00:00`));
    renderApp('/my');
    const list = await screen.findByRole('list', { name: '다가오는 내 일정' });
    expect(within(list).getAllByRole('link')).toHaveLength(3);
    fireEvent.click(screen.getByRole('link', { name: '전체 보기 ›' }));
    expect(await screen.findByRole('heading', { name: '다가오는 내 일정' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('link', { name: /일정 \d/ })).toHaveLength(5));
  });

  test('예정된 일정이 없으면 안내 문구를 보여준다', async () => {
    mySchedules = [];
    renderApp('/my');
    expect(await screen.findByText('참석하기로 한 예정 일정이 없어요.')).toBeInTheDocument();
  });
});

describe('종목 DB 전환 + 관리자 종목 관리', () => {
  const AUTH = { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } };
  const ADMIN = { ...ME, id: 8, nickname: '관리자', email: 'admin@test.com', is_admin: true };
  // 서버 종목: 피클볼 추가, 배구 비활성(공개 목록에서 빠짐), 풋살 → 5인 풋살로 이름 변경된 상태
  const PUBLIC_SPORTS = [
    { id: 1, name: '배드민턴', icon: '🏸', sort_order: 10 },
    { id: 2, name: '5인 풋살', icon: '⚽', sort_order: 20 },
    { id: 4, name: '농구', icon: '🏀', sort_order: 40 },
    { id: 12, name: '피클볼', icon: '🥏', sort_order: 45 },
  ];
  const ADMIN_SPORTS = [
    { id: 1, name: '배드민턴', icon: '🏸', sort_order: 10, is_active: true, venue_count: 2, approved_venue_count: 2 },
    { id: 4, name: '농구', icon: '🏀', sort_order: 40, is_active: true, venue_count: 2, approved_venue_count: 2 },
    { id: 6, name: '배구', icon: '🏐', sort_order: 60, is_active: false, venue_count: 0, approved_venue_count: 0 },
  ];
  let sportsCalls;

  function mockApi(me = ME) {
    sportsCalls = 0;
    localStorage.setItem('wtp.token', FAKE_TOKEN);
    localStorage.setItem('wtp.user', JSON.stringify(me));
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve({ data: { user: me } });
      if (url.endsWith('/api/sports')) {
        sportsCalls += 1;
        return Promise.resolve({ data: PUBLIC_SPORTS });
      }
      if (url.endsWith('/api/admin/sports')) return Promise.resolve({ data: { sports: ADMIN_SPORTS } });
      if (url.endsWith('/api/admin/stats')) return Promise.resolve({ data: { users: 1, clubs: 1, venues: { total: 1, approved: 1, pending: 0, rejected: 0 } } });
      if (url.includes('/api/venues')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { clubs: [], schedules: [] } });
    });
  }

  test('탐색 화면의 종목 칩은 GET /api/sports 목록(순서·아이콘)대로 나온다', async () => {
    mockApi();
    renderApp('/explore');
    const group = screen.getByRole('group', { name: '종목 필터' });
    expect(await within(group).findByRole('button', { name: '🥏 피클볼' })).toBeInTheDocument();
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['전체', '🏸 배드민턴', '⚽ 5인 풋살', '🏀 농구', '🥏 피클볼']);
    expect(within(group).queryByRole('button', { name: /배구/ })).not.toBeInTheDocument();
  });

  test('동호회 개설의 새 장소 종목 드롭다운도 API 목록을 쓴다', async () => {
    mockApi();
    renderApp('/clubs/new');
    fireEvent.click(await screen.findByRole('tab', { name: /직접 등록하기/ }));
    const select = screen.getByLabelText('종목');
    await waitFor(() => expect(within(select).getByRole('option', { name: '🥏 피클볼' })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: /배구/ })).not.toBeInTheDocument();
  });

  test('메인 카테고리 그리드도 API 종목으로 구성되고, 종목이 많으면 전체 종목 칸이 생긴다', async () => {
    mockApi();
    renderApp();
    expect(await screen.findByRole('button', { name: /🥏\s*피클볼/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /전체 종목/ })).not.toBeInTheDocument();
  });

  test('관리자 사이드바에 종목 관리 메뉴가 있고, 표에 아이콘·종목명·장소 수·활성 상태가 보인다', async () => {
    mockApi(ADMIN);
    renderApp('/admin');
    fireEvent.click(await screen.findByRole('link', { name: /종목 관리/ }));
    const table = await screen.findByRole('table', { name: '종목 목록' });
    expect(await within(table).findByText('배드민턴')).toBeInTheDocument();
    expect(within(table).getByRole('switch', { name: '배구 활성 상태' })).toHaveAttribute('aria-checked', 'false');
    expect(within(table).getByText('비활성')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('2곳');
  });

  test('새 종목 추가: 이모지 빠른 선택 후 추가하면 표에 들어가고 유저 화면용 종목 목록도 다시 불러온다', async () => {
    mockApi(ADMIN);
    axios.post.mockResolvedValueOnce({
      data: { message: "'피클볼' 종목을 추가했습니다.", sport: { id: 12, name: '피클볼', icon: '🥏', sort_order: 45, is_active: true, venue_count: 0, approved_venue_count: 0 } },
    });
    renderApp('/admin/sports');
    const form = await screen.findByRole('form', { name: '새 종목 추가' });
    fireEvent.click(within(form).getByRole('button', { name: '아이콘 🥏 선택' }));
    fireEvent.change(within(form).getByLabelText('종목명'), { target: { value: '피클볼' } });
    fireEvent.change(within(form).getByLabelText('노출 순서'), { target: { value: '45' } });
    const before = sportsCalls;
    fireEvent.click(within(form).getByRole('button', { name: '추가' }));

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('http://localhost:5001/api/admin/sports', { icon: '🥏', name: '피클볼', sort_order: 45 }, AUTH)
    );
    const rows = within(screen.getByRole('table', { name: '종목 목록' })).getAllByRole('row');
    expect(rows.map((r) => r.textContent).join('|')).toMatch(/농구.*피클볼.*배구/); // 순서대로 끼워 넣기
    await waitFor(() => expect(sportsCalls).toBeGreaterThan(before));
  });

  test('이름 변경은 장소가 있으면 확인창(장소 종목명 동기화 안내) 후 PUT', async () => {
    mockApi(ADMIN);
    axios.put.mockResolvedValueOnce({
      data: { message: "종목을 수정했습니다. (장소 2곳의 종목명도 '농구(5x5)'(으)로 바뀌었어요)", sport: { ...ADMIN_SPORTS[1], name: '농구(5x5)' }, synced_venues: 2 },
    });
    renderApp('/admin/sports');
    fireEvent.click(await screen.findByRole('button', { name: '농구 수정' }));
    fireEvent.change(screen.getByLabelText('종목명', { selector: 'td input' }), { target: { value: '농구(5x5)' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('장소 2곳의 종목명도 함께 바뀝니다'));
    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith('http://localhost:5001/api/admin/sports/4', { icon: '🏀', name: '농구(5x5)', sort_order: 40 }, AUTH)
    );
    expect(await screen.findByRole('status')).toHaveTextContent('장소 2곳의 종목명도');
  });

  test('활성 토글과, 사용 중인 종목 삭제 시 비활성화로 안내', async () => {
    mockApi(ADMIN);
    axios.put
      .mockResolvedValueOnce({ data: { message: '종목을 활성화했습니다.', sport: { ...ADMIN_SPORTS[2], is_active: true } } })
      .mockResolvedValueOnce({ data: { message: '종목을 비활성화했습니다.', sport: { ...ADMIN_SPORTS[1], is_active: false } } });
    axios.delete.mockRejectedValueOnce({
      response: { status: 409, data: { error: "'농구' 종목을 쓰는 장소가 2곳 있어 삭제할 수 없어요.", venue_count: 2, can_deactivate: true } },
    });
    renderApp('/admin/sports');
    fireEvent.click(await screen.findByRole('switch', { name: '배구 활성 상태' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith('http://localhost:5001/api/admin/sports/6', { is_active: true }, AUTH));
    await waitFor(() => expect(screen.getByRole('switch', { name: '배구 활성 상태' })).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(screen.getByRole('button', { name: '농구 삭제' }));
    await waitFor(() => expect(axios.put).toHaveBeenLastCalledWith('http://localhost:5001/api/admin/sports/4', { is_active: false }, AUTH));
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('지금 비활성화할까요?'));
    await waitFor(() => expect(screen.getByRole('switch', { name: '농구 활성 상태' })).toHaveAttribute('aria-checked', 'false'));
  });
});
