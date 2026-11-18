import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe } from '../api/auth';
import { clearAuth, getStoredUser, getToken, saveAuth } from './tokenStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken());
  // 새로고침 직후에도 화면이 바로 그려지도록 저장해 둔 프로필을 먼저 쓴다
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));
  // 이 토큰의 프로필을 서버에서 확인했는지 (저장된 프로필은 예전 것일 수 있음 — 예: is_admin 변경)
  const [verifiedToken, setVerifiedToken] = useState(null);

  const login = useCallback((newToken, newUser) => {
    saveAuth(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
    setVerifiedToken(newToken); // 로그인 응답의 프로필은 서버 최신값
  }, []);

  /** 프로필 수정 후 화면·저장소에 즉시 반영 (새 토큰이 오면 함께 교체) */
  const updateUser = useCallback(
    (nextUser, nextToken) => {
      const t = nextToken || token;
      saveAuth(t, nextUser);
      setUser(nextUser);
      if (nextToken && nextToken !== token) {
        setVerifiedToken(nextToken);
        setToken(nextToken);
      }
    },
    [token]
  );

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setUser(null);
  }, []);

  // 앱 시작 시 토큰이 아직 유효한지 서버에 확인하고 최신 프로필로 갱신
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetchMe(token)
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        saveAuth(token, me);
        setVerifiedToken(token);
      })
      .catch((err) => {
        if (cancelled) return;
        // 토큰이 거부되면(만료·위조·탈퇴) 로그아웃. 네트워크 오류는 저장된 정보로 유지
        if (err?.response?.status === 401) logout();
        else setVerifiedToken(token);
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const value = useMemo(
    () => ({
      token,
      user,
      isLoggedIn: Boolean(token),
      isAdmin: Boolean(token && user?.is_admin),
      profileChecked: !token || verifiedToken === token,
      login,
      logout,
      updateUser,
    }),
    [token, user, verifiedToken, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 <AuthProvider> 안에서만 사용할 수 있어요.');
  return ctx;
}
