import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function SortableHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDirection,
  onSort,
  align = 'left',
  className = ''
}) {
  const isActive = currentSortKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-3 px-3.5 font-bold text-slate-700 uppercase tracking-wider text-[11px] cursor-pointer select-none hover:bg-slate-100/90 transition-colors ${className}`}
      title={`Urutkan berdasarkan ${label}`}
    >
      <div className={`flex items-center gap-1.5 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <span>{label}</span>
        <span className="shrink-0">
          {isActive ? (
            currentSortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-[#145DA0] stroke-[2.5]" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[#145DA0] stroke-[2.5]" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
          )}
        </span>
      </div>
    </th>
  );
}
