require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { Server: SocketServer } = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/authMiddleware');
const { optionalAuth } = authMiddleware;
const createAdminMiddleware = require('./middleware/adminMiddleware');

const PORT = process.env.PORT || 5001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'wheretoplay.db');
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = 10;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET 환경변수가 없습니다. backend/.env 에 설정하세요 (.env.example 참고).');
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(`❌ DB 연결 실패 (${DB_PATH}): ${err.message}`);
    console.error('   먼저 `node setup_db.js` 를 실행해 DB를 생성하세요.');
    process.exit(1);
  }
});
db.run('PRAGMA foreign_keys = ON');

// sqlite3 콜백 API를 async/await 로 쓰기 위한 헬퍼
const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    })
  );

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signToken = (user) =>
  jwt.sign({ userId: user.id, email: user.email, nickname: user.nickname }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  nickname: u.nickname,
  phone: u.phone,
  profile_image: u.profile_image,
  bio: u.bio,
  is_admin: u.is_admin === 1,
  created_at: u.created_at,
});

const app = express();
app.use(cors());
app.use(express.json());

/**
 * GET /api/sports — 활성 종목만, 노출 순서(sort_order) 오름차순
 * 200 → [{ id, name, icon, sort_order }]
 */
app.get('/api/sports', async (req, res) => {
  const rows = await dbAll(
    'SELECT id, name, icon, sort_order FROM sports WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
  );
  return res.json(rows);
});

/**
 * GET /api/venues
 * 승인된(approved) 장소 목록 + 위경도 + 동호회 수 + 동호회 목록 (지도 마커 클릭 시 바로 표시용)
 * (유저가 제보한 pending/rejected 장소는 노출하지 않는다)
 * Query (선택)
 *   sport=배드민턴          종목 (정확히 일치)
 *   q=잠실                  검색어 — 장소명·주소·동호회명 중 하나라도 포함되면 매칭
 * 로그인 토큰을 보내면 각 동호회의 내 가입 상태(my_status)도 포함된다.
 * 200 → [{ id, name, sport, address, lat, lng, phone, description, image_url, club_count,
 *          clubs: [{ id, name, description, recruit_status, member_count, max_members, is_public, my_status }] }]
 */
app.get('/api/venues', optionalAuth, async (req, res) => {
  const sport = req.query.sport ? String(req.query.sport).trim() : '';
  const q = req.query.q ? String(req.query.q).trim().slice(0, 50) : '';
  const where = ["v.status = 'approved'"];
  const params = [];
  if (sport) {
    where.push('v.sport = ?');
    params.push(sport);
  }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(`(v.name LIKE ? ESCAPE '\\' OR v.address LIKE ? ESCAPE '\\'
                 OR EXISTS (SELECT 1 FROM clubs cq WHERE cq.venue_id = v.id AND cq.name LIKE ? ESCAPE '\\'))`);
    params.push(like, like, like);
  }

  const venues = await dbAll(
    `SELECT v.id, v.name, v.sport, v.address, v.lat, v.lng, v.phone, v.description, v.image_url,
            (SELECT COUNT(*) FROM clubs c WHERE c.venue_id = v.id) AS club_count
     FROM venues v
     WHERE ${where.join(' AND ')}
     ORDER BY v.id`,
    params
  );
  if (venues.length === 0) return res.json([]);

  // 장소별 동호회 목록을 한 번에 가져와서 묶는다 (N+1 쿼리 방지)
  const ids = venues.map((v) => v.id);
  const clubs = await dbAll(
    `SELECT c.id, c.venue_id, c.name, c.description, c.recruit_status, c.max_members, c.is_public,
            (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.status = 'approved') AS member_count,
            (SELECT me.status FROM club_members me WHERE me.club_id = c.id AND me.user_id = ?) AS my_status
     FROM clubs c
     WHERE c.venue_id IN (${ids.map(() => '?').join(',')})
     ORDER BY CASE c.recruit_status WHEN 'recruiting' THEN 0 WHEN 'closing_soon' THEN 1 ELSE 2 END, c.id`,
    [req.user?.id ?? null, ...ids]
  );
  const byVenue = new Map(ids.map((id) => [id, []]));
  clubs.forEach((c) =>
    byVenue.get(c.venue_id).push({
      id: c.id,
      name: c.name,
      description: c.description,
      recruit_status: c.recruit_status,
      recruit_status_label: RECRUIT_STATUS_LABEL[c.recruit_status],
      member_count: c.member_count,
      max_members: c.max_members,
      is_public: c.is_public === 1,
      my_status: c.my_status ?? null,
    })
  );

  return res.json(venues.map((v) => ({ ...v, clubs: byVenue.get(v.id) })));
});

/* ------------------------------------------------------------------ */
/* 장소 제보 — 로그인한 누구나 (관리자 승인 전까지 pending)              */
/* ------------------------------------------------------------------ */

// 종목 목록은 sports 테이블에서 관리한다 (관리자 /admin/sports). venues.sport 에는 종목명이 저장된다.
const MAX_PENDING_REPORTS = 10; // 한 사람이 동시에 승인 대기로 둘 수 있는 제보 수 (도배 방지)
// 대한민국 영역 대략적인 범위
const KOREA_BOUNDS = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 };

/**
 * 새 장소 입력값 검증. 반환: { data: { name, sport, address, description, lat, lng } } | { error }
 * 종목은 sports 테이블의 활성 종목이어야 한다. (관리자 수정은 allowInactive 로 비활성 종목도 허용)
 */
async function parseNewVenue(raw, { allowInactive = false } = {}) {
  const b = raw || {};
  const name = String(b.name || '').trim();
  const sport = String(b.sport || '').trim();
  const address = String(b.address || '').trim();
  const description = b.description ? String(b.description).trim() : null;
  const lat = Number(b.lat);
  const lng = Number(b.lng);

  if (name.length < 2 || name.length > 30) return { error: '장소 이름은 2~30자로 입력해 주세요.' };
  const sportRow = sport ? await dbGet('SELECT is_active FROM sports WHERE name = ?', [sport]) : null;
  if (!sportRow || (!allowInactive && sportRow.is_active !== 1)) return { error: '장소의 종목을 선택해 주세요.' };
  if (b.lat === '' || b.lng === '' || b.lat == null || b.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: '지도에서 장소 위치를 선택해 주세요.' };
  }
  if (lat < KOREA_BOUNDS.minLat || lat > KOREA_BOUNDS.maxLat || lng < KOREA_BOUNDS.minLng || lng > KOREA_BOUNDS.maxLng) {
    return { error: '국내 위치만 등록할 수 있어요.' };
  }
  if (!address || address.length > 100) return { error: '주소는 1~100자로 입력해 주세요.' };
  if (description && description.length > 200) return { error: '장소 설명은 200자 이내로 입력해 주세요.' };
  // 위경도는 소수점 6자리(약 10cm)까지만 저장
  return { data: { name, sport, address, description, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) } };
}

/** 같은 이름의 장소가 근처(약 100m 이내)에 이미 있거나 제보돼 있는지 */
const findNearbyVenue = (name, lat, lng) =>
  dbGet(
    `SELECT id, name, status FROM venues
     WHERE name = ? AND status IN ('pending', 'approved')
       AND ABS(lat - ?) < 0.001 AND ABS(lng - ?) < 0.001
     ORDER BY CASE status WHEN 'approved' THEN 0 ELSE 1 END
     LIMIT 1`,
    [name, lat, lng]
  );

const countPendingReports = async (userId) =>
  (await dbGet("SELECT COUNT(*) AS cnt FROM venues WHERE submitted_by = ? AND status = 'pending'", [userId])).cnt;

