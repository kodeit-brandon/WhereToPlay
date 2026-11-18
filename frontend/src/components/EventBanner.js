// 빨간 이벤트 배너 + 직접 그린 귀여운 공 캐릭터(SVG)
function BallBuddy() {
  return (
    <svg viewBox="0 0 140 140" className="w-full h-full drop-shadow-lg" aria-hidden>
      <defs>
        <clipPath id="ball-body">
          <circle cx="70" cy="74" r="46" />
        </clipPath>
      </defs>
      {/* 몸통(축구공) - 무늬는 가장자리에만 두어 얼굴을 깨끗하게 */}
      <circle cx="70" cy="74" r="46" fill="#fff" />
      <g clipPath="url(#ball-body)" fill="#1f2937">
        <polygon points="70,22 82,31 77,45 63,45 58,31" />
        <polygon points="18,70 30,62 38,74 32,88 20,86" />
        <polygon points="122,70 110,62 102,74 108,88 120,86" />
        <polygon points="52,122 58,108 72,106 80,118 70,128" />
      </g>
      <circle cx="70" cy="74" r="46" fill="none" stroke="#e5e7eb" strokeWidth="2" />
      {/* 헤어밴드 */}
      <path d="M30 56 Q70 22 110 56" stroke="#2ac1bc" strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* 눈 */}
      <ellipse cx="55" cy="72" rx="5" ry="6.5" fill="#1f2937" />
      <ellipse cx="85" cy="72" rx="5" ry="6.5" fill="#1f2937" />
      <circle cx="57" cy="70" r="1.8" fill="#fff" />
      <circle cx="87" cy="70" r="1.8" fill="#fff" />
      {/* 볼터치 */}
      <ellipse cx="45" cy="86" rx="7" ry="4" fill="#fca5a5" />
      <ellipse cx="95" cy="86" rx="7" ry="4" fill="#fca5a5" />
      {/* 입 */}
      <path d="M62 88 Q70 97 78 88" stroke="#1f2937" strokeWidth="3" fill="#ef4444" strokeLinecap="round" />
      {/* 팔 */}
      <path d="M26 82 Q12 70 16 54" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M114 82 Q130 74 128 58" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
      {/* 반짝이 */}
      <path d="M124 26 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#fde047" />
      <path d="M14 30 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2z" fill="#fde047" />
    </svg>
  );
}

export default function EventBanner() {
  return (
    <section className="px-4 pt-2">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-500 to-rose-500 px-5 py-5 h-36 shadow-card">
        {/* 배경 장식 */}
        <div className="absolute -right-6 -bottom-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute right-24 -top-8 w-20 h-20 rounded-full bg-white/10" />

        <div className="relative z-10 text-white">
          <span className="inline-block text-[11px] font-bold bg-white/25 rounded-full px-2 py-0.5">
            EVENT
          </span>
          <p className="mt-2 text-lg font-black leading-snug">
            장비 챙겨서 운동장으로!
          </p>
          <p className="text-sm font-medium text-white/90">
            우리 동네 운동 파트너가 궁금하다면?
          </p>
        </div>

        <div className="absolute right-2 bottom-0 w-32 h-32">
          <BallBuddy />
        </div>

        <span className="absolute right-3 top-3 text-[11px] text-white/80 bg-black/15 rounded-full px-2 py-0.5">
          1 / 3
        </span>
      </div>
    </section>
  );
}
