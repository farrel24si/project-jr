import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Users, 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Search, 
  ChevronRight, 
  Calendar, 
  Download, 
  Filter,
  BarChart3,
  RotateCcw,
  Activity,
  MapPin,
  HelpCircle,
  Check,
  Eye
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
import { performanceService, MONTHLY_OFFICER_TRENDS, OFFICER_COLORS } from '../../services/performanceService';

export default function KabagOfficerPerformance() {
  const navigate = useNavigate();

  // Filters state
  const [selectedYear, setSelectedYear] = useState('2024');
  const [selectedMonth, setSelectedMonth] = useState('ALL'); // ALL, Jan, Feb, etc.
  const [selectedPeriod, setSelectedPeriod] = useState('ALL'); // ALL, S1, S2, Q1, Q2, Q3, Q4
  const [officerSearch, setOfficerSearch] = useState('');

  // Selected officers to compare in line chart
  const [selectedOfficersForChart, setSelectedOfficersForChart] = useState({
    'PET-01': true,
    'PET-02': true,
    'PET-03': true,
    'PET-04': true,
    'PET-05': true,
    'PET-06': true
  });

  const toggleOfficerChart = (id) => {
    setSelectedOfficersForChart((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const selectAllOfficers = () => {
    setSelectedOfficersForChart({
      'PET-01': true,
      'PET-02': true,
      'PET-03': true,
      'PET-04': true,
      'PET-05': true,
      'PET-06': true
    });
  };

  const deselectAllOfficers = () => {
    setSelectedOfficersForChart({
      'PET-01': false,
      'PET-02': false,
      'PET-03': false,
      'PET-04': false,
      'PET-05': false,
      'PET-06': false
    });
  };

  // Officer comparison dataset
  const officersData = useMemo(() => {
    return performanceService.getOfficersComparison(selectedYear, selectedPeriod, selectedMonth);
  }, [selectedYear, selectedPeriod, selectedMonth]);

  // Filtered by search
  const filteredOfficers = useMemo(() => {
    return officersData.filter((off) => 
      off.nama.toLowerCase().includes(officerSearch.toLowerCase()) ||
      off.nip.toLowerCase().includes(officerSearch.toLowerCase()) ||
      off.wilayah.toLowerCase().includes(officerSearch.toLowerCase())
    );
  }, [officersData, officerSearch]);

  // Filter monthly data by period and month
  const displayMonthlyData = useMemo(() => {
    let data = MONTHLY_OFFICER_TRENDS;
    if (selectedPeriod === 'Q1') data = MONTHLY_OFFICER_TRENDS.slice(0, 3);
    else if (selectedPeriod === 'Q2') data = MONTHLY_OFFICER_TRENDS.slice(3, 6);
    else if (selectedPeriod === 'Q3') data = MONTHLY_OFFICER_TRENDS.slice(6, 9);
    else if (selectedPeriod === 'Q4') data = MONTHLY_OFFICER_TRENDS.slice(9, 12);
    else if (selectedPeriod === 'S1') data = MONTHLY_OFFICER_TRENDS.slice(0, 6);
    else if (selectedPeriod === 'S2') data = MONTHLY_OFFICER_TRENDS.slice(6, 12);

    if (selectedMonth !== 'ALL') {
      const match = data.find((d) => d.bulan.toLowerCase() === selectedMonth.toLowerCase());
      if (match) return [match];
    }

    return data;
  }, [selectedPeriod, selectedMonth]);

  const monthNames = [
    { key: 'ALL', label: 'Semua Bulan' },
    { key: 'Jan', label: 'Januari' },
    { key: 'Feb', label: 'Februari' },
    { key: 'Mar', label: 'Maret' },
    { key: 'Apr', label: 'April' },
    { key: 'Mei', label: 'Mei' },
    { key: 'Jun', label: 'Juni' },
    { key: 'Jul', label: 'Juli' },
    { key: 'Agu', label: 'Agustus' },
    { key: 'Sep', label: 'September' },
    { key: 'Okt', label: 'Oktober' },
    { key: 'Nov', label: 'November' },
    { key: 'Des', label: 'Desember' }
  ];

  return (
    <div className="space-y-6">
      {/* 1. Page Header with Period Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Monitoring Kinerja Petugas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pantau perkembangan dan bandingkan kinerja petugas berdasarkan aktivitas kunjungan serta tindak lanjut korban kecelakaan.
          </p>
        </div>

        {/* 1. Filter Periode Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Tahun */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg pl-8 pr-7 py-2 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs cursor-pointer"
            >
              <option value="2024">Tahun 2024</option>
              <option value="2025">Tahun 2025</option>
              <option value="2026">Tahun 2026</option>
            </select>
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Filter Bulan */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-2 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs cursor-pointer"
          >
            {monthNames.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>

          {/* Filter Rentang Evaluasi */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-2 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs cursor-pointer"
          >
            <option value="ALL">Rentang: 12 Bulan Penuh</option>
            <option value="S1">Semester 1 (Jan - Jun)</option>
            <option value="S2">Semester 2 (Jul - Des)</option>
            <option value="Q1">Kuartal 1 (Jan - Mar)</option>
            <option value="Q2">Kuartal 2 (Apr - Jun)</option>
            <option value="Q3">Kuartal 3 (Jul - Sep)</option>
            <option value="Q4">Kuartal 4 (Okt - Des)</option>
          </select>

          {/* Export Laporan */}
          <button
            type="button"
            onClick={() => alert(`Mengekspor Laporan Kinerja Petugas (${selectedYear} - ${selectedPeriod})...`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-[#072B62] text-white shadow-xs transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Laporan</span>
          </button>
        </div>
      </div>

      {/* 2. Card Rata-rata Kinerja per Petugas (Individu) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#0A3981]" />
              Rata-rata Kinerja Petugas ({filteredOfficers.length} Petugas)
            </h2>
            <p className="text-[11px] text-slate-500">
              Evaluasi kepatuhan batas waktu SLA 72 jam, beban penugasan korban, dan ketertiban pemantauan medis.
            </p>
          </div>

          <div className="relative self-start sm:self-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={officerSearch}
              onChange={(e) => setOfficerSearch(e.target.value)}
              placeholder="Cari nama atau NIP..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white w-52"
            />
          </div>
        </div>

        {/* Grid of Individual Officer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOfficers.map((officer, idx) => {
            const rank = idx + 1;
            const officerColor = OFFICER_COLORS[officer.id] || { stroke: '#0A3981' };

            return (
              <div 
                key={officer.id}
                onClick={() => navigate(`/kabag/kinerja-petugas/${officer.id}`)}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all p-4 flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  {/* Card Header: Avatar, Name, Rank, and Trend */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: officerColor.stroke }}
                      >
                        {officer.avatar || 'JR'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-sm text-slate-900 truncate group-hover:text-[#0A3981] transition-colors leading-tight">
                          {officer.nama}
                        </h3>
                        <p className="text-[11px] text-slate-600 font-semibold truncate flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{officer.wilayah}</span>
                        </p>
                      </div>
                    </div>

                    {/* Rank Badge */}
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#0A3981] text-white font-black text-xs shadow-2xs">
                        #{rank}
                      </span>
                      <div className="mt-1">
                        {officer.tren === 'Meningkat' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                            <TrendingUp className="w-3 h-3" />
                            <span>+{officer.trenDiff}%</span>
                          </span>
                        )}
                        {officer.tren === 'Menurun' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">
                            <TrendingDown className="w-3 h-3" />
                            <span>{officer.trenDiff}%</span>
                          </span>
                        )}
                        {officer.tren === 'Stabil' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-500 bg-slate-50 px-1 py-0.5 rounded border border-slate-200">
                            <Minus className="w-3 h-3" />
                            <span>Stabil</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar Persentase Ketepatan Waktu Kunjungan */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        Ketepatan Waktu SLA
                      </span>
                      <span className="font-black text-sm text-slate-900">
                        {officer.isSufficientData ? `${officer.persentaseKinerja}%` : 'Data Belum Cukup'}
                      </span>
                    </div>

                    {officer.isSufficientData ? (
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            officer.persentaseKinerja >= 90 
                              ? 'bg-emerald-600' 
                              : officer.persentaseKinerja >= 80 
                              ? 'bg-amber-500' 
                              : 'bg-rose-600'
                          }`}
                          style={{ width: `${Math.min(officer.persentaseKinerja, 100)}%` }}
                        />
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">
                        Data belum cukup untuk evaluasi representatif.
                      </p>
                    )}
                  </div>

                  {/* Distinct Indicators: Korban Unik, Kunjungan 1, Pemantauan Lanjutan, Tindak Lanjut */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Korban Unik</span>
                      <span className="font-bold text-slate-800 text-xs">{officer.totalKorbanUnik || officer.totalKorban} Korban</span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-emerald-700 uppercase font-bold block">Kunjungan Ke-1</span>
                      <span className="font-bold text-emerald-700 text-xs">{officer.kunjunganPertamaCount} ({officer.ketepatanKunjunganPct}% Tepat)</span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-blue-700 uppercase font-bold block">Pantau Lanjutan</span>
                      <span className="font-bold text-blue-700 text-xs">{officer.totalPemantauanLanjutan} ({officer.ketepatanPemantauanPct}% Tepat)</span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-amber-800 uppercase font-bold block">Perlu Tindak Lanjut</span>
                      <span className={`font-bold text-xs ${officer.korbanButuhTindakLanjut > 0 ? 'text-amber-800 font-bold' : 'text-slate-500'}`}>
                        {officer.korbanButuhTindakLanjut} Korban
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Button: Lihat Detail */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${officer.badgeClass}`}>
                    {officer.kategori}
                  </span>

                  <Link
                    to={`/kabag/kinerja-petugas/${officer.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#0A3981] group-hover:underline"
                  >
                    <span>Lihat Detail</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Grafik Garis Perbandingan Kinerja Bulanan (Recharts) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        {/* Header of Chart */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0A3981]" />
              <h2 className="text-base font-extrabold text-slate-900">
                Grafik Perbandingan Kinerja Bulanan Petugas
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Sumbu X menampilkan bulan dan Sumbu Y menampilkan persentase ketepatan waktu kunjungan terhadap tenggat SLA.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
            <button
              type="button"
              onClick={selectAllOfficers}
              className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold"
            >
              Pilih Semua
            </button>
            <button
              type="button"
              onClick={deselectAllOfficers}
              className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold"
            >
              Hapus Semua
            </button>
          </div>
        </div>

        {/* Checkbox Legenda Petugas */}
        <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200/60 flex items-center gap-4 flex-wrap text-xs text-slate-700">
          <span className="font-bold text-[10px] uppercase tracking-wider text-slate-500">
            TAMPILKAN PETUGAS:
          </span>

          {officersData.map((off) => {
            const color = OFFICER_COLORS[off.id] || { stroke: '#0A3981' };
            const isChecked = !!selectedOfficersForChart[off.id];

            return (
              <label key={off.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOfficerChart(off.id)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: color.stroke }}
                />
                <span className={`text-xs ${isChecked ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                  {off.nama.split(',')[0]}
                </span>
              </label>
            );
          })}
        </div>

        {/* Recharts Container */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayMonthlyData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
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
              {/* Garis Referensi Standar SLA 90% */}
              <ReferenceLine
                y={90}
                stroke="#059669"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: 'Standar SLA 90%', fill: '#059669', fontSize: 10, position: 'insideTopRight' }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1.5 border border-slate-700 min-w-[220px]">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                          <span className="font-bold">{label} {selectedYear}</span>
                          <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 rounded font-bold">
                            Evaluasi SLA
                          </span>
                        </div>
                        {payload.map((p, idx) => {
                          const offInfo = officersData.find((o) => o.id === p.dataKey);
                          return (
                            <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                <span className="text-slate-300">{offInfo?.nama?.split(',')[0] || p.name}:</span>
                              </span>
                              <span className="font-bold text-white">{p.value}%</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {/* Lines for each selected officer */}
              {officersData.map((off) => {
                if (!selectedOfficersForChart[off.id]) return null;
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
    </div>
  );
}