const insertPendingVenue = async (v, userId) =>
  (
    await dbRun(
      `INSERT INTO venues (name, sport, address, lat, lng, description, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [v.name, v.sport, v.address, v.lat, v.lng, v.description, userId]
    )
  ).lastID;

/**
 * POST /api/venues  (인증 필요)
 * Body: { name, sport, lat, lng, address, description? }
 * 장소만 단독으로 제보한다. (현재 프론트는 동호회 개설 화면의 new_venue 로 통합되어 이 API를 쓰지 않음)
 * status 는 요청 값과 상관없이 항상 'pending'.
 * 201 → { message, venue: { id, name, sport, address, lat, lng, description, status: 'pending' } }
 */
app.post('/api/venues', authMiddleware, async (req, res) => {
  const parsed = await parseNewVenue(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { name, lat, lng } = parsed.data;

  const user = await dbGet('SELECT id FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: '유효하지 않은 사용자입니다. 다시 로그인해 주세요.' });

  const dup = await findNearbyVenue(name, lat, lng);
  if (dup) {
    return res.status(409).json({
      error: dup.status === 'approved' ? '이미 등록된 장소예요.' : '이미 제보되어 승인을 기다리고 있는 장소예요.',
    });
  }
  if ((await countPendingReports(req.user.id)) >= MAX_PENDING_REPORTS) {
    return res.status(409).json({ error: `승인 대기 중인 제보가 ${MAX_PENDING_REPORTS}개 이상이에요. 승인된 후 다시 제보해 주세요.` });
  }

  const lastID = await insertPendingVenue(parsed.data, req.user.id);
  const venue = await dbGet(
    'SELECT id, name, sport, address, lat, lng, description, status, created_at FROM venues WHERE id = ?',
    [lastID]
  );
  return res.status(201).json({
    message: '장소 제보가 완료되었습니다! 관리자 승인 후 지도에 표시됩니다.',
    venue,
  });
});

/* ------------------------------------------------------------------ */
/* 인증                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/auth/register
 * Body: { email, password, nickname, phone? }
 * 201 → { token, user }
 */
app.post('/api/auth/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const nickname = String(req.body?.nickname || '').trim();
  const phone = req.body?.phone ? String(req.body.phone).trim() : null;

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }
  if (!nickname || nickname.length > 20) {
    return res.status(400).json({ error: '닉네임은 1~20자로 입력해 주세요.' });
  }

  const exists = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) {
    return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const { lastID } = await dbRun(
      'INSERT INTO users (email, password_hash, nickname, phone) VALUES (?, ?, ?, ?)',
      [email, passwordHash, nickname, phone]
    );
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [lastID]);
    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    // 동시에 같은 이메일로 가입한 경우 UNIQUE 제약 위반
    if (err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }
    throw err;
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * 200 → { token, user }
 */
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해 주세요.' });
  }

  const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
  // bcrypt 해시가 아닌 값(더미 데이터 등)은 비교하지 않고 실패 처리
  const ok = user && user.password_hash.startsWith('$2') && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    // 이메일 존재 여부를 노출하지 않도록 같은 메시지 사용
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

/**
 * GET /api/auth/me  (인증 필요)
 * authMiddleware 사용 예시 겸 현재 로그인한 사용자 정보 조회
 */
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  }
  return res.json({ user: publicUser(user) });
});

/* ------------------------------------------------------------------ */
/* 동호회                                                              */
/* ------------------------------------------------------------------ */

const RECRUIT_STATUS_LABEL = {
  recruiting: '모집중',
  closing_soon: '마감임박',
  closed: '모집마감',
};

/**
 * GET /api/venues/:venueId/clubs
 * 특정 장소에 속한 동호회 목록 + 모집 상태 + 현재 인원(승인된 멤버 수)
 * 로그인 토큰을 함께 보내면 각 동호회에 대한 내 가입 상태(my_status)도 포함된다.
 * 200 → { venue: { id, name, sport, address, ... }, clubs: [...] }
 */
app.get('/api/venues/:venueId/clubs', optionalAuth, async (req, res) => {
  const venueId = Number(req.params.venueId);
  if (!Number.isInteger(venueId) || venueId <= 0) {
    return res.status(400).json({ error: '잘못된 장소 ID입니다.' });
  }

  const venue = await dbGet(
    "SELECT id, name, sport, address, phone, description, image_url FROM venues WHERE id = ? AND status = 'approved'",
    [venueId]
  );
  if (!venue) {
    return res.status(404).json({ error: '장소를 찾을 수 없습니다.' });
  }

  const rows = await dbAll(
    `
    SELECT c.id, c.name, c.description, c.is_public, c.recruit_status,
           c.max_members, c.monthly_fee, c.skill_level, c.activity_time,
           c.cover_image, c.created_at,
           (c.created_at >= datetime('now', '-30 days')) AS is_new,
           u.id AS owner_id, u.nickname AS owner_nickname,
           COUNT(m.id) AS member_count,
           (SELECT me.status FROM club_members me
             WHERE me.club_id = c.id AND me.user_id = ?) AS my_status
    FROM clubs c
    JOIN users u ON u.id = c.owner_id
    LEFT JOIN club_members m ON m.club_id = c.id AND m.status = 'approved'
    WHERE c.venue_id = ?
    GROUP BY c.id
    ORDER BY CASE c.recruit_status
               WHEN 'recruiting' THEN 0
               WHEN 'closing_soon' THEN 1
               ELSE 2
             END,
             c.id
    `,
    [req.user?.id ?? null, venueId]
  );

  const clubs = rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    is_public: c.is_public === 1,
    recruit_status: c.recruit_status,
    recruit_status_label: RECRUIT_STATUS_LABEL[c.recruit_status],
    member_count: c.member_count,
    max_members: c.max_members,
    monthly_fee: c.monthly_fee,
    skill_level: c.skill_level,
    activity_time: c.activity_time,
    is_new: c.is_new === 1, // 생성 30일 이내
    cover_image: c.cover_image,
    owner: { id: c.owner_id, nickname: c.owner_nickname },
    // 내 가입 상태: null(미신청) | pending | approved | rejected | left  (비로그인이면 항상 null)
    my_status: c.my_status ?? null,
    created_at: c.created_at,
  }));

  return res.json({ venue, clubs });
});

/**
 * POST /api/clubs/:clubId/join  (인증 필요)
 * 동호회 가입 신청 → club_members 에 role='member', status='pending' 으로 저장
 *
 * 201 → { message, membership: { club_id, user_id, role, status } }
 * 400 잘못된 ID / 401 비로그인 / 404 없는 동호회
 * 409 이미 신청·가입됨, 거절됨, 모집 마감, 정원 초과
 */
app.post('/api/clubs/:clubId/join', authMiddleware, async (req, res) => {
  const clubId = Number(req.params.clubId);
  const userId = req.user.id;
  if (!Number.isInteger(clubId) || clubId <= 0) {
    return res.status(400).json({ error: '잘못된 동호회 ID입니다.' });
  }

  const club = await dbGet(
    `SELECT c.id, c.name, c.recruit_status, c.max_members,
            (SELECT COUNT(*) FROM club_members m
              WHERE m.club_id = c.id AND m.status = 'approved') AS member_count
     FROM clubs c WHERE c.id = ?`,
    [clubId]
  );
  if (!club) {
    return res.status(404).json({ error: '동호회를 찾을 수 없습니다.' });
  }

  // 토큰은 유효하지만 계정이 삭제된 경우 (FK 위반 방지)
  const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(401).json({ error: '유효하지 않은 사용자입니다. 다시 로그인해 주세요.' });
  }

  const existing = await dbGet('SELECT id, status FROM club_members WHERE club_id = ? AND user_id = ?', [
    clubId,
    userId,
  ]);
  if (existing?.status === 'pending') {
    return res.status(409).json({ error: '이미 가입 신청한 동호회입니다. 방장의 승인을 기다려주세요.', status: 'pending' });
  }
  if (existing?.status === 'approved') {
    return res.status(409).json({ error: '이미 가입된 동호회입니다.', status: 'approved' });
  }
  if (existing?.status === 'rejected') {
    return res.status(409).json({ error: '가입이 거절된 동호회입니다. 방장에게 문의해 주세요.', status: 'rejected' });
  }

  if (club.recruit_status === 'closed') {
    return res.status(409).json({ error: '모집이 마감된 동호회입니다.' });
  }
  if (club.max_members && club.member_count >= club.max_members) {
    return res.status(409).json({ error: '정원이 가득 찬 동호회입니다.' });
  }

  try {
    if (existing?.status === 'left') {
      // 탈퇴했던 회원의 재가입 신청: UNIQUE(club_id, user_id) 때문에 기존 행을 되살린다
      await dbRun(
        "UPDATE club_members SET role = 'member', status = 'pending', joined_at = NULL WHERE id = ?",
        [existing.id]
      );
    } else {
      await dbRun(
        "INSERT INTO club_members (club_id, user_id, role, status) VALUES (?, ?, 'member', 'pending')",
        [clubId, userId]
      );
    }
  } catch (err) {
    // 같은 요청이 동시에 두 번 들어온 경우 UNIQUE 제약 위반
    if (err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: '이미 가입 신청한 동호회입니다. 방장의 승인을 기다려주세요.', status: 'pending' });
    }
    throw err;
  }

  return res.status(201).json({
    message: '가입 신청이 완료되었습니다. 방장의 승인을 기다려주세요!',
    membership: { club_id: clubId, user_id: userId, role: 'member', status: 'pending' },
  });
});

/* ------------------------------------------------------------------ */
/* 동호회 회원 관리 (방장·운영진 전용)                                  */
/* ------------------------------------------------------------------ */

const MANAGER_ROLES = ['owner', 'manager'];
const ROLE_LABEL = { owner: '방장', manager: '운영진', treasurer: '총무', member: '회원' };

/**
 * 요청자가 해당 동호회를 관리할 수 있는지 확인한다.
 * - clubs.owner_id 가 본인이거나
 * - club_members 에서 승인(approved)된 owner/manager 역할이면 관리 가능
 * 반환: { club, myRole } | { error, status }
 */
async function getManageContext(clubId, userId) {
  if (!Number.isInteger(clubId) || clubId <= 0) {
    return { status: 400, error: '잘못된 동호회 ID입니다.' };
  }
  const club = await dbGet(
    `SELECT c.id, c.name, c.description, c.owner_id, c.max_members, c.recruit_status,
            v.id AS venue_id, v.name AS venue_name, v.sport, v.status AS venue_status
     FROM clubs c JOIN venues v ON v.id = c.venue_id
     WHERE c.id = ?`,
    [clubId]
  );
  if (!club) return { status: 404, error: '동호회를 찾을 수 없습니다.' };

  const me = await dbGet(
    "SELECT role FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'approved'",
    [clubId, userId]
  );
  const myRole = club.owner_id === userId ? 'owner' : me?.role;
  if (!MANAGER_ROLES.includes(myRole)) {
    return { status: 403, error: '방장 또는 운영진만 이용할 수 있습니다.' };
  }
  return { club, myRole };
}

const memberDto = (m) => ({
  user_id: m.user_id,
  nickname: m.nickname,
  profile_image: m.profile_image,
  bio: m.bio,
  role: m.role,
  role_label: ROLE_LABEL[m.role],
  status: m.status,
  applied_at: m.created_at, // 가입 신청일
  joined_at: m.joined_at, // 승인일
});

/**
 * GET /api/clubs/:clubId/members  (인증 + 방장·운영진)
 * 200 → { club, my_role, pending: [...], members: [...] }
 *  - pending: 가입 승인 대기자 (신청 오래된 순)
 *  - members: 승인된 회원 (방장 → 운영진 → 총무 → 회원, 가입일 순)
 */
app.get('/api/clubs/:clubId/members', authMiddleware, async (req, res) => {
  const ctx = await getManageContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const rows = await dbAll(
    `SELECT m.user_id, m.role, m.status, m.created_at, m.joined_at,
            u.nickname, u.profile_image, u.bio
     FROM club_members m JOIN users u ON u.id = m.user_id
     WHERE m.club_id = ? AND m.status IN ('pending', 'approved')
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'treasurer' THEN 2 ELSE 3 END,
              COALESCE(m.joined_at, m.created_at), m.id`,
    [ctx.club.id]
  );
  const pending = rows
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(memberDto);
  const members = rows.filter((r) => r.status === 'approved').map(memberDto);

  return res.json({
    club: {
      id: ctx.club.id,
      name: ctx.club.name,
      description: ctx.club.description,
      venue_id: ctx.club.venue_id,
      venue_name: ctx.club.venue_name,
      venue_status: ctx.club.venue_status,
      sport: ctx.club.sport,
      recruit_status: ctx.club.recruit_status,
      max_members: ctx.club.max_members,
      member_count: members.length,
    },
    my_role: ctx.myRole,
    pending,
    members,
  });
});

/**
 * PUT /api/clubs/:clubId/members/:userId  (인증 + 방장·운영진)
 * Body: { status: 'approved' | 'rejected' }
 * 가입 대기(pending) 중인 신청만 승인/거절할 수 있다.
 * 200 → { message, member }
 */
app.put('/api/clubs/:clubId/members/:userId', authMiddleware, async (req, res) => {
  const ctx = await getManageContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const targetId = Number(req.params.userId);
  const nextStatus = req.body?.status;
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: '잘못된 회원 ID입니다.' });
  }
  if (!['approved', 'rejected'].includes(nextStatus)) {
    return res.status(400).json({ error: "status는 'approved' 또는 'rejected'만 가능합니다." });
  }

  const target = await dbGet('SELECT id, status FROM club_members WHERE club_id = ? AND user_id = ?', [
    ctx.club.id,
    targetId,
  ]);
  if (!target) {
    return res.status(404).json({ error: '가입 신청 내역을 찾을 수 없습니다.' });
  }
  if (target.status !== 'pending') {
    return res.status(409).json({ error: '이미 처리된 가입 신청입니다.', status: target.status });
  }

  if (nextStatus === 'approved' && ctx.club.max_members) {
    const { cnt } = await dbGet(
      "SELECT COUNT(*) AS cnt FROM club_members WHERE club_id = ? AND status = 'approved'",
      [ctx.club.id]
    );
    if (cnt >= ctx.club.max_members) {
      return res.status(409).json({ error: '정원이 가득 차서 더 이상 승인할 수 없습니다.' });
    }
  }

  // status = 'pending' 조건을 걸어 동시에 두 운영진이 처리해도 한 번만 반영되게 한다
  const { changes } = await dbRun(
    `UPDATE club_members
     SET status = ?, joined_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE joined_at END
     WHERE id = ? AND status = 'pending'`,
    [nextStatus, nextStatus, target.id]
  );
  if (changes === 0) {
    return res.status(409).json({ error: '이미 처리된 가입 신청입니다.' });
  }

  const updated = await dbGet(
    `SELECT m.user_id, m.role, m.status, m.created_at, m.joined_at, u.nickname, u.profile_image, u.bio
     FROM club_members m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
    [target.id]
  );
  return res.json({
    message: nextStatus === 'approved' ? '가입을 승인했습니다.' : '가입을 거절했습니다.',
    member: memberDto(updated),
  });
});

