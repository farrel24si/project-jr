import React from 'react';
import { Target, Clock, ShieldCheck, AlertCircle, CheckCircle2, TrendingUp, Info, Zap } from 'lucide-react';

export default function KpiSlaOverview({ victims = [], role = 'petugas', officerName = '' }) {
  const total = victims.length;
  let visitedOnTime = 0;
  let visitedLate = 0;
  let unvisitedLate = 0;
  let totalDocComplete = 0;
  let totalHoursToVisit = 0;
  let visitedCount = 0;

  victims.forEach((v) => {
    const received = new Date(v.tanggalInformasiDiterima).getTime();
    const deadline = received + 72 * 60 * 60 * 1000;

    if (v.kunjunganPertama && v.kunjunganPertama.tanggalKunjungan) {
      visitedCount++;
      const visitTime = new Date(v.kunjunganPertama.tanggalKunjungan).getTime();
      const diffHours = (visitTime - received) / (1000 * 60 * 60);
      totalHoursToVisit += Math.max(0, diffHours);

      if (visitTime <= deadline) {
        visitedOnTime++;
      } else {
        visitedLate++;
      }

      if (v.kunjunganPertama.fotoUrl && v.kunjunganPertama.latitude) {
        totalDocComplete++;
      }
    } else {
      const now = new Date().getTime();
      if (now > deadline) {
        unvisitedLate++;
      }
    }
  });

  const totalEvaluated = visitedOnTime + visitedLate + unvisitedLate;
  const slaCompliancePct = totalEvaluated > 0
    ? Math.round((visitedOnTime / totalEvaluated) * 100)
    : 100;

  const docCompletenessPct = visitedCount > 0
    ? Math.round((totalDocComplete / visitedCount) * 100)
    : 100;

  const avgDaysToVisit = visitedCount > 0
    ? (totalHoursToVisit / visitedCount / 24).toFixed(1)
    : '—';

  const targetSla = 90;
  const isTargetAchieved = slaCompliancePct >= targetSla;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#17365D] px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Target className="w-4 h-4 text-blue-300 shrink-0" />
          <span className="text-sm font-bold text-white">
            Indikator Kinerja Utama (KPI) &amp; Kepatuhan SLA
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] bg-white/10 text-blue-200 px-2.5 py-1 rounded border border-white/10 self-start sm:self-auto">
          <Info className="w-3 h-3 shrink-0" />
          <span>Batas SLA: <strong>Maks. 72 Jam (3 Hari)</strong></span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 p-5 gap-5 sm:gap-0">

        {/* KPI 1: Kepatuhan SLA */}
        <div className="space-y-2 sm:pr-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#145DA0]" />
              Kepatuhan SLA Kunjungan
            </span>
            <span className="text-[10px] text-slate-400">Target {targetSla}%</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold tracking-tight ${isTargetAchieved ? 'text-slate-900' : 'text-rose-700'}`}>
              {slaCompliancePct}%
            </span>
            <span className="text-xs text-slate-400">
              ({visitedOnTime}/{totalEvaluated || total} korban)
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isTargetAchieved ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(slaCompliancePct, 100)}%` }}
            />
          </div>
          <p className="text-[11px] flex items-center gap-1">
            {isTargetAchieved ? (
              <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Memenuhi target minimum
              </span>
            ) : (
              <span className="text-rose-700 font-medium inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Di bawah target ({targetSla}%)
              </span>
            )}
          </p>
        </div>

        {/* KPI 2: Rata-rata Kecepatan Respons */}
        <div className="space-y-2 pt-4 sm:pt-0 sm:px-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#145DA0]" />
              Kecepatan Respons
            </span>
            <span className="text-[10px] text-slate-400">Batas 3 hari</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">
              {avgDaysToVisit}
            </span>
            {avgDaysToVisit !== '—' && (
              <span className="text-sm font-medium text-slate-500">hari</span>
            )}
          </div>
          {avgDaysToVisit !== '—' && (
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#145DA0] rounded-full transition-all"
                style={{ width: `${Math.min((parseFloat(avgDaysToVisit) / 3) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* KPI 3: Kelengkapan Bukti */}
        <div className="space-y-2 pt-4 sm:pt-0 sm:pl-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#145DA0]" />
              Kelengkapan Bukti
            </span>
            <span className="text-[10px] text-slate-400">Wajib 100%</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 tracking-tight">
              {docCompletenessPct}%
            </span>
            <span className="text-xs text-slate-400">
              ({totalDocComplete}/{visitedCount} kunjungan)
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(docCompletenessPct, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
