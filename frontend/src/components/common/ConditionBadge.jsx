import React from 'react';
import { AlertOctagon, Activity, Home, ArrowUpRight, HelpCircle } from 'lucide-react';

const conditionConfig = {
  'Masih Dirawat': {
    className: 'bg-sky-50 text-sky-800 border-sky-200',
    icon: Activity,
    dot: 'bg-sky-500',
    label: 'Masih Dirawat'
  },
  'Rawat Inap': {
    className: 'bg-sky-50 text-sky-800 border-sky-200',
    icon: Activity,
    dot: 'bg-sky-500',
    label: 'Rawat Inap'
  },
  'Luka Ringan': {
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Activity,
    dot: 'bg-amber-500',
    label: 'Luka Ringan'
  },
  'Luka Berat': {
    className: 'bg-orange-50 text-orange-800 border-orange-200',
    icon: AlertOctagon,
    dot: 'bg-orange-600',
    label: 'Luka Berat'
  },
  'Selesai': {
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: Home,
    dot: 'bg-emerald-500',
    label: 'Selesai'
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
  'Rujukan': {
    className: 'bg-violet-50 text-violet-800 border-violet-200',
    icon: ArrowUpRight,
    dot: 'bg-violet-500',
    label: 'Rujukan'
  },
  'Rawat Pertama': {
    className: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Activity,
    dot: 'bg-blue-600',
    label: 'Rawat Pertama'
  },
  'Rawat Lanjutan': {
    className: 'bg-purple-50 text-purple-800 border-purple-200',
    icon: Activity,
    dot: 'bg-purple-600',
    label: 'Rawat Lanjutan'
  },
  'Monitoring Berjalan': {
    className: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    icon: Activity,
    dot: 'bg-indigo-600',
    label: 'Monitoring Berjalan'
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
  let config = conditionConfig[currentCondition];

  if (!config && typeof currentCondition === 'string' && (currentCondition.startsWith('Dirujuk') || currentCondition.startsWith('Rujukan dari'))) {
    config = {
      className: currentCondition.startsWith('Dirujuk')
        ? 'bg-purple-50 text-purple-800 border-purple-200'
        : 'bg-violet-50 text-violet-800 border-violet-200',
      icon: ArrowUpRight,
      dot: currentCondition.startsWith('Dirujuk') ? 'bg-purple-500' : 'bg-violet-500',
      label: currentCondition
    };
  }

  if (!config) {
    config = conditionConfig['Masih Dirawat'];
  }
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