/**
 * GET /api/me/clubs  (인증 필요)
 * 내가 가입했거나(승인), 신청 중이거나(대기), 운영 중인 동호회 목록
 * 200 → { clubs: [{ id, name, venue, my_role, my_status, can_manage, pending_count, ... }] }
 */
app.get('/api/me/clubs', authMiddleware, async (req, res) => {
  const rows = await dbAll(
    `SELECT c.id, c.name, c.recruit_status, c.max_members, c.activity_time, c.cover_image,
            v.id AS venue_id, v.name AS venue_name, v.sport, v.status AS venue_status,
            CASE WHEN c.owner_id = ? THEN 'owner' ELSE m.role END AS my_role,
            m.status AS my_status,
            (SELECT COUNT(*) FROM club_members a WHERE a.club_id = c.id AND a.status = 'approved') AS member_count,
            (SELECT COUNT(*) FROM club_members p WHERE p.club_id = c.id AND p.status = 'pending') AS pending_count
     FROM club_members m
     JOIN clubs c ON c.id = m.club_id
     JOIN venues v ON v.id = c.venue_id
     WHERE m.user_id = ? AND m.status IN ('approved', 'pending')
     ORDER BY CASE WHEN c.owner_id = ? OR m.role = 'manager' THEN 0 ELSE 1 END,
              CASE m.status WHEN 'approved' THEN 0 ELSE 1 END,
              c.name`,
    [req.user.id, req.user.id, req.user.id]
  );

  const clubs = rows.map((c) => {
    const canManage = c.my_status === 'approved' && MANAGER_ROLES.includes(c.my_role);
    return {
      id: c.id,
      name: c.name,
      venue: { id: c.venue_id, name: c.venue_name, sport: c.sport, status: c.venue_status },
      recruit_status: c.recruit_status,
      activity_time: c.activity_time,
      cover_image: c.cover_image,
      member_count: c.member_count,
      max_members: c.max_members,
      my_role: c.my_role,
      my_role_label: ROLE_LABEL[c.my_role],
      my_status: c.my_status,
      can_manage: canManage,
      // 대기 인원은 관리 권한이 있는 사람에게만 알려준다
      pending_count: canManage ? c.pending_count : undefined,
    };
  });
  return res.json({ clubs });
});

/* ------------------------------------------------------------------ */
/* 일정(스케줄) & 참석 투표(RSVP) — 동호회 회원 전용                     */
/* ------------------------------------------------------------------ */
// 일정 시각은 현지 시각(KST) 문자열 'YYYY-MM-DD HH:MM:SS' 로 저장/비교한다.

const RSVP_RESPONSES = ['attend', 'absent', 'maybe'];
const pad2 = (n) => String(n).padStart(2, '0');
const nowLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

/** 'YYYY-MM-DDTHH:MM' / 'YYYY-MM-DD HH:MM[:SS]' → 'YYYY-MM-DD HH:MM:SS' (잘못된 값이면 null) */
function normalizeDateTime(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = '00'] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  // 2026-02-30 같은 존재하지 않는 날짜 걸러내기
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  if (Number(h) > 23 || Number(mi) > 59 || Number(sec) > 59) return null;
  return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
}

