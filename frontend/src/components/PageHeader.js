import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon } from './Icons';

/** 고정 헤더. back=true면 왼쪽에 뒤로가기 버튼 */
export default function PageHeader({ title, back = false, fallback = '/' }) {
  const navigate = useNavigate();
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback));
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-100">
      <div className="relative flex items-center justify-center h-14 px-2">
        {back && (
          <button type="button" onClick={goBack} aria-label="뒤로가기" className="absolute left-2 p-2 text-gray-800">
            <ChevronLeftIcon />
          </button>
        )}
        <h1 className="px-12 text-[17px] font-bold text-gray-900 truncate">{title}</h1>
      </div>
    </header>
  );
}
