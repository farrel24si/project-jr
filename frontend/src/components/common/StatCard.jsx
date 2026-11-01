import React from 'react';

const variantConfig = {
  blue: {
    iconBg: 'bg-blue-50 text-[#145DA0] border-blue-100',
    value: 'text-slate-900',
    card: 'border-slate-200',
    badge: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  emerald: {
    iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    value: 'text-emerald-800',
    card: 'border-slate-200',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  amber: {
    iconBg: 'bg-amber-50 text-amber-700 border-amber-100',
    value: 'text-amber-800',
    card: 'border-amber-200 bg-amber-50/20',
    badge: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  rose: {
    iconBg: 'bg-rose-50 text-rose-700 border-rose-100',
    value: 'text-rose-800',
    card: 'border-rose-200 bg-rose-50/20',
    badge: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  slate: {
    iconBg: 'bg-slate-100 text-slate-600 border-slate-200',
    value: 'text-slate-900',
    card: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-600 border-slate-200'
  }
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'slate',
  onClick,
  badge
}) {
  const config = variantConfig[variant] || variantConfig.slate;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={`bg-white rounded-lg border p-4 shadow-sm transition-all
        ${config.card}
        ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-px' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 leading-tight">{title}</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight ${config.value}`}>
              {value}
            </span>
            {badge && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${config.badge}`}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-[11px] text-slate-400 leading-snug">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={`p-2 rounded-md border shrink-0 ${config.iconBg}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
