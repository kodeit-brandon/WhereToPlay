import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout, { FormError, SubmitButton, TextField } from '../components/AuthLayout';
import { errorMessage, loginRequest } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, login } = useAuth();
  // 다른 화면(예: 동호회 가입 버튼)에서 보내졌다면 로그인 후 그 화면으로 돌려보낸다. 기본은 메인
  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//') ? location.state.from : '/';
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 처음 들어올 때 이미 로그인된 상태면 마이페이지로.
  // (방금 로그인/가입에 성공한 경우엔 아래 handler가 메인으로 보내므로 최초 값만 본다)
  const [wasLoggedIn] = useState(isLoggedIn);
  if (wasLoggedIn) return <Navigate to="/my" replace />;

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) {
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { token, user } = await loginRequest({ email: form.email.trim(), password: form.password });
      login(token, user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, '로그인에 실패했어요.'));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      emoji="🏸"
      title={'다시 만나서 반가워요!\n같이 운동하러 가볼까요?'}
      subtitle="이메일로 로그인해 주세요."
      footer={
        <>
          아직 회원이 아니신가요?{' '}
          <Link to="/register" state={location.state} className="font-bold text-mint-600">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          id="email"
          name="email"
          type="email"
          label="이메일"
          placeholder="example@email.com"
          autoComplete="email"
          value={form.email}
          onChange={onChange}
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="비밀번호"
          placeholder="비밀번호를 입력해 주세요"
          autoComplete="current-password"
          value={form.password}
          onChange={onChange}
        />
        <FormError message={error} />
        <div className="pt-2">
          <SubmitButton loading={loading}>로그인</SubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
