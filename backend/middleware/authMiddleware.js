const jwt = require('jsonwebtoken');

/**
 * JWT 인증 미들웨어
 *
 * 요청 헤더의 `Authorization: Bearer <토큰>` 을 검증하고,
 * 성공하면 req.user = { id, email, nickname } 를 채운 뒤 다음으로 넘긴다.
 *
 * 사용 예)
 *   app.get('/api/me', authMiddleware, (req, res) => res.json(req.user));
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.userId, email: payload.email, nickname: payload.nickname };
    return next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
        : '유효하지 않은 토큰입니다.';
    return res.status(401).json({ error: message });
  }
}

/**
 * 선택적 인증 미들웨어
 *
 * 로그인하지 않아도 되는 API에서 "로그인했다면 내 정보도 같이" 보여주고 싶을 때 사용.
 * 토큰이 없거나 잘못됐으면 에러 없이 req.user = null 로 넘어간다.
 */
function optionalAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  req.user = null;
  if (scheme === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: payload.userId, email: payload.email, nickname: payload.nickname };
    } catch {
      // 무시하고 비로그인으로 처리
    }
  }
  next();
}

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuth;
