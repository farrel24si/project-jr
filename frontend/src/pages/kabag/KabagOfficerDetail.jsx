import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Activity, 
  ShieldCheck, 
  Search, 
  Eye, 
  Building2,
  AlertTriangle,
  RotateCcw
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
import { performanceService, OFFICER_COLORS } from '../../services/performanceService';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';

export default function KabagOfficerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Load officer detailed dataset
  const officerDetail = useMemo(() => {
    return performanceService.getOfficerDetail(id || 'PET-01');
  }, [id]);

  const [victimSearch, setVictimSearch] = useState('');
  const [victimStatusFilter, setVictimStatusFilter] = useState('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [selectedVictimForDrawer, setSelectedVictimForDrawer] = useState(null);

  if (!officerDetail || !officerDetail.officer) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-slate-600 font-semibold">Petugas tidak ditemukan dalam sistem.</p>
        <Link
          to="/kabag/kinerja"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0A3981] text-white rounded-lg text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Monitoring Kinerja</span>
        </Link>
      </div>
    );
  }

  const { officer, metrics, victims, monthlyTrends, timelineActivities, evaluasi } = officerDetail;
  const officerColor = OFFICER_COLORS[officer.id] || { stroke: '#0A3981' };

  // Filtered victims table
  const filteredVictims = useMemo(() => {
    return victims.filter((v) => {
      const matchSearch =
        v.nama.toLowerCase().includes(victimSearch.toLowerCase()) ||
        (v.id || '').toLowerCase().includes(victimSearch.toLowerCase()) ||
        (v.lokasiKejadian || '').toLowerCase().includes(victimSearch.toLowerCase()) ||
        v.rumahSakit.toLowerCase().includes(victimSearch.toLowerCase());

      if (!matchSearch) return false;

      if (victimStatusFilter !== 'ALL') {
        const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        if (victimStatusFilter === 'TEPAT' && (!v.kunjunganPertama || firstSla.wasLate)) return false;
        if (victimStatusFilter === 'TERLAMBAT' && (!firstSla.isOverdue && !firstSla.wasLate)) return false;
        if (victimStatusFilter === 'BELUM' && !!v.kunjunganPertama) return false;
      }

      return true;
    });
  }, [victims, victimSearch, victimStatusFilter]);

  // Format Helper
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Navigation Back Button */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/kabag/kinerja"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3.5 py-2 rounded-lg shadow-2xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Kembali ke Monitoring Kinerja Petugas</span>
        </Link>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Periode Evaluasi:</span>
          <span className="font-bold text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-md">
            Tahun 2024 (YTD)
          </span>
        </div>
      </div>

      {/* 2. Identitas Petugas Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Avatar & Main Info */}
          <div className="flex items-center gap-4">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-xl text-white shadow-md shrink-0"
              style={{ backgroundColor: officerColor.stroke }}
            >
              {officer.avatar || 'JR'}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  {officer.nama}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  {officer.status || 'Aktif Lapangan'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1 font-medium">
                <span className="font-mono text-slate-700">NIP. {officer.nip}</span>
                <span>•</span>
                <span>{officer.jabatan || 'Mobile Service Officer'}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {officer.wilayah}
                </span>
              </div>
            </div>
          </div>

          {/* Contact Details & Plotting RS */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 text-xs">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 min-w-[180px]">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Plotting Rumah Sakit Rujukan
              </span>
              <div className="space-y-0.5">
                {(officer.plottingRs || ['RSUP Dr. Cipto Mangunkusumo', 'RS Polri']).map((rs, idx) => (
                  <p key={idx} className="font-semibold text-slate-800 text-[11px] truncate">
                    • {rs}
                  </p>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 min-w-[160px]">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Kontak Operasional
              </span>
              <p className="font-mono text-slate-800 text-[11px] flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" /> {officer.telepon || '0812-3456-7890'}
              </p>
              <p className="text-slate-600 text-[11px] truncate flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3 text-slate-400" /> {officer.email || 'petugas@jasaraharja.co.id'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Ringkasan Kinerja Individu: Memisahkan Kuantitas Korban & Kualitas Evaluasi SLA */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Korban Unik Ditangani */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            KORBAN UNIK
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">{metrics.totalKorbanUnik || metrics.totalKorban}</span>
            <span className="text-xs text-slate-400">Jiwa</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Pasien terdaftar</span>
        </div>

        {/* Kunjungan Pertama */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            KUNJUNGAN KE-1
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">{metrics.kunjunganPertamaCount}</span>
            <span className="text-xs text-emerald-700 font-bold">{metrics.ketepatanKunjunganPct}%</span>
          </div>
          <span className="text-[10px] text-emerald-700 mt-1 block">Ketepatan SLA 1st</span>
        </div>

        {/* Pemantauan Lanjutan */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            PANTAU LANJUTAN
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">{metrics.totalPemantauanLanjutan}</span>
            <span className="text-xs text-blue-700 font-bold">{metrics.ketepatanPemantauanPct}%</span>
          </div>
          <span className="text-[10px] text-blue-700 mt-1 block">Ketepatan SLA Pantau</span>
        </div>

        {/* Total Seluruh Aktivitas */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            TOTAL AKTIVITAS
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">
              {metrics.totalSeluruhAktivitas || (metrics.kunjunganPertamaCount + metrics.totalPemantauanLanjutan)}
            </span>
            <span className="text-xs text-slate-400">Kegiatan</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Kunjungan + pantau</span>
        </div>

        {/* Kualitas Kinerja (Persentase SLA) */}
        <div className="bg-white rounded-xl border border-blue-200 p-3.5 shadow-2xs bg-blue-50/20">
          <span className="text-[10px] font-bold text-[#0A3981] uppercase tracking-wider block">
            KUALITAS SLA
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#0A3981]">{metrics.persentaseKinerja}%</span>
            <span className="text-xs text-blue-700">Target 90%</span>
          </div>
          <span className="text-[10px] text-blue-700 mt-1 block">Indeks Kinerja</span>
        </div>

        {/* Perlu Tindak Lanjut */}
        <div className="bg-white rounded-xl border border-amber-200 p-3.5 shadow-2xs bg-amber-50/20">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
            TINDAK LANJUT
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-800">{metrics.korbanButuhTindakLanjut}</span>
            <span className="text-xs text-amber-700">Korban</span>
          </div>
          <span className="text-[10px] text-amber-700 mt-1 block">Status aktif / pantau</span>
        </div>
      </div>

      {/* 4. Main Section: Grafik Perkembangan 12 Bulan & Evaluasi Analitis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grafik Perkembangan Kinerja Individu — col-span 2 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#0A3981]" />
                Perkembangan Kinerja Petugas (12 Bulan)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tren persentase ketepatan waktu kunjungan bulanan dibandingkan standar SLA 90%.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="bg-slate-100 font-semibold text-slate-700 px-2 py-1 rounded">
                Tahun 2024
              </span>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrends} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis 
                  dataKey="bulan" 
                  tickLine={false} 
                  axisLine={{ stroke: '#CBD5E1' }}
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
                />
                <YAxis 
                  domain={[60, 100]} 
                  tickCount={5} 
                  tickLine={false} 
                  axisLine={{ stroke: '#CBD5E1' }}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={(val) => `${val}%`}
                />
                <ReferenceLine 
                  y={90} 
                  stroke="#059669" 
                  strokeDasharray="4 4" 
                  strokeWidth={1.5}
                  label={{ value: 'Target SLA 90%', fill: '#059669', fontSize: 10, position: 'insideTopRight' }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-lg text-xs space-y-1">
                          <p className="font-bold border-b border-slate-700 pb-1">{label} 2024</p>
                          <p className="text-blue-300 font-semibold">
                            Ketepatan Waktu: <span className="text-white font-bold">{payload[0]?.value}%</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="kinerja"
                  name={officer.nama}
                  stroke={officerColor.stroke}
                  strokeWidth={3}
                  dot={{ r: 4, fill: officerColor.stroke }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Evaluasi Kinerja Berbasis Data — col-span 1 */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Evaluasi Kinerja Berbasis Data
            </h2>

            <div className="space-y-3 mt-3 text-xs">
              <div className="bg-emerald-50/60 border border-emerald-200/70 p-3 rounded-lg">
                <span className="font-bold text-emerald-900 uppercase text-[10px] block mb-0.5">
                  Kekuatan Kinerja
                </span>
                <p className="text-emerald-800 leading-relaxed font-medium">
                  {evaluasi.kekuatan}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                <span className="font-bold text-slate-700 uppercase text-[10px] block mb-0.5">
                  Catatan Kunjungan Terlambat
                </span>
                <p className="text-slate-600 leading-relaxed">
                  {evaluasi.catatanKeterlambatan}
                </p>
              </div>

              <div className="bg-amber-50/60 border border-amber-200/70 p-3 rounded-lg">
                <span className="font-bold text-amber-900 uppercase text-[10px] block mb-0.5">
                  Pemantauan Berkala
                </span>
                <p className="text-amber-800 leading-relaxed">
                  {evaluasi.catatanPemantauan}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Rata-rata respons kunjungan:</span>
            <span className="font-bold text-slate-900">{metrics.rataRataJam} Jam</span>
          </div>
        </div>
      </div>

      {/* 5. Rincian Aktivitas Petugas (Tabel Korban Ditangani) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Header & Search */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Daftar Korban yang Ditangani Petugas
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Klik nama korban untuk membuka riwayat verifikasi, bukti foto, dan koordinat satelit GPS.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto text-xs">
            {/* Filter Status SLA */}
            <select
              value={victimStatusFilter}
              onChange={(e) => setVictimStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700"
            >
              <option value="ALL">Semua Status SLA</option>
              <option value="TEPAT">Tepat Waktu</option>
              <option value="TERLAMBAT">Terlambat</option>
              <option value="BELUM">Belum Dikunjungi</option>
            </select>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={victimSearch}
                onChange={(e) => setVictimSearch(e.target.value)}
                placeholder="Cari korban atau RS..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white w-48 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">NAMA KORBAN</th>
                <th className="py-3 px-4">RUMAH SAKIT</th>
                <th className="py-3 px-4">INFO DITERIMA</th>
                <th className="py-3 px-4">AKTIVITAS TERAKHIR</th>
                <th className="py-3 px-4">STATUS &amp; KONDISI</th>
                <th className="py-3 px-4 text-center">STATUS SLA</th>
                <th className="py-3 px-4 text-center w-24">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVictims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Tidak ada korban yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredVictims.map((v) => {
                  const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
                  const monSla = calculateMonitoringSla(v);
                  const activeSla = !v.kunjunganPertama ? firstSla : monSla;

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Nama */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedVictimForDrawer(v)}
                          className="hover:text-[#0A3981] hover:underline cursor-pointer"
                        >
                          {v.nama}
                        </button>
                      </td>

                      {/* Rumah Sakit */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {v.rumahSakit}
                      </td>

                      {/* Info Diterima */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium text-xs">
                        {formatDateTime(v.tanggalInformasiDiterima)}
                      </td>

                      {/* Waktu Kunjungan / Pemantauan Terakhir */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        {v.kunjunganPertama ? (
                          <span className="text-emerald-700 font-semibold block">
                            {formatDateTime(v.waktuPemantauanTerakhir || v.kunjunganPertama.tanggalKunjungan)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Belum dikunjungi</span>
                        )}
                      </td>

                      {/* Status Pemantauan & Kondisi Korban */}
                      <td className="py-3.5 px-4 space-y-1 whitespace-nowrap">
                        <MonitoringStatusBadge status={v.statusPemantauan} size="xs" />
                        <div>
                          <ConditionBadge kondisi={v.kondisiTerakhir} statusKonfirmasi={v.statusKonfirmasiKondisi} size="xs" />
                        </div>
                      </td>

                      {/* Status SLA */}
                      <td className="py-3 px-4 text-center">
                        <SlaBadge slaInfo={activeSla} />
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedVictimForDrawer(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold text-[#0A3981] border border-blue-200 hover:bg-blue-50"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Detail</span>
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

      {/* 6. Riwayat Aktivitas & Timeline Kronologis Petugas */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0A3981]" />
              Riwayat Kunjungan dan Pemantauan Petugas
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Catatan kronologis aktivitas lapangan petugas dari informasi diterima hingga penuntasan santunan.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {timelineActivities.length} Riwayat Tercatat
          </span>
        </div>

        {timelineActivities.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">Belum ada aktivitas tercatat pada periode ini.</p>
        ) : (
          <div className="relative pl-7 space-y-5 pt-2">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />

            {timelineActivities.slice(0, 8).map((act) => (
              <div key={act.id} className="relative">
                <div className={`absolute -left-7 top-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-xs ${
                  act.tipe === 'KUNJUNGAN_LAPANGAN' ? 'bg-emerald-100 text-emerald-700' :
                  act.tipe === 'INFORMASI_DITERIMA' ? 'bg-blue-100 text-[#0A3981]' :
                  'bg-sky-100 text-sky-700'
                }`}>
                  {act.tipe === 'KUNJUNGAN_LAPANGAN' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                   act.tipe === 'INFORMASI_DITERIMA' ? <FileText className="w-3.5 h-3.5" /> :
                   <Activity className="w-3.5 h-3.5" />}
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{act.judul}</span>
                    <span className="font-mono text-[11px] text-slate-400">{formatDateTime(act.waktu)}</span>
                  </div>
                  <p className="text-slate-600">
                    Kasus: <strong className="text-slate-800">{act.korbanNama}</strong> ({act.rs})
                  </p>
                  <p className="text-[11px] text-slate-500">{act.deskripsi}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Victim Detail Drawer for checking evidence foto/GPS */}
      {selectedVictimForDrawer && (
        <VictimDetailDrawer
          isOpen={!!selectedVictimForDrawer}
          onClose={() => setSelectedVictimForDrawer(null)}
          victim={selectedVictimForDrawer}
        />
      )}
    </div>
  );
}
