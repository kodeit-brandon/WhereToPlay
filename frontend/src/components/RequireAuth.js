import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** 로그인이 필요한 화면 보호: 비로그인이면 로그인 화면으로 보내고, 로그인 후 다시 돌아오게 한다 */
export default function RequireAuth({ children }) {
  const { isLoggedIn } = useAuth();
  const location = useLocation();
  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
