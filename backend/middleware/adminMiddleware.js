/**
 * 최고 관리자 전용 미들웨어 (authMiddleware 뒤에 사용)
 *
 * JWT 에는 관리자 여부를 넣지 않고, 매 요청마다 DB의 users.is_admin 을 다시 확인한다.
 * → 관리자 권한을 해제하면 이미 발급된 토큰으로도 즉시 접근이 막힌다.
 *
 * 사용 예)
 *   const adminRouter = express.Router();
 *   adminRouter.use(authMiddleware, createAdminMiddleware(dbGet));
 */
function createAdminMiddleware(dbGet) {
  return async function adminMiddleware(req, res, next) {
    try {
      const row = await dbGet('SELECT is_admin FROM users WHERE id = ?', [req.user?.id]);
      if (!row) return res.status(401).json({ error: '유효하지 않은 사용자입니다. 다시 로그인해 주세요.' });
      if (row.is_admin !== 1) return res.status(403).json({ error: '최고 관리자만 접근할 수 있습니다.' });
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = createAdminMiddleware;
