import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout, { FormError, SubmitButton, TextField } from '../components/AuthLayout';
import { errorMessage, registerRequest } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 백엔드 검증 규칙과 동일하게 맞춘다 (server.js 참고)
function validate(form) {
  const errors = {};
  if (!EMAIL_RE.test(form.email.trim())) errors.email = '올바른 이메일 형식이 아니에요.';
  const nickname = form.nickname.trim();
  if (!nickname || nickname.length > 20) errors.nickname = '닉네임은 1~20자로 입력해 주세요.';
  if (form.password.length < 8) errors.password = '비밀번호는 8자 이상이어야 해요.';
  if (form.passwordConfirm !== form.password) errors.passwordConfirm = '비밀번호가 일치하지 않아요.';
  return errors;
}

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, login } = useAuth();
  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//') ? location.state.from : '/';
  const [form, setForm] = useState({ email: '', nickname: '', password: '', passwordConfirm: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  // 처음 들어올 때 이미 로그인된 상태면 마이페이지로.
  // (방금 로그인/가입에 성공한 경우엔 아래 handler가 메인으로 보내므로 최초 값만 본다)
  const [wasLoggedIn] = useState(isLoggedIn);
  if (wasLoggedIn) return <Navigate to="/my" replace />;

  const onChange = (e) => {
    const next = { ...form, [e.target.name]: e.target.value };
    setForm(next);
    // 한 번 제출을 시도한 뒤에는 입력할 때마다 바로 검증 결과를 갱신
    if (submitted) setErrors(validate(next));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setServerError('');
    setLoading(true);
    try {
      // 회원가입 API가 토큰까지 돌려주므로 가입과 동시에 로그인 처리
      const { token, user } = await registerRequest({
        email: form.email.trim(),
        password: form.password,
        nickname: form.nickname.trim(),
        phone: form.phone.trim() || undefined,
      });
      login(token, user);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(errorMessage(err, '회원가입에 실패했어요.'));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      emoji="🙌"
      title={'반가워요!\n우리 동네 운동 친구를 만나보세요'}
      subtitle="간단한 정보만 입력하면 바로 시작할 수 있어요."
      footer={
        <>
          이미 계정이 있으신가요?{' '}
          <Link to="/login" state={location.state} className="font-bold text-mint-600">
            로그인
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
          error={errors.email}
        />
        <TextField
          id="nickname"
          name="nickname"
          label="닉네임"
          placeholder="동호회에서 불릴 이름"
          autoComplete="nickname"
          maxLength={20}
          value={form.nickname}
          onChange={onChange}
          error={errors.nickname}
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="비밀번호"
          placeholder="8자 이상"
          autoComplete="new-password"
          value={form.password}
          onChange={onChange}
          error={errors.password}
        />
        <TextField
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          label="비밀번호 확인"
          placeholder="비밀번호를 한 번 더 입력해 주세요"
          autoComplete="new-password"
          value={form.passwordConfirm}
          onChange={onChange}
          error={errors.passwordConfirm}
        />
        <TextField
          id="phone"
          name="phone"
          type="tel"
          label="휴대폰 번호 (선택)"
          placeholder="010-0000-0000"
          autoComplete="tel"
          value={form.phone}
          onChange={onChange}
        />
        <FormError message={serverError} />
        <div className="pt-2">
          <SubmitButton loading={loading}>가입하고 시작하기</SubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
