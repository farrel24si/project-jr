import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Download, 
  RotateCcw, 
  ChevronRight, 
  Search, 
  TrendingUp, 
  Bell, 
  Send, 
  FileText, 
  Activity,
  Eye,
  Building2,
  MapPin,
  ShieldCheck,
  Filter
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';
import Modal from '../../components/common/Modal';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import { storageService } from '../../services/storageService';
import { performanceService, MONTHLY_OFFICER_TRENDS, OFFICER_COLORS } from '../../services/performanceService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';

export default function KabagDashboard() {
  const navigate = useNavigate();

  const [victims, setVictims] = useState([]);
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedPeriod, setSelectedPeriod] = useState('YTD');
  const [officerSearch, setOfficerSearch] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [actionSuccessToast, setActionSuccessToast] = useState('');
  const [selectedVictimForDrawer, setSelectedVictimForDrawer] = useState(null);

  // Filter untuk tabel korban terkini
  const [victimSearch, setVictimSearch] = useState('');
  const [victimStatusFilter, setVictimStatusFilter] = useState('ALL');

  const [activeOfficers, setActiveOfficers] = useState({
    'PET-01': true,
    'PET-02': true,
    'PET-03': true,
    'PET-04': true,
    'PET-05': true,
    'PET-06': true
  });

  const loadData = () => {
    setVictims(storageService.getVictims());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    return () => window.removeEventListener('jr_victims_updated', loadData);
  }, []);

  const toggleOfficer = (key) => {
    setActiveOfficers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Metrik agregasi riil dari storageService
  const overallMetrics = useMemo(() => {
    return storageService.getAggregatedMetrics();
  }, [victims]);

  const officers = useMemo(() => {
    return storageService.getOfficers();
  }, []);

  // Perbandingan kinerja riil per petugas dari performanceService
  const comparisonData = useMemo(() => {
    return performanceService.getOfficersComparison(selectedYear, selectedPeriod);
  }, [victims, selectedYear, selectedPeriod]);

  // Filtered ranking
  const filteredRanking = useMemo(() => {
    return comparisonData.filter((o) =>
      o.nama.toLowerCase().includes(officerSearch.toLowerCase()) ||
      (o.nip || '').includes(officerSearch) ||
      (o.wilayah || '').toLowerCase().includes(officerSearch.toLowerCase())
    );
  }, [comparisonData, officerSearch]);

  // Filtered victims for dashboard victim monitoring table
  const filteredVictims = useMemo(() => {
    return victims.filter((v) => {
      const matchSearch =
        v.nama.toLowerCase().includes(victimSearch.toLowerCase()) ||
        v.rumahSakit.toLowerCase().includes(victimSearch.toLowerCase()) ||
        (v.namaPetugas || '').toLowerCase().includes(victimSearch.toLowerCase());
      if (!matchSearch) return false;
      if (victimStatusFilter !== 'ALL' && v.statusPemantauan !== victimStatusFilter) return false;
      return true;
    });
  }, [victims, victimSearch, victimStatusFilter]);

  // Kasus mendesak riil yang membutuhkan perhatian Kabag
  const urgentCases = useMemo(() => {
    const list = [];
    victims.forEach((v) => {
      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      const mSla = calculateMonitoringSla(v);

      if (!v.kunjunganPertama && fSla.isOverdue) {
        list.push({
          id: `URG-VIS-${v.id}`,
          victimId: v.id,
          victimObj: v,
          namaKorban: v.nama,
          rs: v.rumahSakit,
          petugasInisial: v.namaPetugas ? v.namaPetugas.split(' ').map((n) => n[0]).slice(0, 2).join('') : 'PT',
          petugasNama: v.namaPetugas,
          kategoriMasalah: 'Kunjungan Pertama Melewati SLA 72 Jam',
          urgensi: 'Kritis',
          urgensiColor: 'bg-rose-50 text-rose-700 border-rose-200',
          actionText: 'Tegur Petugas',
          actionStyle: 'bg-rose-700 hover:bg-rose-800 text-white'
        });
      } else if (v.kondisiTerakhir === 'Meninggal Dunia' && !v.santunanSelesai) {
        list.push({
          id: `URG-MD-${v.id}`,
          victimId: v.id,
          victimObj: v,
          namaKorban: v.nama,
          rs: v.rumahSakit,
          petugasInisial: v.namaPetugas ? v.namaPetugas.split(' ').map((n) => n[0]).slice(0, 2).join('') : 'PT',
          petugasNama: v.namaPetugas,
          kategoriMasalah: 'Korban Meninggal Dunia — Santunan Berjalan',
          urgensi: 'Prioritas Santunan',
          urgensiColor: 'bg-red-50 text-red-700 border-red-200',
          actionText: 'Percepat Berkas',
          actionStyle: 'bg-[#0A3981] hover:bg-blue-900 text-white'
        });
      } else if (mSla.isOverdue && (v.statusPemantauan === 'Pemantauan Aktif' || v.statusPemantauan === 'Menunggu Konfirmasi Kondisi')) {
        list.push({
          id: `URG-MON-${v.id}`,
          victimId: v.id,
          victimObj: v,
          namaKorban: v.nama,
          rs: v.rumahSakit,
          petugasInisial: v.namaPetugas ? v.namaPetugas.split(' ').map((n) => n[0]).slice(0, 2).join('') : 'PT',
          petugasNama: v.namaPetugas,
          kategoriMasalah: 'Jadwal Pemantauan Belum Diperbarui',
          urgensi: 'Perhatian',
          urgensiColor: 'bg-amber-50 text-amber-800 border-amber-200',
          actionText: 'Kirim Notifikasi',
          actionStyle: 'bg-white hover:bg-slate-50 text-blue-700 border border-blue-300'
        });
      }
    });

    return list.slice(0, 5);
  }, [victims]);

  const handleAction = (item) => {
    setActiveModal({ type: item.actionText, item });
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    setActionSuccessToast(`Instruksi ${activeModal.type} untuk ${activeModal.item.namaKorban} berhasil dikirim!`);
    setActiveModal(null);
    setTimeout(() => setActionSuccessToast(''), 4000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionSuccessToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{actionSuccessToast}</span>
        </div>
      )}

      {/* 1. Page Header with Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Dashboard Monitoring Kepala Bagian
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluasi terpadu kinerja petugas, kepatuhan batas waktu SLA, dan pemantauan berkelanjutan korban.
          </p>
        </div>

        {/* Right Dropdowns & Export Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg pl-8 pr-7 py-2 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs cursor-pointer"
            >
              <option value="2026">Tahun 2026</option>
              <option value="2025">Tahun 2025</option>
              <option value="2024">Tahun 2024</option>
            </select>
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-2 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs cursor-pointer"
          >
            <option value="YTD">Semua Periode (YTD)</option>
            <option value="Q4">Kuartal 4</option>
            <option value="M10">Bulan Oktober</option>
          </select>

          <button
            type="button"
            onClick={() => alert('Mengekspor Laporan Kinerja Operasional Jasa Raharja (.XLSX & .PDF)...')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-[#072B62] text-white shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Laporan</span>
          </button>
        </div>
      </div>

      {/* 2. Six Metric Stat Cards (Bersih, Rapi, & Berkontras Tinggi) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Card 1: TOTAL KORBAN UNIK */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              TOTAL KORBAN UNIK
            </span>
            <div className="w-7 h-7 rounded-full bg-blue-50 text-[#0A3981] flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">{overallMetrics.totalKorbanUnik}</span>
              <span className="text-xs text-slate-500 font-medium">Orang</span>
            </div>
            <div className="mt-2.5">
              <span className="inline-block text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                Data Utama Terpadu
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: KUNJUNGAN PERTAMA */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              KUNJUNGAN PERTAMA
            </span>
            <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-700 tracking-tight">{overallMetrics.totalKunjunganPertama}</span>
              <span className="text-xs text-slate-500 font-medium">Kasus</span>
            </div>
            <div className="mt-2.5">
              <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                Target SLA 72 Jam
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: PEMANTAUAN LANJUTAN */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              PEMANTAUAN LANJUTAN
            </span>
            <div className="w-7 h-7 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-sky-800 tracking-tight">{overallMetrics.totalPemantauanLanjutan}</span>
              <span className="text-xs text-slate-500 font-medium">Catatan</span>
            </div>
            <div className="mt-2.5">
              <span className="inline-block text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200/60">
                Pemantauan Rutin
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: TOTAL SELURUH AKTIVITAS */}
        <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-2xs flex flex-col justify-between bg-blue-50/20">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-[#0A3981] uppercase tracking-wider">
              TOTAL AKTIVITAS
            </span>
            <div className="w-7 h-7 rounded-full bg-blue-100 text-[#0A3981] flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#0A3981] tracking-tight">{overallMetrics.totalSeluruhAktivitas}</span>
              <span className="text-xs text-blue-700 font-medium">Kegiatan</span>
            </div>
            <div className="mt-2.5">
              <span className="inline-block text-[10px] font-bold text-[#0A3981] bg-blue-100/70 px-2 py-0.5 rounded-full border border-blue-200">
                Kunjungan + Pantau
              </span>
            </div>
          </div>
        </div>

        {/* Card 5: PEMANTAUAN AKTIF */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              PEMANTAUAN AKTIF
            </span>
            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">{overallMetrics.pemantauanAktif}</span>
              <span className="text-xs text-slate-500 font-medium">Pasien</span>
            </div>
            <div className="mt-2.5">
              <span className="inline-block text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                Dalam Perawatan RS
              </span>
            </div>
          </div>
        </div>

        {/* Card 6: PERLU TINDAK LANJUT */}
        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-2xs flex flex-col justify-between bg-amber-50/20">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              PERLU TINDAK LANJUT
            </span>
            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-900 tracking-tight">{overallMetrics.perluTindakLanjut}</span>
              <span className="text-xs text-amber-700 font-medium">Kasus</span>
            </div>
            <div className="mt-2.5">
              <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-full border border-amber-200">
                Perlu Intervensi
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Chart: Tren Kepatuhan SLA Petugas (Bulanan) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0A3981]" />
              <h2 className="text-base font-extrabold text-slate-900">
                Tren Kepatuhan SLA Petugas (Bulanan)
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Persentase ketepatan waktu kunjungan dan pemantauan terhadap standar SLA 90%.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-semibold">
              Tahun: <strong>{selectedYear}</strong>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Refresh data"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/60 flex items-center gap-4 flex-wrap text-xs text-slate-700">
          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
            PETUGAS:
          </span>
          {officers.map((off) => {
            const color = OFFICER_COLORS[off.id] || { stroke: '#0A3981' };
            const isChecked = !!activeOfficers[off.id];
            return (
              <label key={off.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOfficer(off.id)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.stroke }} />
                <span className="font-medium">{off.nama.split(',')[0]}</span>
              </label>
            );
          })}
        </div>

        {/* Canvas */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MONTHLY_OFFICER_TRENDS} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis domain={[60, 100]} ticks={[60, 70, 80, 90, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} />
              <ReferenceLine
                y={90}
                stroke="#10B981"
                strokeDasharray="4 4"
                label={{ value: 'SLA Standar 90%', fill: '#059669', fontSize: 11, position: 'insideTopRight' }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1 border border-slate-700 min-w-[200px]">
                        <p className="font-bold border-b border-slate-700 pb-1">{label} {selectedYear}</p>
                        {payload.map((p, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
                            <span style={{ color: p.color }}>{p.name}:</span>
                            <span className="font-bold text-white">{p.value}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {officers.map((off) => {
                if (!activeOfficers[off.id]) return null;
                const color = OFFICER_COLORS[off.id] || { stroke: '#0A3981' };
                return (
                  <Line
                    key={off.id}
                    type="monotone"
                    dataKey={off.id}
                    name={off.nama.split(',')[0]}
                    stroke={color.stroke}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Table: Peringkat Kinerja Petugas (Tampilan Bersih & Rapi Tanpa Teks Bertumpuk) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0A3981]" />
              <h2 className="text-base font-extrabold text-slate-900">
                Evaluasi Kinerja Petugas Berbasis Data Riil
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Memisahkan jumlah korban unik dari frekuensi kunjungan pertama dan pemantauan lanjutan.
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={officerSearch}
              onChange={(e) => setOfficerSearch(e.target.value)}
              placeholder="Cari nama atau wilayah..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4 text-center w-12">RANK</th>
                <th className="py-3 px-4">NAMA PETUGAS</th>
                <th className="py-3 px-4">WILAYAH TUGAS</th>
                <th className="py-3 px-4 text-center">KORBAN UNIK</th>
                <th className="py-3 px-4 text-center">KUNJUNGAN KE-1</th>
                <th className="py-3 px-4 text-center">PANTAU LANJUTAN</th>
                <th className="py-3 px-4 text-center">KETEPATAN KUNJUNGAN</th>
                <th className="py-3 px-4 text-center">KETEPATAN PEMANTAUAN</th>
                <th className="py-3 px-4 text-center">TINDAK LANJUT</th>
                <th className="py-3 px-4 text-center">SKOR KINERJA</th>
                <th className="py-3 px-4 text-center w-24">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRanking.map((officer, idx) => (
                <tr key={officer.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 text-center">
                    <span className="w-6 h-6 rounded-md bg-[#0A3981] text-white font-extrabold text-xs inline-flex items-center justify-center shadow-2xs">
                      {idx + 1}
                    </span>
                  </td>

                  {/* Nama Petugas Bersih */}
                  <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                    {officer.nama}
                  </td>

                  {/* Wilayah Tugas */}
                  <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{officer.wilayah}</span>
                    </span>
                  </td>

                  {/* Korban Unik */}
                  <td className="py-3.5 px-4 text-center font-bold text-slate-800 whitespace-nowrap">
                    {officer.totalKorbanUnik} Korban
                  </td>

                  {/* Kunjungan Pertama */}
                  <td className="py-3.5 px-4 text-center font-semibold text-slate-700 whitespace-nowrap">
                    {officer.kunjunganPertamaCount} Kunjungan
                  </td>

                  {/* Pemantauan Lanjutan */}
                  <td className="py-3.5 px-4 text-center font-semibold text-slate-700 whitespace-nowrap">
                    {officer.totalPemantauanLanjutan} Catatan
                  </td>

                  {/* Ketepatan Kunjungan Bersih Tanpa Teks Sub */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {officer.ketepatanKunjunganPct}%
                    </span>
                  </td>

                  {/* Ketepatan Pemantauan Bersih Tanpa Teks Sub */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
                      {officer.ketepatanPemantauanPct}%
                    </span>
                  </td>

                  {/* Tindak Lanjut */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className={`font-bold ${officer.korbanButuhTindakLanjut > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
                      {officer.korbanButuhTindakLanjut} Kasus
                    </span>
                  </td>

                  {/* Skor Kinerja & Kategori */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className="font-extrabold text-slate-900 mr-1.5">
                      {officer.persentaseKinerja}%
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${officer.badgeClass}`}>
                      {officer.kategori}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => navigate(`/kabag/kinerja-petugas/${officer.id}`)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-600/40 text-blue-700 hover:bg-blue-50 font-bold text-xs transition-colors cursor-pointer"
                    >
                      <span>Detail</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Tabel Pemantauan Pasien & Korban Kecelakaan Terkini (Daftar Korban Terpadu Langsung di Dashboard) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0A3981]" />
              <h2 className="text-base font-extrabold text-slate-900">
                Pemantauan Pasien &amp; Korban Kecelakaan Terkini
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Data terpadu pasien rumah sakit dengan riwayat aktivitas lapangan petugas yang dapat diaudit langsung.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Status Pemantauan */}
            <select
              value={victimStatusFilter}
              onChange={(e) => setVictimStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">Semua Status</option>
              <option value="Pemantauan Aktif">Pemantauan Aktif</option>
              <option value="Menunggu Konfirmasi Kondisi">Menunggu Konfirmasi</option>
              <option value="Selesai Dipantau">Selesai Dipantau</option>
            </select>

            {/* Input Pencarian */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={victimSearch}
                onChange={(e) => setVictimSearch(e.target.value)}
                placeholder="Cari korban, RS, atau petugas..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white w-56"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">NAMA KORBAN</th>
                <th className="py-3 px-4">RUMAH SAKIT</th>
                <th className="py-3 px-4">TANGGAL LAKA</th>
                <th className="py-3 px-4">PETUGAS PENANGGUNG JAWAB</th>
                <th className="py-3 px-4">AKTIVITAS TERAKHIR</th>
                <th className="py-3 px-4">STATUS &amp; KONDISI</th>
                <th className="py-3 px-4 text-center">STATUS SLA</th>
                <th className="py-3 px-4 text-center w-24">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVictims.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Tidak ada korban yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredVictims.slice(0, 7).map((victim) => {
                  const firstVisitSla = calculateFirstVisitSla(victim.tanggalInformasiDiterima, victim.kunjunganPertama);
                  const monSla = calculateMonitoringSla(victim);
                  const activeSla = !victim.kunjunganPertama ? firstVisitSla : monSla;

                  return (
                    <tr key={victim.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Nama Korban Bersih */}
                      <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedVictimForDrawer(victim)}
                          className="hover:text-[#0A3981] hover:underline cursor-pointer text-left"
                        >
                          {victim.nama}
                        </button>
                      </td>

                      {/* Rumah Sakit Bersih */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {victim.rumahSakit}
                      </td>

                      {/* Tanggal Laka Bersih */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                        {formatDate(victim.tanggalKecelakaan || victim.tanggalInformasiDiterima)}
                      </td>

                      {/* Petugas Penanggung Jawab */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-800">
                        {victim.namaPetugas}
                      </td>

                      {/* Waktu Aktivitas Terakhir */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                        {victim.waktuPemantauanTerakhir
                          ? formatDate(victim.waktuPemantauanTerakhir)
                          : victim.kunjunganPertama
                          ? formatDate(victim.kunjunganPertama.tanggalKunjungan)
                          : <span className="text-rose-600 font-semibold">Belum Dikunjungi</span>}
                      </td>

                      {/* Status & Kondisi */}
                      <td className="py-3.5 px-4 whitespace-nowrap space-y-1">
                        <MonitoringStatusBadge status={victim.statusPemantauan} size="xs" />
                        <div>
                          <ConditionBadge
                            kondisi={victim.kondisiTerakhir}
                            statusKonfirmasi={victim.statusKonfirmasiKondisi}
                            size="xs"
                          />
                        </div>
                      </td>

                      {/* Status SLA */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <SlaBadge slaInfo={activeSla} />
                      </td>

                      {/* Tombol Aksi Detail */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedVictimForDrawer(victim)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-600/40 text-blue-700 hover:bg-blue-50 font-bold text-xs transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Audit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Aktivitas Mendesak yang Memerlukan Perhatian Kepala Bagian */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-rose-600" />
              <h2 className="text-base font-extrabold text-slate-900">
                Aktivitas Mendesak yang Memerlukan Perhatian Kepala Bagian
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Kasus dengan keterlambatan batas waktu SLA, prioritas santunan korban meninggal dunia, atau pemantauan tertunda.
            </p>
          </div>

          <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            <span>{urgentCases.length} Kasus Perlu Tindakan</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">NAMA KORBAN</th>
                <th className="py-3 px-4">RUMAH SAKIT</th>
                <th className="py-3 px-4">PETUGAS PENANGGUNG JAWAB</th>
                <th className="py-3 px-4">KATEGORI MASALAH</th>
                <th className="py-3 px-4 text-center">STATUS URGENSI</th>
                <th className="py-3 px-4 text-center">TINDAKAN KEPALA BAGIAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {urgentCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Seluruh kasus terkendali dan tidak ada kasus mendesak yang memerlukan intervensi.
                  </td>
                </tr>
              ) : (
                urgentCases.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedVictimForDrawer(item.victimObj)}
                        className="hover:text-[#0A3981] hover:underline cursor-pointer"
                      >
                        {item.namaKorban}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap text-xs">
                      {item.rs}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 font-extrabold text-xs flex items-center justify-center shrink-0">
                          {item.petugasInisial}
                        </div>
                        <span className="font-bold text-slate-900 text-xs">
                          {item.petugasNama}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-bold text-rose-700 block text-xs">
                        {item.kategoriMasalah}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${item.urgensiColor}`}>
                        {item.urgensi}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleAction(item)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${item.actionStyle}`}
                      >
                        {item.actionText}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer Detail Korban untuk Audit Lapangan Lengkap */}
      {selectedVictimForDrawer && (
        <VictimDetailDrawer
          isOpen={!!selectedVictimForDrawer}
          onClose={() => setSelectedVictimForDrawer(null)}
          victim={selectedVictimForDrawer}
        />
      )}

      {/* Action Modal untuk Intervensi Kabag */}
      {activeModal && (
        <Modal
          isOpen={!!activeModal}
          onClose={() => setActiveModal(null)}
          title={`Intervensi Kepala Bagian: ${activeModal.type}`}
          subtitle={`Korban: ${activeModal.item.namaKorban} • Petugas: ${activeModal.item.petugasNama}`}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleModalSubmit} className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-800 block">Masalah Terdeteksi:</span>
              <p className="text-rose-700 font-semibold">{activeModal.item.kategoriMasalah}</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Instruksi Resmi Kepala Bagian untuk Petugas
              </label>
              <textarea
                rows={3}
                required
                defaultValue={
                  activeModal.type.includes('Tegur')
                    ? `Perhatian: Batas waktu SLA kunjungan pertama 72 jam telah terlampaui. Segera lakukan kunjungan ke ${activeModal.item.rs} dan laporkan bukti foto serta GPS hari ini.`
                    : activeModal.type.includes('Percepat')
                    ? `Lakukan koordinasi jemput bola dokumen ahli waris untuk penuntasan santunan meninggal dunia Rp50.000.000,- segera.`
                    : `Mohon segera perbarui rekam medis dan kondisi pemantauan pasien di ${activeModal.item.rs}.`
                }
                className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0A3981] hover:bg-blue-900 text-white font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim Instruksi</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
