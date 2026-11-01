import React from 'react';
import { Clock, Activity, HelpCircle, CheckCircle2 } from 'lucide-react';

const statusConfig = {
  'Belum Dikunjungi': {
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: Clock,
    dot: 'bg-slate-400',
    label: 'Belum Dikunjungi'
  },
  'Pemantauan Aktif': {
    className: 'bg-sky-50 text-sky-800 border-sky-300',
    icon: Activity,
    dot: 'bg-sky-500 animate-pulse',
    label: 'Pemantauan Aktif'
  },
  'Menunggu Konfirmasi Kondisi': {
    className: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: HelpCircle,
    dot: 'bg-amber-500',
    label: 'Menunggu Konfirmasi'
  },
  'Selesai Dipantau': {
    className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    label: 'Selesai Dipantau'
  }
};

export default function MonitoringStatusBadge({ status, showIcon = true, size = 'sm' }) {
  const currentStatus = status || 'Belum Dikunjungi';
  const config = statusConfig[currentStatus] || statusConfig['Belum Dikunjungi'];
  const Icon = config.icon;

  const sizeClasses = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : size === 'md'
    ? 'text-xs px-2.5 py-1'
    : 'text-[11px] px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${config.className} ${sizeClasses}`}
      title={`Status Pemantauan: ${currentStatus}`}
    >
      {showIcon ? (
        <Icon className={size === 'xs' ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      )}
      <span>{config.label}</span>
    </span>
  );
}

