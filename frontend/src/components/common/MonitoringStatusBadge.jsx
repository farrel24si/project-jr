import React from 'react';
import { Clock, Activity, AlertOctagon, CheckCircle2, Ban } from 'lucide-react';
import {
  MONITORING_STATUS,
  getMonitoringStatus,
  isPenolakanJaminanVictim
} from '../../utils/monitoringStatus';

const STATUS_CONFIG = {
  [MONITORING_STATUS.BELUM_DIPANTAU]: {
    className: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: Clock,
    dot: 'bg-amber-500',
    label: MONITORING_STATUS.BELUM_DIPANTAU
  },
  [MONITORING_STATUS.DALAM_PEMANTAUAN]: {
    className: 'bg-sky-50 text-sky-800 border-sky-300',
    icon: Activity,
    dot: 'bg-sky-500 animate-pulse',
    label: MONITORING_STATUS.DALAM_PEMANTAUAN
  },
  [MONITORING_STATUS.SELESAI_PULANG]: {
    className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    label: MONITORING_STATUS.SELESAI_PULANG
  },
  [MONITORING_STATUS.SELESAI_MD]: {
    className: 'bg-rose-50 text-rose-800 border-rose-300',
    icon: AlertOctagon,
    dot: 'bg-rose-600',
    label: MONITORING_STATUS.SELESAI_MD
  },
  [MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA]: {
    className: 'bg-stone-100 text-stone-800 border-stone-300',
    icon: Ban,
    dot: 'bg-stone-500',
    label: MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA
  },
  'Diarsipkan': {
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: CheckCircle2,
    dot: 'bg-slate-500',
    label: 'Diarsipkan'
  }
};

/**
 * Normalisasi input status ke salah satu dari 5 status resmi pemantauan
 */
function resolveStatusKey(statusInput, victimObj) {
  if (victimObj?.status_pemantauan === 'Diarsipkan' || victimObj?.statusPemantauan === 'Diarsipkan') {
    return 'Diarsipkan';
  }

  if (victimObj && isPenolakanJaminanVictim(victimObj)) {
    return MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
  }

  if (victimObj) {
    return getMonitoringStatus(victimObj);
  }

  const s = String(statusInput || '').trim();
  const sLower = s.toLowerCase();

  if (s === 'Diarsipkan') {
    return 'Diarsipkan';
  }
  if (sLower.includes('tidak bersedia') || sLower.includes('tolak')) {
    return MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
  }
  if (sLower === 'selesai md' || sLower.includes('meninggal')) {
    return MONITORING_STATUS.SELESAI_MD;
  }
  if (sLower === 'selesai pulang' || sLower === 'selesai' || sLower === 'selesai dipantau' || sLower.includes('pulang')) {
    return MONITORING_STATUS.SELESAI_PULANG;
  }
  if (sLower === 'dalam pemantauan' || sLower === 'pemantauan aktif' || sLower.includes('tindak lanjut')) {
    return MONITORING_STATUS.DALAM_PEMANTAUAN;
  }
  if (sLower === 'belum dipantau' || sLower === 'menunggu kunjungan' || sLower === 'belum dikunjungi') {
    return MONITORING_STATUS.BELUM_DIPANTAU;
  }

  return MONITORING_STATUS.BELUM_DIPANTAU;
}

export default function MonitoringStatusBadge({ status, victim, showIcon = true, size = 'sm' }) {
  const statusKey = resolveStatusKey(status, victim);
  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG[MONITORING_STATUS.BELUM_DIPANTAU];
  const Icon = config.icon;

  const sizeClasses = size === 'xs'
    ? 'text-[10px] px-2 py-0.5'
    : size === 'md'
      ? 'text-xs px-2.5 py-1'
      : 'text-[11px] px-2.5 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold border transition-colors ${config.className} ${sizeClasses}`}
      title={`Status Pemantauan: ${config.label}`}
    >
      {showIcon ? (
        <Icon className={size === 'xs' ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      )}
      <span>{config.label}</span>
    </span>
  );
}
