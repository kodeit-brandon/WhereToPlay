export default function Avatar({ src, name, size = 'w-11 h-11 text-base' }) {
  return (
    <div
      className={`${size} shrink-0 rounded-full bg-mint-50 text-mint-600 font-black flex items-center justify-center overflow-hidden`}
    >
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : (name || '?').slice(0, 1)}
    </div>
  );
}