/** 빈 값이면 null, 아니면 min~max 범위의 정수인지 검사. 실패 시 undefined */
function optionalInt(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/**
 * 요청자가 동호회의 승인된 회원인지 확인 (방장은 club_members 행이 없어도 허용)
 * 반환: { club, myRole, canManage } | { status, error }
 */
async function getMemberContext(clubId, userId) {
  if (!Number.isInteger(clubId) || clubId <= 0) {
    return { status: 400, error: '잘못된 동호회 ID입니다.' };
  }
  const club = await dbGet(
    `SELECT c.id, c.name, c.owner_id, c.max_members, c.venue_id,
            v.name AS venue_name, v.sport, v.status AS venue_status,
            (SELECT COUNT(*) FROM club_members a WHERE a.club_id = c.id AND a.status = 'approved') AS member_count
     FROM clubs c JOIN venues v ON v.id = c.venue_id WHERE c.id = ?`,
    [clubId]
  );
  if (!club) return { status: 404, error: '동호회를 찾을 수 없습니다.' };

  const me = await dbGet(
    "SELECT role FROM club_members WHERE club_id = ? AND user_id = ? AND status = 'approved'",
    [clubId, userId]
  );
  const myRole = club.owner_id === userId ? 'owner' : me?.role;
  if (!myRole) return { status: 403, error: '동호회 회원만 이용할 수 있습니다.' };
  return { club, myRole, canManage: MANAGER_ROLES.includes(myRole) };
}

const SCHEDULE_SELECT = `
  SELECT s.id, s.club_id, s.title, s.description, s.start_at, s.end_at, s.capacity, s.fee,
         s.rsvp_deadline, s.created_at,
         v.id AS venue_id, v.name AS venue_name, v.address AS venue_address,
         u.id AS creator_id, u.nickname AS creator_nickname,
         COALESCE(SUM(r.response = 'attend'), 0) AS attend_count,
         COALESCE(SUM(r.response = 'maybe'), 0)  AS maybe_count,
         COALESCE(SUM(r.response = 'absent'), 0) AS absent_count,
         (SELECT me.response FROM rsvps me WHERE me.schedule_id = s.id AND me.user_id = ?) AS my_response,
         (s.start_at <= datetime('now', 'localtime')) AS is_started,
         (s.rsvp_deadline IS NOT NULL AND s.rsvp_deadline <= datetime('now', 'localtime')) AS is_deadline_passed
  FROM schedules s
  LEFT JOIN venues v ON v.id = s.venue_id
  LEFT JOIN users u ON u.id = s.created_by
  LEFT JOIN rsvps r ON r.schedule_id = s.id`;

function scheduleDto(s) {
  const isFull = s.capacity != null && s.attend_count >= s.capacity;
  const voteClosed = s.is_started === 1 || s.is_deadline_passed === 1;
  let closeReason = null;
  if (s.is_started === 1) closeReason = 'started';
  else if (s.is_deadline_passed === 1) closeReason = 'deadline';
  else if (isFull) closeReason = 'full';

  return {
    id: s.id,
    club_id: s.club_id,
    title: s.title,
    description: s.description,
    start_at: s.start_at,
    end_at: s.end_at,
    venue: s.venue_id ? { id: s.venue_id, name: s.venue_name, address: s.venue_address } : null,
    capacity: s.capacity,
    fee: s.fee,
    rsvp_deadline: s.rsvp_deadline,
    counts: { attend: s.attend_count, maybe: s.maybe_count, absent: s.absent_count },
    my_response: s.my_response ?? null,
    is_closed: closeReason !== null, // 시작됨 / 투표 마감 / 정원 마감
    close_reason: closeReason, // 'started' | 'deadline' | 'full' | null
    can_vote: !voteClosed, // 불참·미정으로 바꾸는 건 정원이 차도 가능
    can_attend: !voteClosed && (!isFull || s.my_response === 'attend'),
    created_by: s.creator_id ? { id: s.creator_id, nickname: s.creator_nickname } : null,
    created_at: s.created_at,
  };
}

/** 일정 상세 + 응답자 명단(닉네임만 공개) */
async function getScheduleDetail(scheduleId, userId) {
  const row = await dbGet(`${SCHEDULE_SELECT} WHERE s.id = ? GROUP BY s.id`, [userId, scheduleId]);
  if (!row) return null;
  const people = await dbAll(
    `SELECT r.user_id, r.response, r.comment, u.nickname, u.profile_image
     FROM rsvps r JOIN users u ON u.id = r.user_id
     WHERE r.schedule_id = ? ORDER BY r.updated_at, r.id`,
    [scheduleId]
  );
  const pick = (resp) =>
    people
      .filter((p) => p.response === resp)
      .map((p) => ({ user_id: p.user_id, nickname: p.nickname, profile_image: p.profile_image, comment: p.comment }));
  return { ...scheduleDto(row), attendees: { attend: pick('attend'), maybe: pick('maybe'), absent: pick('absent') } };
}

/**
 * GET /api/clubs/:clubId/schedules?scope=upcoming|past  (인증 + 승인된 회원)
 * 200 → { club, my_role, can_manage, schedules: [...] }
 *  - upcoming(기본): 시작 전 일정, 가까운 순 / past: 지난 일정, 최근 순 (최대 30개)
 */
app.get('/api/clubs/:clubId/schedules', authMiddleware, async (req, res) => {
  const ctx = await getMemberContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const past = req.query.scope === 'past';
  const rows = await dbAll(
    `${SCHEDULE_SELECT}
     WHERE s.club_id = ? AND s.start_at ${past ? '<' : '>='} datetime('now', 'localtime')
     GROUP BY s.id
     ORDER BY s.start_at ${past ? 'DESC' : 'ASC'}
     LIMIT 30`,
    [req.user.id, ctx.club.id]
  );

  return res.json({
    club: {
      id: ctx.club.id,
      name: ctx.club.name,
      venue_id: ctx.club.venue_id,
      venue_name: ctx.club.venue_name,
      venue_status: ctx.club.venue_status, // 'approved' | 'pending' | 'rejected'
      sport: ctx.club.sport,
      member_count: ctx.club.member_count,
      max_members: ctx.club.max_members,
    },
    my_role: ctx.myRole,
    my_role_label: ROLE_LABEL[ctx.myRole],
    can_manage: ctx.canManage,
    schedules: rows.map(scheduleDto),
  });
});

/**
 * 일정 입력값 검증 (생성·수정 공용)
 * 반환: { data: { title, description, startAt, endAt, capacity, fee, deadline, venueId } } | { error }
 */
async function validateScheduleInput(raw, club) {
  const b = raw || {};
  const title = String(b.title || '').trim();
  const description = b.description ? String(b.description).trim() : null;
  const startAt = normalizeDateTime(b.start_at);
  const endAt = b.end_at ? normalizeDateTime(b.end_at) : null;
  const deadline = b.rsvp_deadline ? normalizeDateTime(b.rsvp_deadline) : null;
  const capacity = optionalInt(b.capacity, 1, 999);
  const fee = optionalInt(b.fee, 0, 1000000);
  const venueId = optionalInt(b.venue_id, 1, Number.MAX_SAFE_INTEGER);
  const now = nowLocal();

  if (!title || title.length > 50) return { error: '일정 제목은 1~50자로 입력해 주세요.' };
  if (description && description.length > 500) return { error: '설명은 500자 이내로 입력해 주세요.' };
  if (!startAt) return { error: '모임 시작 일시를 올바르게 입력해 주세요.' };
  if (startAt <= now) return { error: '모임 시작 일시는 현재 이후여야 합니다.' };
  if (b.end_at && !endAt) return { error: '종료 일시 형식이 올바르지 않습니다.' };
  if (endAt && endAt <= startAt) return { error: '종료 일시는 시작 일시 이후여야 합니다.' };
  if (b.rsvp_deadline && !deadline) return { error: '투표 마감 일시 형식이 올바르지 않습니다.' };
  if (deadline && (deadline <= now || deadline > startAt)) {
    return { error: '투표 마감은 지금 이후, 모임 시작 전이어야 합니다.' };
  }
  if (capacity === undefined) return { error: '정원은 1~999 사이의 숫자로 입력해 주세요.' };
  if (fee === undefined) return { error: '참가비는 0~1,000,000원 사이로 입력해 주세요.' };
  if (venueId === undefined) return { error: '잘못된 장소입니다.' };

  const finalVenueId = venueId ?? club.venue_id;
  // 승인된 장소이거나, 승인 대기 중이라도 이 동호회의 주 활동 장소면 허용
  const venue = await dbGet("SELECT id FROM venues WHERE id = ? AND (status = 'approved' OR id = ?)", [
    finalVenueId,
    club.venue_id,
  ]);
  if (!venue) return { error: '존재하지 않는 장소입니다.' };

  return { data: { title, description, startAt, endAt, capacity, fee: fee ?? 0, deadline, venueId: finalVenueId } };
}

/**
 * POST /api/clubs/:clubId/schedules  (인증 + 방장·운영진)
 * Body: { title, start_at, end_at?, venue_id?, capacity?, fee?, rsvp_deadline?, description? }
 *   - 날짜는 'YYYY-MM-DDTHH:MM' (input[type=datetime-local] 형식) 또는 'YYYY-MM-DD HH:MM'
 *   - venue_id 생략 시 동호회 기본 장소
 * 201 → { message, schedule }
 */
app.post('/api/clubs/:clubId/schedules', authMiddleware, async (req, res) => {
  const ctx = await getMemberContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
  if (!ctx.canManage) return res.status(403).json({ error: '방장 또는 운영진만 일정을 만들 수 있습니다.' });

  const parsed = await validateScheduleInput(req.body, ctx.club);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { title, description, startAt, endAt, capacity, fee, deadline, venueId: finalVenueId } = parsed.data;

  const { lastID } = await dbRun(
    `INSERT INTO schedules (club_id, venue_id, created_by, title, description, start_at, end_at, capacity, fee, rsvp_deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ctx.club.id, finalVenueId, req.user.id, title, description, startAt, endAt, capacity, fee, deadline]
  );
  const schedule = await getScheduleDetail(lastID, req.user.id);
  return res.status(201).json({ message: '새 일정이 등록되었습니다.', schedule });
});

/**
 * GET /api/schedules/:scheduleId  (인증 + 해당 동호회 승인 회원)
 * 200 → { schedule: { ...일정, attendees: { attend, maybe, absent } } }
 */
app.get('/api/schedules/:scheduleId', authMiddleware, async (req, res) => {
  const scheduleId = Number(req.params.scheduleId);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return res.status(400).json({ error: '잘못된 일정 ID입니다.' });
  }
  const base = await dbGet('SELECT club_id FROM schedules WHERE id = ?', [scheduleId]);
  if (!base) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });

  const ctx = await getMemberContext(base.club_id, req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  return res.json({ schedule: await getScheduleDetail(scheduleId, req.user.id) });
});

/**
 * POST /api/schedules/:scheduleId/rsvp  (인증 + 해당 동호회 승인 회원)
 * Body: { response: 'attend' | 'absent' | 'maybe', comment? }
 * 처음이면 투표, 이미 했으면 수정(덮어쓰기). 모임 시작·투표 마감 후에는 불가.
 * 정원이 찼으면 '참석'만 막고 불참/미정 변경은 허용.
 * 200 → { message, schedule: { ...일정, attendees } }
 */
app.post('/api/schedules/:scheduleId/rsvp', authMiddleware, async (req, res) => {
  const scheduleId = Number(req.params.scheduleId);
  const response = req.body?.response;
  const comment = req.body?.comment == null ? null : String(req.body.comment).trim().slice(0, 100);

  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return res.status(400).json({ error: '잘못된 일정 ID입니다.' });
  }
  if (!RSVP_RESPONSES.includes(response)) {
    return res.status(400).json({ error: "response는 'attend', 'absent', 'maybe' 중 하나여야 합니다." });
  }

  const schedule = await dbGet(
    `SELECT id, club_id, capacity,
            (start_at <= datetime('now', 'localtime')) AS is_started,
            (rsvp_deadline IS NOT NULL AND rsvp_deadline <= datetime('now', 'localtime')) AS is_deadline_passed
     FROM schedules WHERE id = ?`,
    [scheduleId]
  );
  if (!schedule) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });

  const ctx = await getMemberContext(schedule.club_id, req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  if (schedule.is_started === 1) return res.status(409).json({ error: '이미 시작했거나 지난 일정입니다.' });
  if (schedule.is_deadline_passed === 1) return res.status(409).json({ error: '참석 투표가 마감된 일정입니다.' });

  // 정원 확인과 저장을 한 문장으로 처리해서, 동시에 '참석'이 몰려도 정원을 넘지 않게 한다
  const { changes } = await dbRun(
    `INSERT INTO rsvps (schedule_id, user_id, response, comment, updated_at)
     SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP
     WHERE ? <> 'attend'
        OR (SELECT capacity FROM schedules WHERE id = ?) IS NULL
        OR (SELECT COUNT(*) FROM rsvps WHERE schedule_id = ? AND response = 'attend' AND user_id <> ?)
           < (SELECT capacity FROM schedules WHERE id = ?)
     ON CONFLICT (schedule_id, user_id) DO UPDATE SET
       response = excluded.response,
       comment = COALESCE(excluded.comment, rsvps.comment),
       updated_at = CURRENT_TIMESTAMP`,
    [scheduleId, req.user.id, response, comment, response, scheduleId, scheduleId, req.user.id, scheduleId]
  );
  if (changes === 0) {
    return res.status(409).json({ error: '참석 정원이 마감되었습니다. 불참 또는 미정으로만 응답할 수 있어요.' });
  }

  const MESSAGES = { attend: '참석으로 투표했어요!', absent: '불참으로 투표했어요.', maybe: '미정으로 투표했어요.' };
  return res.json({ message: MESSAGES[response], schedule: await getScheduleDetail(scheduleId, req.user.id) });
});

/* ------------------------------------------------------------------ */
/* 동호회 단체 채팅 — 승인된 회원 전용 (REST: 이전 기록 / Socket.io: 실시간) */
/* ------------------------------------------------------------------ */
// 메시지 시각은 일정과 같이 현지 시각(KST) 'YYYY-MM-DD HH:MM:SS' 로 저장한다.

const MESSAGE_MAX_LENGTH = 1000;
const chatRoomName = (clubId) => `club:${clubId}`;

/** 동호회 단체방 id (없으면 만든다) */
async function getClubRoomId(clubId) {
  const find = () => dbGet("SELECT id FROM chat_rooms WHERE type = 'club' AND club_id = ?", [clubId]);
  const existing = await find();
  if (existing) return existing.id;
  // 동시에 처음 입장하는 경우를 대비해 OR IGNORE 후 다시 조회
  await dbRun("INSERT OR IGNORE INTO chat_rooms (type, club_id) VALUES ('club', ?)", [clubId]);
  return (await find()).id;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.room_id, m.content, m.type, m.created_at,
         u.id AS sender_id, u.nickname AS sender_nickname, u.profile_image AS sender_profile_image
  FROM messages m JOIN users u ON u.id = m.sender_id`;

// 개인정보 보호: 보낸 사람은 닉네임/프로필 이미지만 공개
const messageDto = (m) => ({
  id: m.id,
  room_id: m.room_id,
  type: m.type,
  content: m.content,
  created_at: m.created_at,
  sender: { id: m.sender_id, nickname: m.sender_nickname, profile_image: m.sender_profile_image },
});

/**
 * GET /api/clubs/:clubId/chat/messages?before=<messageId>&limit=50  (인증 + 승인된 회원)
 * 최신 메시지 limit개를 시간 순(오래된 → 최신)으로. before를 주면 그보다 이전 메시지(무한 스크롤용)
 * 200 → { room_id, club: { id, name, member_count }, messages: [...], has_more }
 */
app.get('/api/clubs/:clubId/chat/messages', authMiddleware, async (req, res) => {
  const ctx = await getMemberContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const before = req.query.before ? Number(req.query.before) : null;
  if (before !== null && (!Number.isInteger(before) || before <= 0)) {
    return res.status(400).json({ error: '잘못된 before 값입니다.' });
  }

  const roomId = await getClubRoomId(ctx.club.id);
  const rows = await dbAll(
    `${MESSAGE_SELECT}
     WHERE m.room_id = ? ${before ? 'AND m.id < ?' : ''}
     ORDER BY m.id DESC
     LIMIT ?`,
    before ? [roomId, before, limit + 1] : [roomId, limit + 1]
  );
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse().map(messageDto);

  return res.json({
    room_id: roomId,
    club: { id: ctx.club.id, name: ctx.club.name, member_count: ctx.club.member_count },
    messages,
    has_more: hasMore,
  });
});

/* ------------------------------------------------------------------ */
/* 동호회 개설 — 로그인한 누구나                                         */
/* ------------------------------------------------------------------ */

const MAX_OWNED_CLUBS = 10; // 한 사람이 방장으로 운영할 수 있는 동호회 수 (도배 방지)

/**
 * POST /api/clubs  (인증 필요)
 * Body: { name, description, max_members?, monthly_fee?, skill_level?, activity_time?, is_public?,
 *         venue_id            ← 기존(승인된) 장소를 고른 경우
 *       | new_venue: { name, sport, address, lat, lng, description? }  ← 목록에 없어 직접 등록하는 경우 }
 *
 * - new_venue 가 오면 venues 에 status='pending' 으로 먼저 저장하고 그 장소로 동호회를 개설한다.
 *   (같은 이름의 장소가 근처에 이미 승인돼 있으면 409 + existing_venue 로 알려주고,
 *    승인 대기 중인 같은 장소가 있으면 새로 만들지 않고 그 장소를 사용한다)
 * - 개설자는 club_members 에 role='owner'(방장), status='approved' 로 즉시 등록되고 단체 채팅방도 만들어진다.
 * 201 → { message, club: { id, name, venue_id, venue_name, venue_status, ... } }
 */
app.post('/api/clubs', authMiddleware, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const description = String(b.description || '').trim();
  const skillLevel = b.skill_level ? String(b.skill_level).trim() : null;
  const activityTime = b.activity_time ? String(b.activity_time).trim() : null;
  const maxMembers = optionalInt(b.max_members, 2, 999);
  const monthlyFee = optionalInt(b.monthly_fee, 0, 1000000);
  const isPublic = b.is_public === undefined ? 1 : b.is_public ? 1 : 0;
  const hasNewVenue = b.new_venue != null;

  // --- 동호회 정보 검증 ---
  if (hasNewVenue && b.venue_id != null) {
    return res.status(400).json({ error: '기존 장소(venue_id)와 새 장소(new_venue) 중 하나만 보내 주세요.' });
  }
  if (!hasNewVenue && !b.venue_id) return res.status(400).json({ error: '주 활동 장소를 선택해 주세요.' });
  if (name.length < 2 || name.length > 30) return res.status(400).json({ error: '동호회 이름은 2~30자로 입력해 주세요.' });
  if (!description || description.length > 60) return res.status(400).json({ error: '한 줄 소개는 1~60자로 입력해 주세요.' });
  if (skillLevel && skillLevel.length > 20) return res.status(400).json({ error: '실력은 20자 이내로 입력해 주세요.' });
  if (activityTime && activityTime.length > 30) return res.status(400).json({ error: '활동 시간은 30자 이내로 입력해 주세요.' });
  if (maxMembers === undefined) return res.status(400).json({ error: '정원은 2~999명 사이로 입력해 주세요.' });
  if (monthlyFee === undefined) return res.status(400).json({ error: '월 회비는 0~1,000,000원 사이로 입력해 주세요.' });

  const user = await dbGet('SELECT id FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: '유효하지 않은 사용자입니다. 다시 로그인해 주세요.' });

  const { cnt } = await dbGet('SELECT COUNT(*) AS cnt FROM clubs WHERE owner_id = ?', [req.user.id]);
  if (cnt >= MAX_OWNED_CLUBS) {
    return res.status(409).json({ error: `동호회는 한 사람당 최대 ${MAX_OWNED_CLUBS}개까지 개설할 수 있어요.` });
  }

  // --- 장소 결정 ---
  let venue; // { id, name, status }
  let createdVenueId = null; // 이번 요청에서 새로 만든 장소 (실패 시 정리용)

  if (hasNewVenue) {
    const parsed = await parseNewVenue(b.new_venue);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const nv = parsed.data;

    const nearby = await findNearbyVenue(nv.name, nv.lat, nv.lng);
    if (nearby?.status === 'approved') {
      return res.status(409).json({
        error: '이미 등록된 장소예요. 목록에서 선택해 주세요.',
        existing_venue: { id: nearby.id, name: nearby.name },
      });
    }
    if (nearby) {
      venue = nearby; // 승인 대기 중인 같은 장소 재사용
    } else {
      if ((await countPendingReports(req.user.id)) >= MAX_PENDING_REPORTS) {
        return res.status(409).json({ error: `승인 대기 중인 장소가 ${MAX_PENDING_REPORTS}개 이상이에요. 승인된 후 다시 등록해 주세요.` });
      }
      createdVenueId = await insertPendingVenue(nv, req.user.id);
      venue = { id: createdVenueId, name: nv.name, status: 'pending' };
    }
  } else {
    const venueId = optionalInt(b.venue_id, 1, Number.MAX_SAFE_INTEGER);
    venue = venueId && (await dbGet("SELECT id, name, status FROM venues WHERE id = ? AND status = 'approved'", [venueId]));
    if (!venue) return res.status(400).json({ error: '존재하지 않는 장소입니다.' });
  }

  const cleanupVenue = () =>
    createdVenueId ? dbRun('DELETE FROM venues WHERE id = ?', [createdVenueId]).catch(() => {}) : Promise.resolve();

  const dup = await dbGet('SELECT id FROM clubs WHERE venue_id = ? AND name = ?', [venue.id, name]);
  if (dup) {
    await cleanupVenue();
    return res.status(409).json({ error: '같은 장소에 같은 이름의 동호회가 이미 있어요.' });
  }

  // --- 동호회 + 방장 + 채팅방 ---
  let clubId = null;
  try {
    clubId = (
      await dbRun(
        `INSERT INTO clubs (venue_id, owner_id, name, description, is_public, recruit_status,
                            max_members, monthly_fee, skill_level, activity_time)
         VALUES (?, ?, ?, ?, ?, 'recruiting', ?, ?, ?, ?)`,
        [venue.id, req.user.id, name, description, isPublic, maxMembers, monthlyFee ?? 0, skillLevel, activityTime]
      )
    ).lastID;
    // 개설자 = 방장으로 즉시 가입 승인
    await dbRun(
      "INSERT INTO club_members (club_id, user_id, role, status, joined_at) VALUES (?, ?, 'owner', 'approved', CURRENT_TIMESTAMP)",
      [clubId, req.user.id]
    );
    const roomId = await getClubRoomId(clubId);
    await dbRun(
      "INSERT INTO messages (room_id, sender_id, content, type, created_at) VALUES (?, ?, ?, 'system', datetime('now', 'localtime'))",
      [roomId, req.user.id, `${name} 단체방이 생성되었습니다.`]
    );
  } catch (err) {
    // 중간에 실패하면 반쯤 만들어진 동호회/장소를 지운다 (club_members·채팅방은 CASCADE)
    if (clubId) await dbRun('DELETE FROM clubs WHERE id = ?', [clubId]).catch(() => {});
    await cleanupVenue();
    throw err;
  }

  const club = await dbGet(
    `SELECT id, venue_id, name, description, is_public, recruit_status, max_members, monthly_fee,
            skill_level, activity_time, created_at
     FROM clubs WHERE id = ?`,
    [clubId]
  );
  const pending = venue.status === 'pending';
  return res.status(201).json({
    message: pending
      ? '동호회가 개설되었습니다. 장소는 관리자 승인 후 지도에 공개됩니다.'
      : '동호회가 개설되었습니다.',
    club: {
      ...club,
      is_public: club.is_public === 1,
      venue_name: venue.name,
      venue_status: venue.status,
      my_role: 'owner',
    },
  });
});

/* ------------------------------------------------------------------ */
/* 내 정보: 프로필 수정 / 비밀번호 변경 / 내 일정 모아보기               */
/* ------------------------------------------------------------------ */

const NICKNAME_MAX = 20;
const BIO_MAX = 100;

/**
 * PUT /api/users/me  (인증 필요)
 * Body: { nickname?, bio? }  — bio 를 빈 문자열/null 로 보내면 소개를 지운다
 * 닉네임이 바뀌면 토큰에 담긴 닉네임도 맞추기 위해 새 토큰을 함께 준다.
 * 200 → { message, user, token }
 */
app.put('/api/users/me', authMiddleware, async (req, res) => {
  const me = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!me) return res.status(401).json({ error: '유효하지 않은 사용자입니다. 다시 로그인해 주세요.' });

  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!has('nickname') && !has('bio')) return res.status(400).json({ error: '수정할 내용이 없습니다.' });

  // 연속 공백은 하나로, 앞뒤 공백 제거
  const nickname = has('nickname') ? String(b.nickname ?? '').replace(/\s+/g, ' ').trim() : me.nickname;
  const bio = has('bio') ? (b.bio == null ? '' : String(b.bio).trim()) : me.bio || '';

  if (!nickname) return res.status(400).json({ error: '닉네임을 입력해 주세요. 공백만으로는 만들 수 없어요.' });
  if (nickname.length > NICKNAME_MAX) return res.status(400).json({ error: `닉네임은 ${NICKNAME_MAX}자 이내로 입력해 주세요.` });
  if (bio.length > BIO_MAX) return res.status(400).json({ error: `한 줄 소개는 ${BIO_MAX}자 이내로 입력해 주세요.` });

  await dbRun('UPDATE users SET nickname = ?, bio = ? WHERE id = ?', [nickname, bio || null, me.id]);
  const user = await dbGet('SELECT * FROM users WHERE id = ?', [me.id]);
  return res.json({ message: '프로필을 저장했습니다.', user: publicUser(user), token: signToken(user) });
});

/**
 * PUT /api/users/me/password  (인증 필요)
 * Body: { current_password, new_password }
 * 현재 비밀번호가 틀리면 400 (401은 '로그인 만료'로 쓰이므로 구분)
 */
app.put('/api/users/me/password', authMiddleware, async (req, res) => {
  const current = String(req.body?.current_password ?? '');
  const next = String(req.body?.new_password ?? '');
  if (!current || !next) return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해 주세요.' });
  if (next.length < 8) return res.status(400).json({ error: '새 비밀번호는 8자 이상이어야 합니다.' });
  if (next.length > 72) return res.status(400).json({ error: '새 비밀번호는 72자 이하로 입력해 주세요.' }); // bcrypt 한계

  const me = await dbGet('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!me) return res.status(401).json({ error: '유효하지 않은 사용자입니다. 다시 로그인해 주세요.' });

  const ok = me.password_hash.startsWith('$2') && (await bcrypt.compare(current, me.password_hash));
  if (!ok) return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.', field: 'current_password' });
  if (await bcrypt.compare(next, me.password_hash)) {
    return res.status(400).json({ error: '새 비밀번호가 현재 비밀번호와 같아요.', field: 'new_password' });
  }

  await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(next, BCRYPT_ROUNDS), me.id]);
  return res.json({ message: '비밀번호를 변경했습니다.' });
});

/**
 * GET /api/users/me/schedules?responses=attend[,maybe]  (인증 필요)
 * 내가 승인된 회원인 모든 동호회의 '예정된' 일정 중 내가 참석(기본)으로 투표한 일정, 날짜 오름차순
 * 200 → { schedules: [{ id, title, start_at, end_at, fee, capacity, attend_count, my_response,
 *                       club: { id, name, sport }, venue: { id, name, address } }] }
 */
app.get('/api/users/me/schedules', authMiddleware, async (req, res) => {
  const responses = String(req.query.responses || 'attend')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => RSVP_RESPONSES.includes(x));
  if (responses.length === 0) {
    return res.status(400).json({ error: "responses는 attend, maybe, absent 중에서 골라 주세요." });
  }

  const rows = await dbAll(
    `SELECT s.id, s.title, s.start_at, s.end_at, s.fee, s.capacity,
            r.response AS my_response,
            c.id AS club_id, c.name AS club_name,
            v.id AS venue_id, v.name AS venue_name, v.address AS venue_address,
            cv.sport AS sport,
            (SELECT COUNT(*) FROM rsvps a WHERE a.schedule_id = s.id AND a.response = 'attend') AS attend_count
     FROM rsvps r
     JOIN schedules s ON s.id = r.schedule_id
     JOIN clubs c ON c.id = s.club_id
     JOIN venues cv ON cv.id = c.venue_id
     LEFT JOIN venues v ON v.id = s.venue_id
     WHERE r.user_id = ?
       AND r.response IN (${responses.map(() => '?').join(',')})
       AND s.start_at >= datetime('now', 'localtime')
       AND (c.owner_id = r.user_id OR EXISTS (
             SELECT 1 FROM club_members m
             WHERE m.club_id = c.id AND m.user_id = r.user_id AND m.status = 'approved'))
     ORDER BY s.start_at ASC, s.id ASC
     LIMIT 100`,
    [req.user.id, ...responses]
  );

  return res.json({
    schedules: rows.map((r) => ({
      id: r.id,
      title: r.title,
      start_at: r.start_at,
      end_at: r.end_at,
      fee: r.fee,
      capacity: r.capacity,
      attend_count: r.attend_count,
      my_response: r.my_response,
      club: { id: r.club_id, name: r.club_name, sport: r.sport },
      venue: r.venue_id ? { id: r.venue_id, name: r.venue_name, address: r.venue_address } : null,
    })),
  });
});

