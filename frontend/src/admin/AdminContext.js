import { createContext, useContext } from 'react';

/** 관리자 화면 공통: 사이드바 뱃지용 통계 + 갱신 함수 */
export const AdminContext = createContext({ stats: null, refreshStats: () => {} });
export const useAdmin = () => useContext(AdminContext);
