import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * 최고 관리자만 통과. (화면 차단용이며, 실제 보안은 서버의 adminMiddleware 가 담당)
 * - 비로그인 → 로그인 화면 (로그인 후 돌아오기)
 * - 로그인했지만 관리자가 아님 → 메인으로
 */
export default function RequireAdmin({ children }) {
  const { isLoggedIn, isAdmin, profileChecked } = useAuth();
  const location = useLocation();
  const alerted = useRef(false);
  const denied = isLoggedIn && profileChecked && !isAdmin;

  useEffect(() => {
    if (denied && !alerted.current) {
      alerted.current = true;
      window.alert('최고 관리자만 접근할 수 있는 페이지예요.');
    }
  }, [denied]);

  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // 저장된 프로필이 예전 것일 수 있으니 서버 확인이 끝날 때까지 대기
  if (!profileChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400">권한 확인 중…</div>
    );
  }
  if (denied) return <Navigate to="/" replace />;
  return children;
}
