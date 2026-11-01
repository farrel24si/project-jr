import React from 'react';
import { Link } from 'react-router-dom';
import ConditionBadge from '../common/ConditionBadge';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { 
  Building2, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  PlusCircle, 
  FileText,
  User,
  ArrowRight
} from 'lucide-react';

export default function VictimCard({ victim, onOpenVisit, onOpenMonitoring }) {
  const firstVisitSla = calculateFirstVisitSla(
    victim.tanggalInformasiDiterima,
    victim.kunjunganPertama
  );

  const monitoringSla = calculateMonitoringSla(victim);
  const isVisited = !!victim.kunjunganPertama;
  const isOverdue = firstVisitSla.status === 'TERLAMBAT' || (!isVisited && firstVisitSla.isOverdue);
  const isWarning = firstVisitSla.status === 'MENDEKATI_TENGGAT';

  // Calculate SLA time progress out of 72 hours (3 days)
  const receivedTime = new Date(victim.tanggalInformasiDiterima).getTime();
  const now = new Date().getTime();
  const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
  
  let percentElapsed = 0;
  let remainingHoursText = '';

  if (isVisited) {
    const visitTime = new Date(victim.kunjunganPertama.tanggalKunjungan).getTime();
    percentElapsed = Math.min(100, Math.round(((visitTime - receivedTime) / seventyTwoHoursMs) * 100));
    const hoursTaken = Math.max(1, Math.round((visitTime - receivedTime) / (1000 * 60 * 60)));
    remainingHoursText = `Selesai dalam ${hoursTaken} jam`;
  } else {
    const elapsedMs = now - receivedTime;
    percentElapsed = Math.round((elapsedMs / seventyTwoHoursMs) * 100);
    const diffHours = Math.round((seventyTwoHoursMs - elapsedMs) / (1000 * 60 * 60));
    if (diffHours < 0) {
      remainingHoursText = `Terlambat ${Math.abs(diffHours)} jam`;
    } else {
      remainingHoursText = `Sisa ${diffHours} jam`;
    }
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden flex flex-col ${
        isOverdue
          ? 'border-rose-300 shadow-[0_2px_12px_rgba(225,29,72,0.08)] ring-1 ring-rose-200'
          : isWarning
          ? 'border-amber-300 shadow-[0_2px_12px_rgba(245,158,11,0.08)]'
          : 'border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:border-slate-300'
      }`}
    >
      {/* Top Header Bar */}
      <div
        className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-wrap ${
          isOverdue
            ? 'bg-rose-50/70 border-rose-200'
            : isWarning
            ? 'bg-amber-50/60 border-amber-200'
            : 'bg-slate-50/80 border-slate-200/70'
        }`}
      >
        <div className="flex items-center gap-2">
          {isOverdue ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] uppercase tracking-wide shadow-2xs">
              <AlertCircle className="w-3 h-3" />
              <span>SLA Melewati Batas 3 Hari</span>
            </span>
          ) : isWarning ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px] uppercase tracking-wide">
              <Clock className="w-3 h-3" />
              <span>Mendekati Tenggat</span>
            </span>
          ) : isVisited ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Kunjungan Tuntas</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Dalam Batas SLA (3 Hari)</span>
            </span>
          )}
        </div>

        <span className="text-[11px] font-mono text-slate-500 font-medium">
          {victim.nomorLaporan}
        </span>
      </div>

      {/* Main Content Body */}
      <div className="p-4 flex-1 space-y-3.5">
        {/* Victim Name & Medical Condition */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 leading-snug truncate">
              {victim.nama}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {victim.usia} Tahun • {victim.jenisKelamin}
            </p>
          </div>
          <div className="shrink-0">
            <ConditionBadge
              kondisi={victim.kondisiTerakhir}
              statusKonfirmasi={victim.statusKonfirmasiKondisi}
            />
          </div>
        </div>

        {/* Hospital Card Tile */}
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200/60 space-y-1.5 text-xs text-slate-700">
          <div className="flex items-start gap-2">
            <Building2 className="w-3.5 h-3.5 text-[#0A3981] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-slate-900 block truncate">{victim.rumahSakit}</span>
              <span className="text-[11px] text-slate-500 block truncate">
                Ruangan: {victim.ruangan || 'Rawat Inap'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-200/50 pt-1.5">
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">TKP: {victim.lokasiKejadian}</span>
          </div>
        </div>

        {/* SLA Progress Visual Meter */}
        <div className="bg-slate-50/90 rounded-lg p-2.5 border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Progress Batas Waktu SLA
            </span>
            <span className={`font-bold ${
              isOverdue ? 'text-rose-700' : isWarning ? 'text-amber-700' : 'text-slate-700'
            }`}>
              {remainingHoursText}
            </span>
          </div>

          {/* Linear bar */}
          <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isOverdue
                  ? 'bg-rose-600'
                  : isWarning
                  ? 'bg-amber-500'
                  : isVisited
                  ? 'bg-emerald-600'
                  : 'bg-[#0A3981]'
              }`}
              style={{ width: `${Math.min(percentElapsed, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Diterima: {formatDateTime(victim.tanggalInformasiDiterima).split(',')[0]}</span>
            <span>Maks. 72 Jam (3 Hari)</span>
          </div>
        </div>
      </div>

      {/* Action Footer Buttons */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-2">
        <Link
          to={`/petugas/korban/${victim.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-[#0A3981] px-2.5 py-1.5 rounded-md hover:bg-slate-200/60 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Detail</span>
        </Link>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenMonitoring(victim)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
          >
            Update Kondisi
          </button>

          <button
            type="button"
            onClick={() => onOpenVisit(victim)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-xs ${
              isOverdue
                ? 'bg-rose-700 text-white hover:bg-rose-800'
                : isVisited
                ? 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                : 'bg-[#0A3981] text-white hover:bg-blue-900'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{isVisited ? 'Kunjungan Ulang' : 'Kunjungan RS'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
