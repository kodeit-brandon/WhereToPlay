/**
 * WhereToPlay DB 초기화 스크립트
 *
 * 실행: node setup_db.js
 *  - wheretoplay.db 파일에 모든 테이블을 (재)생성하고 테스트용 더미 데이터를 넣습니다.
 *  - 실행할 때마다 기존 테이블을 DROP 후 다시 만들기 때문에 데이터가 초기화됩니다.
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// 더미 사용자 공통 비밀번호 (개발/테스트 전용)
const DUMMY_PASSWORD = 'password123';
const DUMMY_HASH = bcrypt.hashSync(DUMMY_PASSWORD, 10);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'wheretoplay.db');

const SCHEMA = `
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS chat_rooms;
DROP TABLE IF EXISTS ledgers;
DROP TABLE IF EXISTS rsvps;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS club_members;
DROP TABLE IF EXISTS clubs;
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS sports;
DROP TABLE IF EXISTS users;

PRAGMA foreign_keys = ON;

-- 1. 사용자
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  nickname      TEXT    NOT NULL,
  phone         TEXT,
  profile_image TEXT,
  bio           TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),  -- 1: 최고 관리자 (백오피스 접근)
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1-1. 운동 종목 (관리자가 /admin/sports 에서 관리, venues.sport 는 종목명을 그대로 저장)
CREATE TABLE sports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  icon       TEXT    NOT NULL DEFAULT '🏃',      -- 이모지 아이콘
  sort_order INTEGER NOT NULL DEFAULT 0,         -- 노출 순서 (오름차순)
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sports_order ON sports(sort_order);

-- 2. 운동 장소
CREATE TABLE venues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sport       TEXT NOT NULL,              -- 배드민턴, 풋살, 테니스, 농구 ...
  address     TEXT NOT NULL,
  lat         REAL NOT NULL,              -- 위도
  lng         REAL NOT NULL,              -- 경도
  phone       TEXT,
  description TEXT,
  image_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),  -- 승인대기/승인/반려 (제보된 장소는 pending)
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,      -- 제보한 사용자 (관리자 등록이면 NULL)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_venues_sport  ON venues(sport);
CREATE INDEX idx_venues_status ON venues(status);
CREATE INDEX idx_venues_latlng ON venues(lat, lng);

-- 3. 동호회
CREATE TABLE clubs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id           INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  owner_id           INTEGER NOT NULL REFERENCES users(id),
  name               TEXT    NOT NULL,
  description        TEXT,
  is_public          INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),  -- 1: 공개, 0: 비공개
  recruit_status     TEXT    NOT NULL DEFAULT 'recruiting'
                     CHECK (recruit_status IN ('recruiting', 'closing_soon', 'closed')), -- 모집중/마감임박/모집마감
  max_members        INTEGER,
  monthly_fee        INTEGER NOT NULL DEFAULT 0,
  skill_level        TEXT,                                                    -- 실력/티어 (예: 초보~중수, NTRP 2.5~3.5)
  activity_time      TEXT,                                                    -- 주 활동 시간 (예: 매주 토 09:00~12:00)
  cover_image        TEXT,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_clubs_venue ON clubs(venue_id);

-- 4. 동호회 가입 명부
CREATE TABLE club_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id    INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'member'
             CHECK (role IN ('member', 'owner', 'manager', 'treasurer')),    -- 일반/방장/운영진/총무
  status     TEXT    NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'rejected', 'left')),  -- 승인대기/승인/거절/탈퇴
  joined_at  DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (club_id, user_id)
);
CREATE INDEX idx_club_members_user ON club_members(user_id);

-- 5. 동호회 운동 일정
CREATE TABLE schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id     INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  venue_id    INTEGER REFERENCES venues(id) ON DELETE SET NULL,  -- 기본 장소와 다를 수 있음
  created_by  INTEGER NOT NULL REFERENCES users(id),
  title       TEXT    NOT NULL,
  description TEXT,
  start_at    DATETIME NOT NULL,                -- 현지 시각(KST) 'YYYY-MM-DD HH:MM:SS'
  end_at      DATETIME,
  capacity    INTEGER,                          -- 참석 정원 (NULL = 제한 없음)
  fee         INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),  -- 1인 참가비(원)
  rsvp_deadline DATETIME,                       -- 참석 투표 마감 시각 (NULL = 시작 전까지)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_schedules_club_start ON schedules(club_id, start_at);

-- 6. 일정 참석 투표
CREATE TABLE rsvps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response    TEXT    NOT NULL CHECK (response IN ('attend', 'absent', 'maybe')), -- 참석/불참/미정
  comment     TEXT,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (schedule_id, user_id)
);

-- 7. 회비 장부 (총무용)
CREATE TABLE ledgers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id     INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  member_id   INTEGER REFERENCES users(id) ON DELETE SET NULL, -- 회비 납부자 등 관련 회원 (없을 수 있음)
  type        TEXT    NOT NULL CHECK (type IN ('income', 'expense')),  -- 입금/출금
  category    TEXT    NOT NULL DEFAULT 'etc',  -- monthly_fee, court_rental, equipment, event, etc
  amount      INTEGER NOT NULL CHECK (amount >= 0),   -- 원 단위
  memo        TEXT,
  occurred_at DATE    NOT NULL,
  receipt_url TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ledgers_club_date ON ledgers(club_id, occurred_at);

-- 8. 채팅방 (1:1 / 동호회 단체방)
--   direct: user_a_id < user_b_id 로 정렬해 저장 → 같은 두 사람의 방은 하나만 존재
--   club  : club_id 로 연결, 참여자는 club_members(승인된 회원)로 판단
CREATE TABLE chat_rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL CHECK (type IN ('direct', 'club')),
  club_id    INTEGER UNIQUE REFERENCES clubs(id) ON DELETE CASCADE,
  user_a_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_b_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (type = 'club'   AND club_id IS NOT NULL AND user_a_id IS NULL AND user_b_id IS NULL) OR
    (type = 'direct' AND club_id IS NULL AND user_a_id IS NOT NULL AND user_b_id IS NOT NULL
                     AND user_a_id < user_b_id)
  ),
  UNIQUE (user_a_id, user_b_id)
);

-- 9. 채팅 메시지
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  type       TEXT    NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'system')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_messages_room_time ON messages(room_id, created_at);
`;

// 더미 데이터 (서울 지역 좌표)
// 더미 사용자 6명 + 최고 관리자(admin@test.com)의 비밀번호는 모두 DUMMY_PASSWORD(password123) 입니다.
const SEED = `
INSERT INTO users (email, password_hash, nickname, phone, bio, is_admin) VALUES
  ('minsu@test.com',   '${DUMMY_HASH}', '민수',   '010-1111-1111', '주말 배드민턴 좋아해요', 0),
  ('jiyoung@test.com', '${DUMMY_HASH}', '지영',   '010-2222-2222', '풋살 3년차', 0),
  ('hyunwoo@test.com', '${DUMMY_HASH}', '현우',   '010-3333-3333', '테니스 입문자', 0),
  ('seoyeon@test.com', '${DUMMY_HASH}', '서연',   '010-4444-4444', '총무 경력 있음', 0),
  ('donghyun@test.com','${DUMMY_HASH}', '동현',   '010-5555-5555', '농구는 사랑입니다', 0),
  ('yuna@test.com',    '${DUMMY_HASH}', '유나',   '010-6666-6666', NULL, 0),
  -- 최고 관리자 (백오피스 /admin 접근 가능)
  ('admin@test.com',   '${DUMMY_HASH}', '관리자', NULL, NULL, 1);

INSERT INTO sports (name, icon, sort_order) VALUES
  ('배드민턴', '🏸', 10), ('풋살', '⚽', 20), ('축구', '⚽', 30), ('농구', '🏀', 40),
  ('테니스', '🎾', 50), ('배구', '🏐', 60), ('야구', '⚾', 70), ('탁구', '🏓', 80),
  ('달리기', '🏃', 90), ('클라이밍', '🧗', 100), ('기타', '🎲', 110);

INSERT INTO venues (name, sport, address, lat, lng, phone, description, status) VALUES
  ('잠실 배드민턴 체육관', '배드민턴', '서울 송파구 올림픽로 25',      37.5154, 127.0730, '02-111-1111', '코트 8면, 샤워실 완비', 'approved'),
  ('성수 루프탑 풋살장',   '풋살',     '서울 성동구 성수이로 100',     37.5445, 127.0557, '02-222-2222', '야간 조명, 인조잔디', 'approved'),
  ('올림픽공원 테니스장',  '테니스',   '서울 송파구 올림픽로 424',     37.5206, 127.1215, '02-333-3333', '하드코트 16면', 'approved'),
  ('반포 한강 농구장',     '농구',     '서울 서초구 신반포로11길 40',  37.5106, 126.9960, NULL,          '야외 코트, 무료', 'approved'),
  ('마포 구민 체육센터',   '배드민턴', '서울 마포구 월드컵로 235',     37.5636, 126.9087, '02-555-5555', '평일 저녁 대관 가능', 'approved'),
  ('강남 실내 풋살파크',   '풋살',     '서울 강남구 테헤란로 152',     37.5000, 127.0365, '02-666-6666', '실내 2면', 'approved');

INSERT INTO clubs (venue_id, owner_id, name, description, is_public, recruit_status, max_members, monthly_fee, skill_level, activity_time, created_at) VALUES
  (1, 1, '잠실 셔틀콕즈',      '초보~중수 환영! 매주 토요일 오전',    1, 'recruiting',   30, 20000, '초보~중수',      '매주 토 09:00~12:00',    '2026-09-01 10:00:00'),
  (2, 2, '성수 FC',            '퇴근 후 풋살 한 판',                 1, 'closing_soon', 16, 30000, '중수 이상',      '매주 수 20:00~22:00',    '2026-08-15 19:00:00'),
  (3, 3, '올팍 테니스 클럽',   '레슨 병행 테니스 모임',              0, 'recruiting',   12, 50000, 'NTRP 2.5~3.5',   '매주 일 10:00~12:00',    '2026-07-01 09:00:00'),
  (4, 5, '반포 3on3',          '한강 보며 농구',                     1, 'closed',       10, 0,     '중수~고수',      '매주 토 16:00~19:00',    '2026-06-01 18:00:00'),
  (1, 4, '잠실 새벽콕',        '출근 전 한 게임! 새벽 운동 모임',     1, 'recruiting',   20, 15000, 'C조 이상',       '평일 06:00~08:00',       '2026-11-10 07:00:00'),
  (2, 6, '성수 직장인 풋살회', '풋살 처음이어도 괜찮아요',           1, 'recruiting',   20, 25000, '입문~초보',      '매주 금 19:30~21:30',    '2026-11-12 20:00:00'),
  (5, 1, '마포 배드민턴 클럽', '전 급수 환영, 레슨 연계 가능',        1, 'closing_soon', 40, 30000, '전 급수',        '매주 화·목 19:00~22:00', '2026-05-01 19:00:00'),
  (6, 2, '강남 퇴근FC',        '역삼·선릉 직장인 실내 풋살',         1, 'recruiting',   18, 35000, '초보~중수',      '매주 화 20:00~22:00',    '2026-11-15 20:00:00');

INSERT INTO club_members (club_id, user_id, role, status, joined_at) VALUES
  (1, 1, 'owner',     'approved', '2026-09-01 10:00:00'),
  (1, 4, 'treasurer', 'approved', '2026-09-02 10:00:00'),
  (1, 3, 'manager',   'approved', '2026-09-05 10:00:00'),
  (1, 6, 'member',    'approved', '2026-10-01 10:00:00'),
  (1, 2, 'member',    'pending',  NULL),
  (2, 2, 'owner',     'approved', '2026-08-15 19:00:00'),
  (2, 1, 'member',    'approved', '2026-08-20 19:00:00'),
  (2, 5, 'manager',   'approved', '2026-08-21 19:00:00'),
  (3, 3, 'owner',     'approved', '2026-07-01 09:00:00'),
  (3, 6, 'member',    'pending',  NULL),
  (4, 5, 'owner',     'approved', '2026-06-01 18:00:00'),
  (4, 2, 'member',    'approved', '2026-06-10 18:00:00'),
  (5, 4, 'owner',     'approved', '2026-11-10 07:00:00'),
  (5, 1, 'member',    'approved', '2026-11-11 07:00:00'),
  (6, 6, 'owner',     'approved', '2026-11-12 20:00:00'),
  (7, 1, 'owner',     'approved', '2026-05-01 19:00:00'),
  (7, 3, 'member',    'approved', '2026-05-10 19:00:00'),
  (7, 4, 'member',    'approved', '2026-06-01 19:00:00'),
  (8, 2, 'owner',     'approved', '2026-11-15 20:00:00'),
  (8, 5, 'member',    'approved', '2026-11-16 20:00:00');

INSERT INTO schedules (club_id, venue_id, created_by, title, description, start_at, end_at, capacity, fee, rsvp_deadline) VALUES
  (1, 1, 1, '토요 정기 운동',     '복식 위주로 진행합니다',   '2026-11-21 09:00:00', '2026-11-21 12:00:00', 20, 5000,  '2026-11-20 22:00:00'),
  (1, 5, 3, '마포 원정 번개',     '마포 체육센터 대관',       '2026-11-26 19:00:00', '2026-11-26 21:00:00', 12, 8000,  NULL),
  (2, 2, 2, '수요 야간 풋살',     '5:5 미니게임',            '2026-11-25 20:00:00', '2026-11-25 22:00:00', 12, 10000, NULL),
  (3, 3, 3, '주말 레슨 + 게임',   NULL,                      '2026-11-22 08:00:00', '2026-11-22 11:00:00', 8,  15000, NULL),
  (1, 1, 1, '평일 새벽 랠리',     '소수 정예 랠리 연습',      '2026-11-24 06:30:00', '2026-11-24 08:00:00', 2,  3000,  NULL),
  (1, 1, 1, '11월 둘째 주 정기 운동', NULL,                  '2026-11-14 09:00:00', '2026-11-14 12:00:00', 20, 5000,  NULL);

INSERT INTO rsvps (schedule_id, user_id, response, comment) VALUES
  (1, 1, 'attend', NULL),
  (1, 4, 'attend', '셔틀콕 챙겨갈게요'),
  (1, 3, 'maybe',  '오전 일정 확인 중'),
  (1, 6, 'absent', '이번 주는 쉽니다'),
  (2, 3, 'attend', NULL),
  (3, 2, 'attend', NULL),
  (3, 1, 'attend', NULL),
  (3, 5, 'absent', '출장'),
  (5, 1, 'attend', NULL),
  (5, 4, 'attend', NULL),
  (6, 1, 'attend', NULL),
  (6, 3, 'attend', NULL);

INSERT INTO ledgers (club_id, recorded_by, member_id, type, category, amount, memo, occurred_at) VALUES
  (1, 4, 1,    'income',  'monthly_fee',  20000, '11월 회비', '2026-11-01'),
  (1, 4, 3,    'income',  'monthly_fee',  20000, '11월 회비', '2026-11-02'),
  (1, 4, 6,    'income',  'monthly_fee',  20000, '11월 회비', '2026-11-03'),
  (1, 4, 4,    'income',  'monthly_fee',  20000, '11월 회비', '2026-11-03'),
  (1, 4, NULL, 'expense', 'court_rental', 60000, '11/21 코트 대관료', '2026-11-10'),
  (1, 4, NULL, 'expense', 'equipment',    15000, '셔틀콕 1박스', '2026-11-12'),
  (2, 2, 1,    'income',  'monthly_fee',  30000, '11월 회비', '2026-11-05');

INSERT INTO chat_rooms (type, club_id, user_a_id, user_b_id) VALUES
  ('club',   1,    NULL, NULL),
  ('club',   2,    NULL, NULL),
  ('direct', NULL, 1,    2),
  ('direct', NULL, 3,    6);

INSERT INTO messages (room_id, sender_id, content, type, created_at) VALUES
  (1, 1, '잠실 셔틀콕즈 단체방이 생성되었습니다.', 'system', '2026-09-01 10:00:00'),
  (1, 1, '이번 주 토요일 9시 정기 운동 있습니다!',  'text',   '2026-11-17 20:00:00'),
  (1, 4, '11월 회비 아직 안 내신 분들 입금 부탁드려요', 'text', '2026-11-17 20:05:00'),
  (1, 6, '이번 주는 불참합니다 ㅠㅠ',               'text',   '2026-11-17 21:10:00'),
  (2, 2, '수요일 8시 풋살 인원 모집합니다',          'text',   '2026-11-18 09:00:00'),
  (3, 2, '민수님 혹시 풋살도 같이 하실래요?',        'text',   '2026-11-16 18:00:00'),
  (3, 1, '좋아요! 수요일에 갈게요',                  'text',   '2026-11-16 18:03:00'),
  (4, 6, '테니스 클럽 가입 신청했어요. 승인 부탁드려요!', 'text', '2026-11-15 12:00:00');
`;

function run() {
  const db = new sqlite3.Database(DB_PATH);

  db.exec(SCHEMA, (schemaErr) => {
    if (schemaErr) {
      console.error('❌ 테이블 생성 실패:', schemaErr.message);
      return db.close();
    }
    console.log('✅ 테이블 생성 완료');

    db.exec(`BEGIN; ${SEED} COMMIT;`, (seedErr) => {
      if (seedErr) {
        console.error('❌ 더미 데이터 삽입 실패:', seedErr.message);
        return db.exec('ROLLBACK;', () => db.close());
      }

      const tables = ['users', 'sports', 'venues', 'clubs', 'club_members', 'schedules', 'rsvps', 'ledgers', 'chat_rooms', 'messages'];
      const counts = tables.map((t) => `SELECT '${t}' AS tbl, COUNT(*) AS cnt FROM ${t}`).join(' UNION ALL ');
      db.all(counts, (err, rows) => {
        if (!err) {
          console.log('✅ 더미 데이터 삽입 완료');
          console.table(rows);
        }
        console.log(`📁 DB 파일: ${DB_PATH}`);
        console.log(`🔑 더미 계정 비밀번호: ${DUMMY_PASSWORD} (예: minsu@test.com)`);
        console.log(`🛡️  최고 관리자: admin@test.com / ${DUMMY_PASSWORD}`);
        db.close();
      });
    });
  });
}

run();
