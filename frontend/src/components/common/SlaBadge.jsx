import React from 'react';
import { Clock, AlertTriangle, AlertCircle, CheckCircle2, TimerOff } from 'lucide-react';

export default function SlaBadge({ slaInfo, size = 'md' }) {
  if (!slaInfo) return null;

  const { status, isOverdue, isWarning, isCompleted, wasLate } = slaInfo;

  // TERLAMBAT: Merah tegas
  if (status === 'TERLAMBAT' || isOverdue) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-rose-200 bg-rose-50 text-rose-800 font-semibold text-[11px] px-2 py-0.5">
        <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
        <span>Terlambat</span>
      </span>
    );
  }

  // MENDEKATI TENGGAT: Kuning/amber
  if (status === 'MENDEKATI_TENGGAT' || isWarning) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 text-amber-800 font-semibold text-[11px] px-2 py-0.5">
        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
        <span>Mendekati Tenggat</span>
      </span>
    );
  }

  // SELESAI TERLAMBAT
  if (status === 'SELESAI_TERLAMBAT' || (isCompleted && wasLate)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
        <CheckCircle2 className="w-3 h-3 text-slate-400 shrink-0" />
        <span>Selesai (Terlambat)</span>
      </span>
    );
  }

  // SELESAI TEPAT WAKTU
  if (status === 'SELESAI_TEPAT_WAKTU' || isCompleted) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>Selesai</span>
      </span>
    );
  }

  // PEMANTAUAN DITUTUP
  if (status === 'SELESAI') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
        <CheckCircle2 className="w-3 h-3 text-slate-400 shrink-0" />
        <span>Selesai</span>
      </span>
    );
  }

  // TEPAT WAKTU (aktif)
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#145DA0] font-medium">
      <Clock className="w-3 h-3 text-[#145DA0]/60 shrink-0" />
      <span>Tepat Waktu</span>
    </span>
  );
}
