import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon } from './Icons';

/** 로그인/회원가입 공통 레이아웃: 연한 배경 + 뒤로가기 헤더 + 인사말 */
export default function AuthLayout({ title, subtitle, emoji, children, footer }) {
  const navigate = useNavigate();
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="mx-auto max-w-[480px] min-h-screen bg-gray-50 shadow-xl flex flex-col">
        <header className="flex items-center h-14 px-2">
          <button type="button" onClick={goBack} aria-label="뒤로가기" className="p-2 text-gray-800">
            <ChevronLeftIcon />
          </button>
        </header>

        <main className="flex-1 px-6 pb-10">
          <div className="pt-2 pb-8">
            <p className="text-5xl" aria-hidden>{emoji}</p>
            <h1 className="mt-4 text-2xl font-black text-gray-900 leading-snug whitespace-pre-line">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
          </div>
          {children}
        </main>

        {footer && <footer className="px-6 pb-10 text-center text-sm text-gray-500">{footer}</footer>}
      </div>
    </div>
  );
}

/** 둥근 입력 폼 */
export function TextField({ label, id, error, hint, ...inputProps }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-gray-700 mb-1.5 pl-1">
        {label}
      </label>
      <input
        id={id}
        className={`w-full px-4 py-3.5 rounded-2xl bg-white text-[15px] text-gray-900 placeholder-gray-300
          border-2 outline-none transition shadow-card
          ${error ? 'border-red-300 focus:border-red-400' : 'border-transparent focus:border-mint-500'}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        {...inputProps}
      />
      {(error || hint) && (
        <p id={`${id}-msg`} className={`mt-1.5 pl-1 text-xs ${error ? 'text-red-500' : 'text-gray-400'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

/** 민트색 큰 버튼 */
export function SubmitButton({ loading, children, ...props }) {
  return (
    <button
      type="submit"
      disabled={loading || props.disabled}
      className="w-full h-14 rounded-2xl bg-mint-500 text-white text-base font-black shadow-md
                 transition active:scale-[0.98] hover:bg-mint-600
                 disabled:bg-gray-300 disabled:shadow-none disabled:active:scale-100"
      {...props}
    >
      {loading ? '잠시만요…' : children}
    </button>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 text-sm">
      {message}
    </div>
  );
}