/* ------------------------------------------------------------------ */
/* 동호회 운영 CRUD: 일정 수정·삭제 / 회원 역할·내보내기 / 정보 수정 / 탈퇴 */
/* ------------------------------------------------------------------ */

/** 일정 + 그 동호회에 대한 내 권한 (방장·운영진만 통과) */
async function getScheduleManageContext(scheduleIdRaw, userId) {
  const scheduleId = idParamPlain(scheduleIdRaw);
  if (!scheduleId) return { status: 400, error: '잘못된 일정 ID입니다.' };
  const schedule = await dbGet(
    "SELECT id, club_id, title, (start_at <= datetime('now', 'localtime')) AS is_started FROM schedules WHERE id = ?",
    [scheduleId]
  );
  if (!schedule) return { status: 404, error: '일정을 찾을 수 없습니다.' };
  const ctx = await getMemberContext(schedule.club_id, userId);
  if (ctx.error) return ctx;
  if (!ctx.canManage) return { status: 403, error: '방장 또는 운영진만 일정을 수정·삭제할 수 있습니다.' };
  return { ...ctx, schedule };
}

function idParamPlain(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 탈퇴·내보내기 시: 아직 시작 안 한 일정의 투표 삭제 + 채팅방 소켓에서 내보내기 */
async function cleanupDepartedMember(clubId, userId) {
  await dbRun(
    `DELETE FROM rsvps WHERE user_id = ? AND schedule_id IN
       (SELECT id FROM schedules WHERE club_id = ? AND start_at > datetime('now', 'localtime'))`,
    [userId, clubId]
  );
  const sockets = await io.in(chatRoomName(clubId)).fetchSockets();
  sockets.filter((sk) => sk.user?.id === userId).forEach((sk) => sk.leave(chatRoomName(clubId)));
}

/**
 * PUT /api/schedules/:scheduleId  (방장·운영진)
 * Body: 일정 생성과 동일 { title, start_at, end_at?, venue_id?, capacity?, fee?, rsvp_deadline?, description? }
 * 이미 시작한 일정은 수정 불가. 정원은 현재 참석 인원보다 적게 줄일 수 없다.
 * 200 → { message, schedule }
 */
app.put('/api/schedules/:scheduleId', authMiddleware, async (req, res) => {
  const ctx = await getScheduleManageContext(req.params.scheduleId, req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
  if (ctx.schedule.is_started === 1) return res.status(409).json({ error: '이미 시작했거나 지난 일정은 수정할 수 없습니다.' });

  const parsed = await validateScheduleInput(req.body, ctx.club);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.data;

  if (d.capacity != null) {
    const { cnt } = await dbGet("SELECT COUNT(*) AS cnt FROM rsvps WHERE schedule_id = ? AND response = 'attend'", [
      ctx.schedule.id,
    ]);
    if (d.capacity < cnt) {
      return res.status(400).json({ error: `이미 ${cnt}명이 참석으로 투표했어요. 정원을 ${cnt}명 이상으로 설정해 주세요.` });
    }
  }

  await dbRun(
    `UPDATE schedules SET title = ?, description = ?, start_at = ?, end_at = ?, venue_id = ?,
                          capacity = ?, fee = ?, rsvp_deadline = ?
     WHERE id = ?`,
    [d.title, d.description, d.startAt, d.endAt, d.venueId, d.capacity, d.fee, d.deadline, ctx.schedule.id]
  );
  return res.json({ message: '일정을 수정했습니다.', schedule: await getScheduleDetail(ctx.schedule.id, req.user.id) });
});

/**
 * DELETE /api/schedules/:scheduleId  (방장·운영진) — 참석 투표(rsvps)도 함께 삭제
 */
app.delete('/api/schedules/:scheduleId', authMiddleware, async (req, res) => {
  const ctx = await getScheduleManageContext(req.params.scheduleId, req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
  // FK CASCADE 가 꺼져 있어도 남지 않도록 명시적으로 지운다
  await dbRun('DELETE FROM rsvps WHERE schedule_id = ?', [ctx.schedule.id]);
  await dbRun('DELETE FROM schedules WHERE id = ?', [ctx.schedule.id]);
  return res.json({ message: `'${ctx.schedule.title}' 일정을 삭제했습니다.` });
});

/** 회원 관리 대상(승인된 회원) 조회 */
async function getApprovedMember(clubId, userId) {
  return dbGet(
    `SELECT m.id, m.user_id, m.role, u.nickname
     FROM club_members m JOIN users u ON u.id = m.user_id
     WHERE m.club_id = ? AND m.user_id = ? AND m.status = 'approved'`,
    [clubId, userId]
  );
}

/**
 * PUT /api/clubs/:clubId/members/:userId/role  (방장만)
 * Body: { role: 'manager' | 'member' }  — 운영진 지정/해제
 */
app.put('/api/clubs/:clubId/members/:userId/role', authMiddleware, async (req, res) => {
  const ctx = await getManageContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
  if (ctx.myRole !== 'owner') return res.status(403).json({ error: '운영진 지정·해제는 방장만 할 수 있습니다.' });

  const targetId = idParamPlain(req.params.userId);
  const role = req.body?.role;
  if (!targetId) return res.status(400).json({ error: '잘못된 회원 ID입니다.' });
  if (!['manager', 'member'].includes(role)) {
    return res.status(400).json({ error: "role은 'manager' 또는 'member'만 가능합니다." });
  }
  const target = await getApprovedMember(ctx.club.id, targetId);
  if (!target) return res.status(404).json({ error: '동호회 회원을 찾을 수 없습니다.' });
  if (target.role === 'owner' || targetId === ctx.club.owner_id) {
    return res.status(400).json({ error: '방장의 역할은 바꿀 수 없습니다.' });
  }
  if (target.role === role) {
    return res.json({ message: '이미 같은 역할입니다.', member: { user_id: targetId, role, role_label: ROLE_LABEL[role] } });
  }

  await dbRun('UPDATE club_members SET role = ? WHERE id = ?', [role, target.id]);
  return res.json({
    message: role === 'manager' ? `${target.nickname}님을 운영진으로 지정했습니다.` : `${target.nickname}님의 운영진 권한을 해제했습니다.`,
    member: { user_id: targetId, role, role_label: ROLE_LABEL[role] },
  });
});

/**
 * DELETE /api/clubs/:clubId/members/:userId  (방장·운영진) — 회원 내보내기
 * - 방장: 방장을 제외한 모든 회원
 * - 운영진: 일반 회원(member)만
 * 내보낸 회원은 status='rejected' 가 되어 다시 가입 신청할 수 없다.
 */
app.delete('/api/clubs/:clubId/members/:userId', authMiddleware, async (req, res) => {
  const ctx = await getManageContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const targetId = idParamPlain(req.params.userId);
  if (!targetId) return res.status(400).json({ error: '잘못된 회원 ID입니다.' });
  if (targetId === req.user.id) return res.status(400).json({ error: '본인은 내보낼 수 없어요. 탈퇴 기능을 이용해 주세요.' });

  const target = await getApprovedMember(ctx.club.id, targetId);
  if (!target) return res.status(404).json({ error: '동호회 회원을 찾을 수 없습니다.' });
  if (target.role === 'owner' || targetId === ctx.club.owner_id) {
    return res.status(403).json({ error: '방장은 내보낼 수 없습니다.' });
  }
  if (ctx.myRole === 'manager' && target.role !== 'member') {
    return res.status(403).json({ error: '운영진은 일반 회원만 내보낼 수 있습니다.' });
  }

  await dbRun("UPDATE club_members SET status = 'rejected', role = 'member', joined_at = NULL WHERE id = ?", [target.id]);
  await cleanupDepartedMember(ctx.club.id, targetId);
  return res.json({ message: `${target.nickname}님을 동호회에서 내보냈습니다.` });
});

/**
 * PUT /api/clubs/:clubId  (방장·운영진) — 동호회 이름 / 한 줄 소개 수정
 * Body: { name?, description? }
 */
app.put('/api/clubs/:clubId', authMiddleware, async (req, res) => {
  const ctx = await getManageContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const name = has('name') ? String(b.name || '').trim() : ctx.club.name;
  const description = has('description') ? String(b.description || '').trim() : ctx.club.description;
  if (!has('name') && !has('description')) return res.status(400).json({ error: '수정할 내용이 없습니다.' });
  if (name.length < 2 || name.length > 30) return res.status(400).json({ error: '동호회 이름은 2~30자로 입력해 주세요.' });
  if (!description || description.length > 60) return res.status(400).json({ error: '한 줄 소개는 1~60자로 입력해 주세요.' });

  const dup = await dbGet('SELECT id FROM clubs WHERE venue_id = ? AND name = ? AND id <> ?', [
    ctx.club.venue_id,
    name,
    ctx.club.id,
  ]);
  if (dup) return res.status(409).json({ error: '같은 장소에 같은 이름의 동호회가 이미 있어요.' });

  await dbRun('UPDATE clubs SET name = ?, description = ? WHERE id = ?', [name, description, ctx.club.id]);
  return res.json({ message: '동호회 정보를 수정했습니다.', club: { id: ctx.club.id, name, description } });
});

/**
 * DELETE /api/clubs/:clubId/leave  (승인된 회원 본인) — 동호회 탈퇴
 * 방장은 탈퇴할 수 없다. 탈퇴한 회원은 status='left' 가 되며 나중에 다시 가입 신청할 수 있다.
 */
app.delete('/api/clubs/:clubId/leave', authMiddleware, async (req, res) => {
  const ctx = await getMemberContext(Number(req.params.clubId), req.user.id);
  if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
  if (ctx.myRole === 'owner') {
    return res.status(409).json({
      error: '방장은 동호회를 탈퇴할 수 없어요. 동호회를 정리하려면 서비스 관리자에게 문의해 주세요.',
    });
  }
  await dbRun(
    "UPDATE club_members SET status = 'left', role = 'member', joined_at = NULL WHERE club_id = ? AND user_id = ?",
    [ctx.club.id, req.user.id]
  );
  await cleanupDepartedMember(ctx.club.id, req.user.id);
  return res.json({ message: `'${ctx.club.name}'에서 탈퇴했습니다.` });
});

/* ------------------------------------------------------------------ */
/* 최고 관리자 백오피스 API — /api/admin/* 전부 authMiddleware + adminMiddleware */
/* ------------------------------------------------------------------ */

const adminRouter = express.Router();
adminRouter.use(authMiddleware, createAdminMiddleware(dbGet));
app.use('/api/admin', adminRouter);

const VENUE_STATUSES = ['pending', 'approved', 'rejected'];
const idParam = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const likeParam = (q) => `%${String(q).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * GET /api/admin/stats
 * 200 → { users, clubs, venues: { total, approved, pending, rejected } }
 */
adminRouter.get('/stats', async (req, res) => {
  const row = await dbGet(`
    SELECT (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM clubs) AS clubs,
           (SELECT COUNT(*) FROM venues) AS venues_total,
           (SELECT COUNT(*) FROM venues WHERE status = 'approved') AS venues_approved,
           (SELECT COUNT(*) FROM venues WHERE status = 'pending') AS venues_pending,
           (SELECT COUNT(*) FROM venues WHERE status = 'rejected') AS venues_rejected`);
  return res.json({
    users: row.users,
    clubs: row.clubs,
    venues: {
      total: row.venues_total,
      approved: row.venues_approved,
      pending: row.venues_pending,
      rejected: row.venues_rejected,
    },
  });
});

const ADMIN_VENUE_SELECT = `
  SELECT v.id, v.name, v.sport, v.address, v.lat, v.lng, v.phone, v.description, v.image_url,
         v.status, v.created_at,
         u.id AS submitter_id, u.nickname AS submitter_nickname, u.email AS submitter_email,
         (SELECT COUNT(*) FROM clubs c WHERE c.venue_id = v.id) AS club_count
  FROM venues v LEFT JOIN users u ON u.id = v.submitted_by`;

const adminVenueDto = (v) => ({
  id: v.id,
  name: v.name,
  sport: v.sport,
  address: v.address,
  lat: v.lat,
  lng: v.lng,
  phone: v.phone,
  description: v.description,
  image_url: v.image_url,
  status: v.status,
  club_count: v.club_count,
  submitted_by: v.submitter_id ? { id: v.submitter_id, nickname: v.submitter_nickname, email: v.submitter_email } : null,
  created_at: v.created_at,
});

/**
 * GET /api/admin/venues?status=pending|approved|rejected|all&q=검색어&limit=
 * 승인 대기는 오래된 순(먼저 들어온 제보부터 검수), 나머지는 최신 순
 * 200 → { venues: [...], counts: { pending, approved, rejected, all } }
 */
adminRouter.get('/venues', async (req, res) => {
  const status = req.query.status || 'all';
  if (status !== 'all' && !VENUE_STATUSES.includes(status)) {
    return res.status(400).json({ error: "status는 pending, approved, rejected, all 중 하나여야 합니다." });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 500);
  const where = [];
  const params = [];
  if (status !== 'all') {
    where.push('v.status = ?');
    params.push(status);
  }
  if (req.query.q) {
    where.push("(v.name LIKE ? ESCAPE '\\' OR v.address LIKE ? ESCAPE '\\')");
    params.push(likeParam(req.query.q), likeParam(req.query.q));
  }
  const rows = await dbAll(
    `${ADMIN_VENUE_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${status === 'pending' ? 'v.created_at ASC, v.id ASC' : 'v.created_at DESC, v.id DESC'}
     LIMIT ?`,
    [...params, limit]
  );
  const c = await dbGet(`
    SELECT SUM(status = 'pending') AS pending, SUM(status = 'approved') AS approved,
           SUM(status = 'rejected') AS rejected, COUNT(*) AS total FROM venues`);
  return res.json({
    venues: rows.map(adminVenueDto),
    counts: { pending: c.pending || 0, approved: c.approved || 0, rejected: c.rejected || 0, all: c.total || 0 },
  });
});

/**
 * GET /api/admin/venues/:id — 상세 + 이 장소의 동호회 목록 (검수 패널용)
 */
adminRouter.get('/venues/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 장소 ID입니다.' });
  const v = await dbGet(`${ADMIN_VENUE_SELECT} WHERE v.id = ?`, [id]);
  if (!v) return res.status(404).json({ error: '장소를 찾을 수 없습니다.' });
  const clubs = await dbAll(
    `SELECT c.id, c.name, c.recruit_status, c.created_at, u.nickname AS owner_nickname,
            (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.status = 'approved') AS member_count
     FROM clubs c JOIN users u ON u.id = c.owner_id WHERE c.venue_id = ? ORDER BY c.id`,
    [id]
  );
  return res.json({ venue: { ...adminVenueDto(v), clubs } });
});

/**
 * PUT /api/admin/venues/:id
 * Body (모두 선택): { name, sport, address, lat, lng, phone, description, status: 'approved'|'rejected'|'pending' }
 * 200 → { message, venue }
 */
adminRouter.put('/venues/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 장소 ID입니다.' });
  const current = await dbGet('SELECT * FROM venues WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: '장소를 찾을 수 없습니다.' });

  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const updates = {};

  // 기본 정보 수정: 보낸 필드만 기존 값에 덮어써서 parseNewVenue 와 같은 규칙으로 검증
  if (['name', 'sport', 'address', 'lat', 'lng', 'description'].some(has)) {
    const parsed = await parseNewVenue({
      name: has('name') ? b.name : current.name,
      sport: has('sport') ? b.sport : current.sport,
      address: has('address') ? b.address : current.address,
      lat: has('lat') ? b.lat : current.lat,
      lng: has('lng') ? b.lng : current.lng,
      description: has('description') ? b.description : current.description,
    }, { allowInactive: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    Object.assign(updates, parsed.data);
  }
  if (has('phone')) {
    const phone = b.phone ? String(b.phone).trim() : null;
    if (phone && phone.length > 20) return res.status(400).json({ error: '전화번호는 20자 이내로 입력해 주세요.' });
    updates.phone = phone;
  }
  if (has('status')) {
    if (!VENUE_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: "status는 approved, rejected, pending 중 하나여야 합니다." });
    }
    updates.status = b.status;
  }
  const keys = Object.keys(updates);
  if (keys.length === 0) return res.status(400).json({ error: '수정할 내용이 없습니다.' });

  await dbRun(`UPDATE venues SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [
    ...keys.map((k) => updates[k]),
    id,
  ]);
  const v = await dbGet(`${ADMIN_VENUE_SELECT} WHERE v.id = ?`, [id]);
  const STATUS_MSG = { approved: '장소를 승인했습니다.', rejected: '장소를 반려했습니다.', pending: '승인 대기로 되돌렸습니다.' };
  return res.json({
    message: keys.length === 1 && updates.status ? STATUS_MSG[updates.status] : '장소 정보를 저장했습니다.',
    venue: adminVenueDto(v),
  });
});

/**
 * DELETE /api/admin/venues/:id?force=true
 * 이 장소를 쓰는 동호회가 있으면 409 (동호회까지 CASCADE 삭제되므로). force=true 면 함께 삭제.
 */
adminRouter.delete('/venues/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 장소 ID입니다.' });
  const v = await dbGet(`${ADMIN_VENUE_SELECT} WHERE v.id = ?`, [id]);
  if (!v) return res.status(404).json({ error: '장소를 찾을 수 없습니다.' });
  if (v.club_count > 0 && req.query.force !== 'true') {
    return res.status(409).json({
      error: `이 장소에 동호회 ${v.club_count}개가 있어요. 삭제하면 동호회와 일정·채팅까지 모두 함께 삭제됩니다.`,
      club_count: v.club_count,
    });
  }
  await dbRun('DELETE FROM venues WHERE id = ?', [id]);
  return res.json({ message: `'${v.name}' 장소를 삭제했습니다.`, deleted_clubs: v.club_count });
});

