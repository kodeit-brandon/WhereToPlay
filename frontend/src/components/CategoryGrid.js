import { useNavigate } from 'react-router-dom';

const SPECIAL = [
  { key: 'popular', label: '인기 동호회', emoji: '👑', bg: 'bg-amber-50' },
  { key: 'guest', label: '게스트 모집', emoji: '👥', bg: 'bg-mint-50' },
];
const BGS = ['bg-green-50', 'bg-orange-50', 'bg-sky-50', 'bg-red-50', 'bg-lime-50', 'bg-blue-50', 'bg-rose-50', 'bg-violet-50', 'bg-stone-100', 'bg-gray-100'];
const GRID_SIZE = 12; // 4 x 3

/**
 * 메인 카테고리 그리드: 고정 메뉴 2개 + DB 종목(GET /api/sports, 노출 순서대로)
 * 종목이 많아 12칸을 넘으면 마지막 칸은 '전체 종목' (탐색 화면으로 이동)
 */
export function buildCategories(sports) {
  const room = GRID_SIZE - SPECIAL.length;
  const overflow = sports.length > room;
  const shown = overflow ? sports.slice(0, room - 1) : sports;
  const items = shown.map((sp, i) => ({ key: sp.name, label: sp.name, emoji: sp.icon, sports: [sp.name], bg: BGS[i % BGS.length] }));
  if (overflow) items.push({ key: 'more', label: '전체 종목', emoji: '➕', bg: 'bg-gray-100' });
  return [...SPECIAL, ...items];
}

export default function CategoryGrid({ categories, selected, onSelect }) {
  const navigate = useNavigate();
  return (
    <section className="mx-4 mt-4 bg-white rounded-2xl shadow-card px-2 py-4">
      <ul className="grid grid-cols-4 gap-y-4">
        {categories.map((c) => {
          const active = selected === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => (c.key === 'more' ? navigate('/explore') : onSelect(active ? null : c.key))}
                className="w-full flex flex-col items-center gap-1.5 group"
              >
                <span
                  className={`w-14 h-14 rounded-[20px] flex items-center justify-center text-[28px] transition
                    ${c.bg} ${active ? 'ring-2 ring-mint-500 scale-105' : 'group-active:scale-95'}`}
                >
                  {c.emoji}
                </span>
                <span
                  className={`text-[13px] font-medium ${active ? 'text-mint-600 font-bold' : 'text-gray-700'}`}
                >
                  {c.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
