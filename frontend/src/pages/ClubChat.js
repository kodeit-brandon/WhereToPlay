import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import { fetchChatMessages } from '../api/chat';
import { errorMessage } from '../api/auth';
import { createChatSocket } from '../realtime/chatSocket';
import { getToken } from '../auth/tokenStorage';
import { useAuth } from '../auth/AuthContext';
import { parseLocal, weekday, pad2 } from '../utils/datetime';

const MAX_LENGTH = 1000;
const SEND_TIMEOUT_MS = 8000;

/* ---------- 시간/그룹 유틸 ---------- */
const dayKey = (v) => (v || '').slice(0, 10); // 'YYYY-MM-DD'
const minuteKey = (v) => (v || '').slice(0, 16); // 'YYYY-MM-DD HH:MM'

function formatClock(value) {
  const d = parseLocal(value);
  if (!d) return '';
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad2(d.getMinutes())}`;
}

function formatDay(value) {
  const d = parseLocal(value);
  return d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${weekday(d)}요일` : '';
}

/** 스크롤이 거의 맨 아래인지 (새 메시지가 오면 따라 내려갈지 판단) */
function isNearBottom(el) {
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

function nowLocalString() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** 서버 메시지를 목록에 합친다: 같은 id는 무시, 내가 보낸 임시 메시지(client_id)는 교체 */
function mergeMessage(list, incoming) {
  if (incoming.client_id) {
    const idx = list.findIndex((m) => m.client_id === incoming.client_id && m.pending);
    if (idx !== -1) {
      const next = [...list];
      next[idx] = { ...incoming, pending: false, failed: false };
      return next;
    }
  }
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
}

/** 여러 서버 메시지를 id 기준으로 합치고 정렬 (임시 메시지는 맨 뒤 유지) */
function mergeMany(list, incoming) {
  const byId = new Map(list.filter((m) => m.id).map((m) => [m.id, m]));
  incoming.forEach((m) => byId.set(m.id, m));
  const pending = list.filter((m) => !m.id);
  return [...[...byId.values()].sort((a, b) => a.id - b.id), ...pending];
}

/* ---------- 말풍선 ---------- */
function SystemMessage({ message }) {
  return (
    <li className="flex justify-center py-1">
      <span className="px-3 py-1 rounded-full bg-gray-100 text-[12px] text-gray-500">{message.content}</span>
    </li>
  );
}

function MyBubble({ message, showTime, onRetry, onDiscard }) {
  return (
    <li className={`flex justify-end items-end gap-1.5 ${showTime ? 'mb-2' : 'mb-0.5'}`}>
      <div className="flex flex-col items-end text-[11px] text-gray-400 shrink-0">
        {message.failed ? (
          <span className="flex gap-1">
            <button type="button" onClick={() => onRetry(message)} className="text-red-500 font-bold">
              다시 보내기
            </button>
            <button type="button" onClick={() => onDiscard(message)} aria-label="보내지 못한 메시지 삭제">
              ✕
            </button>
          </span>
        ) : message.pending ? (
          <span>보내는 중…</span>
        ) : (
          showTime && <span>{formatClock(message.created_at)}</span>
        )}
      </div>
      <p
        className={`max-w-[70%] px-3.5 py-2 rounded-2xl rounded-br-md text-[15px] leading-snug whitespace-pre-wrap break-words
          ${message.failed ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-mint-500 text-white'}
          ${message.pending ? 'opacity-70' : ''}`}
      >
        {message.content}
      </p>
    </li>
  );
}

function OtherBubble({ message, showProfile, showTime }) {
  return (
    <li className={`flex items-start gap-2 ${showTime ? 'mb-2' : 'mb-0.5'}`}>
      <div className="w-9 shrink-0">
        {showProfile && <Avatar src={message.sender.profile_image} name={message.sender.nickname} size="w-9 h-9 text-sm" />}
      </div>
      <div className="min-w-0 max-w-[75%]">
        {showProfile && <p className="mb-1 text-xs font-bold text-gray-600">{message.sender.nickname}</p>}
        <div className="flex items-end gap-1.5">
          <p className="px-3.5 py-2 rounded-2xl rounded-tl-md bg-gray-100 text-gray-900 text-[15px] leading-snug whitespace-pre-wrap break-words">
            {message.content}
          </p>
          {showTime && <span className="shrink-0 text-[11px] text-gray-400">{formatClock(message.created_at)}</span>}
        </div>
      </div>
    </li>
  );
}

/* ---------- 화면 ---------- */
export default function ClubChat() {
  const { clubId } = useParams();
  const { user, logout } = useAuth();
  const [club, setClub] = useState(null);
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('connecting'); // connecting | online | offline
  const [text, setText] = useState('');
  const [newBelow, setNewBelow] = useState(false);

  const socketRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const scrollMode = useRef('bottom'); // 다음 렌더 후 스크롤 처리: 'bottom' | 'keep' | {prevHeight}
  const myId = user?.id;

  const fail = useCallback(
    (err, fallback) => {
      const status401 = err?.response?.status === 401 || err?.status === 401;
      if (status401) logout();
      else setError(err?.error || errorMessage(err, fallback));
    },
    [logout]
  );

  // 1) 이전 대화 불러오기
  useEffect(() => {
    let cancelled = false;
    fetchChatMessages(clubId)
      .then((res) => {
        if (cancelled) return;
        setClub(res.club);
        setHasMore(res.has_more);
        scrollMode.current = 'bottom';
        setMessages((prev) => mergeMany(prev || [], res.messages));
      })
      .catch((err) => !cancelled && fail(err, '채팅을 불러오지 못했어요.'));
    return () => {
      cancelled = true;
    };
  }, [clubId, fail]);

  // 2) 소켓 연결 + 입장 + 실시간 수신
  useEffect(() => {
    const socket = createChatSocket(getToken());
    socketRef.current = socket;
    let joinedOnce = false;

    socket.on('connect', () => {
      socket.emit('chat:join', { clubId: Number(clubId) }, (res) => {
        if (!res?.ok) {
          setStatus('offline');
          fail(res, '채팅방에 입장하지 못했어요.');
          return;
        }
        setStatus('online');
        // 재연결이면 끊긴 동안 놓친 메시지를 채운다
        if (joinedOnce) {
          fetchChatMessages(clubId)
            .then((r) => {
              scrollMode.current = isNearBottom(listRef.current) ? 'bottom' : 'keep';
              setMessages((prev) => mergeMany(prev || [], r.messages));
            })
            .catch(() => {});
        }
        joinedOnce = true;
      });
    });
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', (err) => {
      if (err?.message === 'UNAUTHORIZED') logout();
      else setStatus('offline');
    });
    socket.on('chat:message', (msg) => {
      const mine = msg.sender?.id === myId;
      const near = isNearBottom(listRef.current);
      scrollMode.current = mine || near ? 'bottom' : 'keep';
      if (!mine && !near) setNewBelow(true);
      setMessages((prev) => mergeMessage(prev || [], msg));
    });

    return () => {
      socket.emit('chat:leave', { clubId: Number(clubId) });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [clubId, myId, fail, logout]);

  // 3) 렌더 후 스크롤 위치 조정
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !messages) return;
    const mode = scrollMode.current;
    if (mode === 'bottom') {
      el.scrollTop = el.scrollHeight;
      setNewBelow(false);
    } else if (mode && typeof mode === 'object') {
      el.scrollTop = el.scrollHeight - mode.prevHeight; // 이전 기록을 위에 붙여도 보던 위치 유지
    }
    scrollMode.current = 'keep';
  }, [messages]);

  const loadOlder = async () => {
    if (!messages?.length || loadingOlder) return;
    const oldest = messages.find((m) => m.id);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await fetchChatMessages(clubId, { before: oldest.id });
      scrollMode.current = { prevHeight: listRef.current?.scrollHeight || 0 };
      setHasMore(res.has_more);
      setMessages((prev) => mergeMany(prev, res.messages));
    } catch (err) {
      fail(err, '이전 대화를 불러오지 못했어요.');
    } finally {
      setLoadingOlder(false);
    }
  };

  const emitSend = (local) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.timeout(SEND_TIMEOUT_MS).emit(
      'chat:send',
      { clubId: Number(clubId), content: local.content, clientId: local.client_id },
      (timeoutErr, res) => {
        if (!timeoutErr && res?.ok) {
          setMessages((prev) => mergeMessage(prev, { ...res.message, client_id: local.client_id }));
          return;
        }
        if (res?.status === 403) fail(res, '');
        setMessages((prev) =>
          prev.map((m) =>
            m.client_id === local.client_id ? { ...m, pending: false, failed: true, error: res?.error || '전송 시간이 초과됐어요.' } : m
          )
        );
      }
    );
  };

  const send = () => {
    const content = text.trim();
    if (!content || !user) return;
    const local = {
      client_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'text',
      content,
      created_at: nowLocalString(),
      sender: { id: user.id, nickname: user.nickname, profile_image: user.profile_image },
      pending: true,
    };
    scrollMode.current = 'bottom';
    setMessages((prev) => [...(prev || []), local]);
    setText('');
    if (inputRef.current) inputRef.current.style.height = '';
    emitSend(local);
  };

  const retry = (msg) => {
    setMessages((prev) => prev.map((m) => (m.client_id === msg.client_id ? { ...m, pending: true, failed: false } : m)));
    emitSend(msg);
  };
  const discard = (msg) => setMessages((prev) => prev.filter((m) => m.client_id !== msg.client_id));

  const onKeyDown = (e) => {
    // 한글 조합 중 Enter는 무시 (마지막 글자가 두 번 전송되는 문제 방지)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onInput = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  // 날짜 구분선, 프로필/시간 표시 여부 계산
  const items = useMemo(() => {
    if (!messages) return [];
    const out = [];
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) {
        out.push({ kind: 'day', key: `day-${dayKey(m.created_at)}-${i}`, label: formatDay(m.created_at) });
      }
      const sameGroup = (a, b) =>
        a && b && a.type !== 'system' && b.type !== 'system' && a.sender.id === b.sender.id && minuteKey(a.created_at) === minuteKey(b.created_at);
      out.push({
        kind: m.type === 'system' ? 'system' : m.sender.id === myId ? 'mine' : 'other',
        key: m.id ? `m-${m.id}` : `c-${m.client_id}`,
        message: m,
        showProfile: !sameGroup(prev, m),
        showTime: !sameGroup(m, next),
      });
    });
    return out;
  }, [messages, myId]);

  const canSend = status === 'online' && text.trim().length > 0 && text.length <= MAX_LENGTH;

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="mx-auto max-w-[480px] h-[100dvh] bg-white shadow-xl flex flex-col">
        <PageHeader
          title={club ? `${club.name} 💬` : '단체 채팅'}
          back
          fallback={`/clubs/${clubId}`}
        />
        {club && !error && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-gray-400 border-b border-gray-50">
            <span
              className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-mint-500' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-400'}`}
            />
            {status === 'online' ? `회원 ${club.member_count}명` : status === 'connecting' ? '연결 중…' : '연결이 끊겼어요. 다시 연결하는 중…'}
          </div>
        )}

        {error ? (
          <div className="flex-1 px-4 py-20 text-center">
            <p className="text-4xl">🔒</p>
            <p className="mt-3 text-sm text-gray-600">{error}</p>
            <Link to="/my-clubs" className="inline-block mt-5 px-5 py-2 rounded-full bg-mint-500 text-white text-sm font-bold">
              내 모임으로
            </Link>
          </div>
        ) : (
          <>
            <div ref={listRef} className="relative flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
              {!messages && (
                <div className="space-y-3 animate-pulse">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`h-10 w-2/3 rounded-2xl bg-gray-100 ${i % 2 ? 'ml-auto' : ''}`} />
                  ))}
                </div>
              )}

              {hasMore && (
                <div className="flex justify-center mb-3">
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="px-3 py-1 rounded-full bg-gray-100 text-xs font-bold text-gray-500"
                  >
                    {loadingOlder ? '불러오는 중…' : '이전 대화 더보기'}
                  </button>
                </div>
              )}

              {messages && messages.length === 0 && (
                <div className="py-16 text-center">
                  <p className="text-4xl">👋</p>
                  <p className="mt-3 text-sm text-gray-500">첫 인사를 건네보세요!</p>
                </div>
              )}

              <ul aria-label="채팅 메시지">
                {items.map((it) =>
                  it.kind === 'day' ? (
                    <li key={it.key} className="flex items-center gap-3 my-4 text-[11px] text-gray-400">
                      <span className="flex-1 h-px bg-gray-100" />
                      {it.label}
                      <span className="flex-1 h-px bg-gray-100" />
                    </li>
                  ) : it.kind === 'system' ? (
                    <SystemMessage key={it.key} message={it.message} />
                  ) : it.kind === 'mine' ? (
                    <MyBubble key={it.key} message={it.message} showTime={it.showTime} onRetry={retry} onDiscard={discard} />
                  ) : (
                    <OtherBubble key={it.key} message={it.message} showProfile={it.showProfile} showTime={it.showTime} />
                  )
                )}
              </ul>
            </div>

            {newBelow && (
              <button
                type="button"
                onClick={() => {
                  listRef.current.scrollTop = listRef.current.scrollHeight;
                  setNewBelow(false);
                }}
                className="self-center -mt-12 mb-2 z-10 px-3 py-1.5 rounded-full bg-gray-900/80 text-white text-xs font-bold shadow"
              >
                새 메시지 ↓
              </button>
            )}

            {/* 입력창 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 px-3 py-2.5 border-t border-gray-100 bg-white pb-[max(0.625rem,env(safe-area-inset-bottom))]"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                onChange={onInput}
                onKeyDown={onKeyDown}
                maxLength={MAX_LENGTH}
                placeholder={status === 'online' ? '메시지를 입력하세요' : '연결 중이에요…'}
                aria-label="메시지 입력"
                className="flex-1 resize-none max-h-[120px] px-4 py-2.5 rounded-3xl bg-gray-100 text-[15px] text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-mint-500/40"
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="전송"
                className="w-11 h-11 shrink-0 rounded-full bg-mint-500 text-white flex items-center justify-center transition enabled:active:scale-90 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
                  <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
                </svg>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