/**
 * GET /api/admin/clubs?q=
 * 200 → { clubs: [{ id, name, venue: { id, name, status }, member_count, pending_count, owner, ... }] }
 */
adminRouter.get('/clubs', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.q) {
    where = "WHERE c.name LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\'";
    params.push(likeParam(req.query.q), likeParam(req.query.q), likeParam(req.query.q));
  }
  const rows = await dbAll(
    `SELECT c.id, c.name, c.description, c.recruit_status, c.is_public, c.max_members, c.created_at,
            v.id AS venue_id, v.name AS venue_name, v.sport, v.status AS venue_status,
            u.id AS owner_id, u.nickname AS owner_nickname, u.email AS owner_email,
            (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.status = 'approved') AS member_count,
            (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.status = 'pending') AS pending_count,
            (SELECT COUNT(*) FROM schedules s WHERE s.club_id = c.id) AS schedule_count
     FROM clubs c
     JOIN venues v ON v.id = c.venue_id
     JOIN users u ON u.id = c.owner_id
     ${where}
     ORDER BY c.created_at DESC, c.id DESC`,
    params
  );
  return res.json({
    clubs: rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      recruit_status: c.recruit_status,
      is_public: c.is_public === 1,
      max_members: c.max_members,
      member_count: c.member_count,
      pending_count: c.pending_count,
      schedule_count: c.schedule_count,
      venue: { id: c.venue_id, name: c.venue_name, sport: c.sport, status: c.venue_status },
      owner: { id: c.owner_id, nickname: c.owner_nickname, email: c.owner_email },
      created_at: c.created_at,
    })),
  });
});

