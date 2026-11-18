import { useEffect, useRef, useState } from 'react';

/**
 * 하단에서 올라오는 시트. 배경 클릭 / ESC / 손잡이를 아래로 끌어내리면 닫힌다.
 */
export default function BottomSheet({ open, onClose, children, labelledBy }) {
  const [visible, setVisible] = useState(false); // 애니메이션용
  const [dragY, setDragY] = useState(0);
  const startY = useRef(null);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // 뒤 화면 스크롤 막기
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (startY.current == null) return;
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  };
  const onTouchEnd = () => {
    if (dragY > 100) onClose();
    setDragY(0);
    startY.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-[480px] max-h-[85vh] flex flex-col bg-white rounded-t-3xl shadow-2xl
                   transition-transform duration-300 ease-out"
        style={{ transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)', transitionDuration: dragY ? '0ms' : undefined }}
      >
        <div
          className="pt-3 pb-2 flex justify-center cursor-grab touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="w-10 h-1.5 rounded-full bg-gray-200" />
        </div>
        <div className="overflow-y-auto px-5 pb-8">{children}</div>
      </div>
    </div>
  );
}
