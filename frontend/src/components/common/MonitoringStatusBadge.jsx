import React from 'react';
import { Clock, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MONITORING_STATUS, getMonitoringStatus } from '../../utils/monitoringStatus';

const STATUS_CONFIG = {
  [MONITORING_STATUS.MENUNGGU_KUNJUNGAN]: {
    className: 'bg-amber-50 text-amber-800 border-amber-300',
    icon: Clock,
    dot: 'bg-amber-500',
    label: MONITORING_STATUS.MENUNGGU_KUNJUNGAN
  },
  [MONITORING_STATUS.DALAM_PEMANTAUAN]: {
    className: 'bg-sky-50 text-sky-800 border-sky-300',
    icon: Activity,
    dot: 'bg-sky-500 animate-pulse',
    label: MONITORING_STATUS.DALAM_PEMANTAUAN
  },
  [MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT]: {
    className: 'bg-rose-50 text-rose-800 border-rose-300',
    icon: AlertCircle,
    dot: 'bg-rose-500 animate-pulse',
    label: MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT
  },
  [MONITORING_STATUS.SELESAI]: {
    className: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    label: MONITORING_STATUS.SELESAI
  },
  'Diarsipkan': {
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: CheckCircle2,
    dot: 'bg-slate-500',
    label: 'Diarsipkan'
  }
};

/**
 * Normalisasi input status ke salah satu dari 4 status resmi
 */
function resolveStatusKey(statusInput, victimObj) {
  if (victimObj?.status_pemantauan === 'Diarsipkan' || victimObj?.statusPemantauan === 'Diarsipkan') {
    return 'Diarsipkan';
  }

  if (victimObj) {
    return getMonitoringStatus(victimObj);
  }

  const s = String(statusInput || '').trim();

  if (s === 'Diarsipkan') {
    return 'Diarsipkan';
  }

  if (s === MONITORING_STATUS.MENUNGGU_KUNJUNGAN || s === 'Belum Dikunjungi') {
    return MONITORING_STATUS.MENUNGGU_KUNJUNGAN;
  }
  if (s === MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT || s.includes('Tindak Lanjut') || s.includes('Konfirmasi')) {
    return MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT;
  }
  if (s === MONITORING_STATUS.SELESAI || s === 'Selesai Dipantau' || s === 'Pulang' || s === 'Sudah Pulang' || s === 'Meninggal Dunia') {
    return MONITORING_STATUS.SELESAI;
  }
  if (s === MONITORING_STATUS.DALAM_PEMANTAUAN || s === 'Pemantauan Aktif') {
    return MONITORING_STATUS.DALAM_PEMANTAUAN;
  }

  return MONITORING_STATUS.MENUNGGU_KUNJUNGAN;
}

export default function MonitoringStatusBadge({ status, victim, showIcon = true, size = 'sm' }) {
  const statusKey = resolveStatusKey(status, victim);
  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG[MONITORING_STATUS.MENUNGGU_KUNJUNGAN];
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