/**
 * DELETE /api/admin/clubs/:id — 회원·일정·투표·채팅방까지 CASCADE 삭제
 */
adminRouter.delete('/clubs/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 동호회 ID입니다.' });
  const club = await dbGet('SELECT id, name FROM clubs WHERE id = ?', [id]);
  if (!club) return res.status(404).json({ error: '동호회를 찾을 수 없습니다.' });
  await dbRun('DELETE FROM clubs WHERE id = ?', [id]);
  // 채팅방에 접속해 있던 소켓들을 방에서 내보낸다
  io.in(chatRoomName(id)).socketsLeave(chatRoomName(id));
  return res.json({ message: `'${club.name}' 동호회를 삭제했습니다.` });
});

/**
 * GET /api/admin/users?q=
 * 200 → { users: [{ id, nickname, email, created_at, is_admin, club_count, owned_club_count }] }
 */
adminRouter.get('/users', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.q) {
    where = "WHERE u.nickname LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\'";
    params.push(likeParam(req.query.q), likeParam(req.query.q));
  }
  const rows = await dbAll(
    `SELECT u.id, u.nickname, u.email, u.created_at, u.is_admin,
            (SELECT COUNT(*) FROM club_members m WHERE m.user_id = u.id AND m.status = 'approved') AS club_count,
            (SELECT COUNT(*) FROM clubs c WHERE c.owner_id = u.id) AS owned_club_count
     FROM users u ${where}
     ORDER BY u.created_at DESC, u.id DESC`,
    params
  );
  return res.json({ users: rows.map((u) => ({ ...u, is_admin: u.is_admin === 1 })) });
});

/**
 * PUT /api/admin/users/:id/admin  Body: { is_admin: true|false }
 * 본인의 권한은 해제할 수 없고, 마지막 남은 관리자도 해제할 수 없다 (관리자 0명 방지).
 */
