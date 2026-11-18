/** 관리자 표 공통 스타일 */
export function Table({ columns, children, label }) {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={label}>
          <thead className="bg-gray-50 text-xs text-gray-500 text-left">
            <tr>
              {columns.map((c) => (
                <th key={c.key || c.label} scope="col" className={`px-4 py-3 font-bold whitespace-nowrap ${c.className || ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center text-gray-400">
        {children}
      </td>
    </tr>
  );
}

export function SearchBox({ value, onChange, placeholder, label }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="w-80 px-4 py-2.5 rounded-xl bg-white shadow-card text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
    />
  );
}
