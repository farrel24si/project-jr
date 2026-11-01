import React from 'react';
import { AlertOctagon, Activity, Home, ArrowUpRight, HelpCircle } from 'lucide-react';

const conditionConfig = {
  'Masih Dirawat': {
    className: 'bg-sky-50 text-sky-800 border-sky-200',
    icon: Activity,
    dot: 'bg-sky-500',
    label: 'Masih Dirawat'
  },
  'Sudah Pulang': {
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: Home,
    dot: 'bg-emerald-500',
    label: 'Sudah Pulang'
  },
  'Pulang': {
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: Home,
    dot: 'bg-emerald-500',
    label: 'Sudah Pulang'
  },
  'Dirujuk': {
    className: 'bg-violet-50 text-violet-800 border-violet-200',
    icon: ArrowUpRight,
    dot: 'bg-violet-500',
    label: 'Dirujuk'
  },
  'Meninggal Dunia': {
    className: 'bg-red-50 text-red-800 border-red-200',
    icon: AlertOctagon,
    dot: 'bg-red-600',
    label: 'Meninggal Dunia'
  },
  'Belum Dapat Dikonfirmasi': {
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: HelpCircle,
    dot: 'bg-slate-400',
    label: 'Belum Dapat Dikonfirmasi'
  },
  'Belum Dikonfirmasi': {
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: HelpCircle,
    dot: 'bg-slate-400',
    label: 'Belum Dikonfirmasi'
  }
};

export default function ConditionBadge({ kondisi, statusKonfirmasi, size = 'sm' }) {
  const currentCondition = kondisi || 'Belum Dapat Dikonfirmasi';
  const config = conditionConfig[currentCondition] || conditionConfig['Masih Dirawat'];
  const Icon = config.icon;

  const sizeClasses = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : size === 'md'
    ? 'text-xs px-2.5 py-1'
    : 'text-[11px] px-2 py-0.5';

  // Special treatment for deceased
  if (currentCondition === 'Meninggal Dunia') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-bold border ${config.className} ${sizeClasses}`}
        title="Kondisi: Meninggal Dunia"
      >
        <Icon className={size === 'xs' ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
        <span>Meninggal Dunia</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${config.className} ${sizeClasses}`}
      title={`Kondisi Korban: ${config.label}${statusKonfirmasi ? ` (${statusKonfirmasi})` : ''}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      <span>{config.label}</span>
      {statusKonfirmasi === 'Belum Dikonfirmasi' && currentCondition !== 'Belum Dapat Dikonfirmasi' && (
        <span className="text-[9px] font-normal opacity-75">(Unconfirmed)</span>
      )}
    </span>
  );
}