adminRouter.put('/users/:id/admin', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 회원 ID입니다.' });
  if (typeof req.body?.is_admin !== 'boolean') {
    return res.status(400).json({ error: 'is_admin 값(true/false)을 보내 주세요.' });
  }
  const target = await dbGet('SELECT id, nickname, is_admin FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });

  const next = req.body.is_admin ? 1 : 0;
  if (!next && id === req.user.id) {
    return res.status(400).json({ error: '본인의 관리자 권한은 해제할 수 없습니다.' });
  }
  if (!next && target.is_admin === 1) {
    const { cnt } = await dbGet('SELECT COUNT(*) AS cnt FROM users WHERE is_admin = 1');
    if (cnt <= 1) return res.status(409).json({ error: '마지막 관리자의 권한은 해제할 수 없습니다.' });
  }
  await dbRun('UPDATE users SET is_admin = ? WHERE id = ?', [next, id]);
  return res.json({
    message: next ? `${target.nickname}님에게 관리자 권한을 부여했습니다.` : `${target.nickname}님의 관리자 권한을 해제했습니다.`,
    user: { id, is_admin: next === 1 },
  });
});

/* ---------- 관리자: 종목 관리 ---------- */

const SPORT_NAME_MAX = 20;

/** 종목 입력 검증 (보낸 필드만). 반환: { data } | { error } */
function parseSportInput(b, { requireAll = false } = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(b || {}, k);
  const data = {};
  if (requireAll || has('name')) {
    const name = String(b?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > SPORT_NAME_MAX) return { error: `종목명은 1~${SPORT_NAME_MAX}자로 입력해 주세요.` };
    data.name = name;
  }
  if (requireAll || has('icon')) {
    const icon = String(b?.icon ?? '').trim();
    // 이모지 1개(결합 문자 포함)를 넉넉히 허용
    if (!icon || [...icon].length > 8) return { error: '아이콘은 이모지 1개로 입력해 주세요.' };
    data.icon = icon;
  }
  if (has('sort_order') && b.sort_order !== '' && b.sort_order != null) {
    const n = Number(b.sort_order);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: '순서는 0 이상의 정수로 입력해 주세요.' };
    data.sort_order = n;
  }
  if (has('is_active')) {
    if (typeof b.is_active !== 'boolean') return { error: 'is_active 는 true/false 로 보내 주세요.' };
    data.is_active = b.is_active ? 1 : 0;
  }
  return { data };
}

const ADMIN_SPORT_SELECT = `
  SELECT s.id, s.name, s.icon, s.sort_order, s.is_active, s.created_at,
         (SELECT COUNT(*) FROM venues v WHERE v.sport = s.name) AS venue_count,
         (SELECT COUNT(*) FROM venues v WHERE v.sport = s.name AND v.status = 'approved') AS approved_venue_count
  FROM sports s`;
const adminSportDto = (r) => ({ ...r, is_active: r.is_active === 1 });

/** GET /api/admin/sports — 비활성 포함 전체 + 등록된 장소 수 */
adminRouter.get('/sports', async (req, res) => {
  const rows = await dbAll(`${ADMIN_SPORT_SELECT} ORDER BY s.sort_order ASC, s.id ASC`);
  return res.json({ sports: rows.map(adminSportDto) });
});

/** POST /api/admin/sports  Body: { name, icon, sort_order? } — 순서를 비우면 맨 뒤 */
adminRouter.post('/sports', async (req, res) => {
  const parsed = parseSportInput(req.body, { requireAll: true });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.data;
  if (await dbGet('SELECT id FROM sports WHERE name = ?', [d.name])) {
    return res.status(409).json({ error: `'${d.name}' 종목이 이미 있어요.` });
  }
  if (d.sort_order == null) {
    d.sort_order = ((await dbGet('SELECT MAX(sort_order) AS m FROM sports')).m || 0) + 10;
  }
  const { lastID } = await dbRun('INSERT INTO sports (name, icon, sort_order, is_active) VALUES (?, ?, ?, ?)', [
    d.name,
    d.icon,
    d.sort_order,
    d.is_active ?? 1,
  ]);
  const row = await dbGet(`${ADMIN_SPORT_SELECT} WHERE s.id = ?`, [lastID]);
  return res.status(201).json({ message: `'${d.name}' 종목을 추가했습니다.`, sport: adminSportDto(row) });
});

/**
 * PUT /api/admin/sports/:id  Body (모두 선택): { name, icon, sort_order, is_active }
 * 종목명이 바뀌면 venues.sport 도 같은 이름으로 함께 바꾼다.
 */
adminRouter.put('/sports/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 종목 ID입니다.' });
  const current = await dbGet('SELECT * FROM sports WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: '종목을 찾을 수 없습니다.' });

  const parsed = parseSportInput(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.data;
  const keys = Object.keys(d);
  if (keys.length === 0) return res.status(400).json({ error: '수정할 내용이 없습니다.' });

  const renamed = d.name !== undefined && d.name !== current.name;
  if (renamed && (await dbGet('SELECT id FROM sports WHERE name = ? AND id <> ?', [d.name, id]))) {
    return res.status(409).json({ error: `'${d.name}' 종목이 이미 있어요.` });
  }

  let syncedVenues = 0;
  await dbRun('BEGIN IMMEDIATE');
  try {
    await dbRun(`UPDATE sports SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => d[k]), id]);
    if (renamed) {
      syncedVenues = (await dbRun('UPDATE venues SET sport = ? WHERE sport = ?', [d.name, current.name])).changes;
    }
    await dbRun('COMMIT');
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => {});
    throw err;
  }

  const row = await dbGet(`${ADMIN_SPORT_SELECT} WHERE s.id = ?`, [id]);
  let message = '종목을 수정했습니다.';
  if (keys.length === 1 && d.is_active !== undefined) message = d.is_active ? '종목을 활성화했습니다.' : '종목을 비활성화했습니다.';
  if (renamed) message += ` (장소 ${syncedVenues}곳의 종목명도 '${d.name}'(으)로 바뀌었어요)`;
  return res.json({ message, sport: adminSportDto(row), synced_venues: syncedVenues });
});

/** DELETE /api/admin/sports/:id — 이 종목을 쓰는 장소가 1곳이라도 있으면 409 (비활성화 안내) */
adminRouter.delete('/sports/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 종목 ID입니다.' });
  const row = await dbGet(`${ADMIN_SPORT_SELECT} WHERE s.id = ?`, [id]);
  if (!row) return res.status(404).json({ error: '종목을 찾을 수 없습니다.' });
  if (row.venue_count > 0) {
    return res.status(409).json({
      error: `'${row.name}' 종목을 쓰는 장소가 ${row.venue_count}곳 있어 삭제할 수 없어요. 대신 비활성화하면 새 장소 등록과 필터에서 숨겨집니다.`,
      venue_count: row.venue_count,
      can_deactivate: row.is_active === 1,
    });
  }
  await dbRun('DELETE FROM sports WHERE id = ?', [id]);
  return res.json({ message: `'${row.name}' 종목을 삭제했습니다.` });
});

/* ------------------------------------------------------------------ */
/* 공통 에러 처리                                                      */
/* ------------------------------------------------------------------ */

app.use((req, res) => {
  res.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' });
});

// Express 5는 async 핸들러에서 던진 에러를 이곳으로 전달한다
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 본문(JSON) 형식이 올바르지 않습니다.' });
  }
  console.error(err);
  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

/* ------------------------------------------------------------------ */
/* Socket.io 실시간 채팅                                                */
/* ------------------------------------------------------------------ */
//  클라이언트 → 서버
//    chat:join  { clubId }                        → ack { ok, roomId } | { ok:false, error }
//    chat:send  { clubId, content, clientId }     → ack { ok, message } | { ok:false, error }
//    chat:leave { clubId }
//  서버 → 클라이언트
//    chat:message  { ...message, client_id }      (같은 방 모두에게, 보낸 사람 포함)

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: '*' } });

// 연결 시 JWT 검증: 로그인한 사용자만 소켓 연결 가능
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  try {
    const payload = jwt.verify(String(token || ''), JWT_SECRET);
    socket.user = { id: payload.userId, nickname: payload.nickname };
    return next();
  } catch {
    return next(new Error('UNAUTHORIZED'));
  }
});

io.on('connection', (socket) => {
  // 도배 방지: 10초에 최대 20개
  const sentAt = [];
  const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

  socket.on('chat:join', async (payload, ack) => {
    try {
      const clubId = Number(payload?.clubId);
      const ctx = await getMemberContext(clubId, socket.user.id);
      if (ctx.error) return reply(ack, { ok: false, error: ctx.error, status: ctx.status });
      const roomId = await getClubRoomId(clubId);
      socket.join(chatRoomName(clubId));
      return reply(ack, { ok: true, roomId });
    } catch (err) {
      console.error(err);
      return reply(ack, { ok: false, error: '채팅방에 입장하지 못했습니다.' });
    }
  });

  socket.on('chat:leave', (payload) => {
    socket.leave(chatRoomName(Number(payload?.clubId)));
  });

  socket.on('chat:send', async (payload, ack) => {
    try {
      const clubId = Number(payload?.clubId);
      const content = String(payload?.content ?? '').trim();
      const clientId = payload?.clientId ? String(payload.clientId).slice(0, 64) : null;

      if (!socket.rooms.has(chatRoomName(clubId))) {
        return reply(ack, { ok: false, error: '채팅방에 먼저 입장해 주세요.' });
      }
      if (!content) return reply(ack, { ok: false, error: '메시지를 입력해 주세요.' });
      if (content.length > MESSAGE_MAX_LENGTH) {
        return reply(ack, { ok: false, error: `메시지는 ${MESSAGE_MAX_LENGTH}자까지 보낼 수 있습니다.` });
      }
      const now = Date.now();
      while (sentAt.length && now - sentAt[0] > 10000) sentAt.shift();
      if (sentAt.length >= 20) return reply(ack, { ok: false, error: '메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 시도해 주세요.' });
      sentAt.push(now);

      // 입장 후 탈퇴·강퇴됐을 수 있으니 보낼 때마다 다시 확인
      const ctx = await getMemberContext(clubId, socket.user.id);
      if (ctx.error) {
        socket.leave(chatRoomName(clubId));
        return reply(ack, { ok: false, error: ctx.error, status: ctx.status });
      }

      const roomId = await getClubRoomId(clubId);
      const { lastID } = await dbRun(
        "INSERT INTO messages (room_id, sender_id, content, type, created_at) VALUES (?, ?, ?, 'text', datetime('now', 'localtime'))",
        [roomId, socket.user.id, content]
      );
      const message = messageDto(await dbGet(`${MESSAGE_SELECT} WHERE m.id = ?`, [lastID]));
      io.to(chatRoomName(clubId)).emit('chat:message', { ...message, client_id: clientId });
      return reply(ack, { ok: true, message });
    } catch (err) {
      console.error(err);
      return reply(ack, { ok: false, error: '메시지를 보내지 못했습니다.' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 WhereToPlay API 서버 실행 중: http://localhost:${PORT}`);
  console.log('💬 Socket.io 실시간 채팅 활성화');
});
