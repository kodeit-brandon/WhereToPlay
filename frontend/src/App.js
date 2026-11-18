import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import Home from './pages/Home';
import VenueDetail from './pages/VenueDetail';
import Explore from './pages/Explore';
import Login from './pages/Login';
import Register from './pages/Register';
import MyPage from './pages/MyPage';
import MySchedules from './pages/MySchedules';
import MyClubs from './pages/MyClubs';
import ClubManage from './pages/ClubManage';
import ClubDetail from './pages/ClubDetail';
import ScheduleForm from './pages/ScheduleForm';
import ClubChat from './pages/ClubChat';
import ClubCreate from './pages/ClubCreate';
import RequireAuth from './components/RequireAuth';
import RequireAdmin from './components/RequireAdmin';
import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import AdminVenues from './admin/AdminVenues';
import AdminClubs from './admin/AdminClubs';
import AdminUsers from './admin/AdminUsers';
import AdminSports from './admin/AdminSports';
import ScrollToTop from './components/ScrollToTop';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/venues/:id" element={<VenueDetail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/my" element={<MyPage />} />
      <Route
        path="/my/schedules"
        element={
          <RequireAuth>
            <MySchedules />
          </RequireAuth>
        }
      />
      <Route
        path="/my-clubs"
        element={
          <RequireAuth>
            <MyClubs />
          </RequireAuth>
        }
      />
      <Route
        path="/clubs/new"
        element={
          <RequireAuth>
            <ClubCreate />
          </RequireAuth>
        }
      />
      <Route
        path="/clubs/:clubId"
        element={
          <RequireAuth>
            <ClubDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/clubs/:clubId/schedules/new"
        element={
          <RequireAuth>
            <ScheduleForm />
          </RequireAuth>
        }
      />
      <Route
        path="/clubs/:clubId/schedules/:scheduleId/edit"
        element={
          <RequireAuth>
            <ScheduleForm />
          </RequireAuth>
        }
      />
      <Route
        path="/clubs/:clubId/chat"
        element={
          <RequireAuth>
            <ClubChat />
          </RequireAuth>
        }
      />
      <Route
        path="/clubs/:clubId/manage"
        element={
          <RequireAuth>
            <ClubManage />
          </RequireAuth>
        }
      />

      {/* 최고 관리자 백오피스 (PC 전체 화면 레이아웃) */}
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="venues" element={<AdminVenues />} />
        <Route path="clubs" element={<AdminClubs />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="sports" element={<AdminSports />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
