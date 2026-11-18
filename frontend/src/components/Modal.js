import { useEffect } from 'react';

/**
 * 하단에서 올라오는 둥근 알림 모달
 * actions: [{ label, onClick, variant: 'primary' | 'secondary' }]
 */
export default function Modal({ open, emoji, title, message, actions, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-[480px] sm:max-w-[400px] sm:mx-4 bg-white rounded-t-3xl sm:rounded-3xl
                   px-6 pt-7 pb-6 shadow-2xl text-center"
      >
        {emoji && <p className="text-5xl" aria-hidden>{emoji}</p>}
        <h2 id="modal-title" className="mt-3 text-lg font-black text-gray-900 whitespace-pre-line">
          {title}
        </h2>
        {message && <p className="mt-2 text-sm text-gray-500 whitespace-pre-line">{message}</p>}
        <div className="mt-6 flex gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={`flex-1 h-12 rounded-2xl text-[15px] font-bold transition active:scale-[0.98]
                ${a.variant === 'secondary'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-mint-500 text-white hover:bg-mint-600'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
