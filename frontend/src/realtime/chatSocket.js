import { io } from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

/** JWT를 담아 채팅 소켓에 연결한다 (서버가 연결 시점에 토큰을 검증) */
export function createChatSocket(token) {
  return io(API_BASE, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
