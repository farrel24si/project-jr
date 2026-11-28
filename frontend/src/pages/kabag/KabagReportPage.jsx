import { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Filter
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla, evaluateOfficerKpi } from '../../services/slaService';
import { isVictimFinished } from '../../utils/monitoringStatus';
import { formatDateIndo, parseDateSafe } from '../../utils/dateUtils';
import { api } from '../../services/api';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function KabagReportPage({ embedded = false }) {
  const { currentUser } = useAuth();

  const currentYearNum = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth();

  const [victims, setVictims] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState(currentYearNum);
  const [apiUserData, setApiUserData] = useState(null);

  // Ambil profil user aktual yang sedang login secara dinamis dari API & session
  useEffect(() => {
    let isMounted = true;
    api.getMe().then((res) => {
      if (isMounted && res) {
        setApiUserData(res);
      }
    }).catch(() => { });
    return () => { isMounted = false; };
  }, []);

  // Resolusi data Kabag secara dinamis murni dari data pengguna aktif (tanpa nama hardcode)
  const resolvedKabag = useMemo(() => {
    const profile = currentUser?.profile || storageService.getCurrentUser()?.profile || {};
    const rawUser = currentUser || storageService.getCurrentUser() || {};

    const nama = (
      apiUserData?.nama ||
      apiUserData?.name ||
      profile.nama ||
      profile.name ||
      rawUser.nama ||
      rawUser.name ||
      apiUserData?.username ||
      profile.username ||
      rawUser.username ||
      'Kepala Bagian Operasional'
    );

    const nip = (
      apiUserData?.nip ||
      profile.nip ||
      rawUser.nip ||
      ''
    );

    const jabatan = (
      apiUserData?.jabatan ||
      profile.jabatan ||
      rawUser.jabatan ||
      'Kepala Bagian Operasional'
    );

    const wilayah = (
      apiUserData?.wilayah ||
      profile.wilayah ||
      rawUser.wilayah ||
      'Kantor Wilayah Riau'
    );

    return { nama, nip, jabatan, wilayah };
  }, [apiUserData, currentUser]);

  // Filter out any dummy names if present
  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const loadData = () => {
    setVictims(storageService.getVictims() || []);
    setOfficers(filterValidOfficers(storageService.getOfficers()) || []);
  };

  useEffect(() => {
    storageService.syncWithBackend(true).catch(() => { });
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    window.addEventListener('jr_officers_updated', loadData);
    return () => {
      window.removeEventListener('jr_victims_updated', loadData);
      window.removeEventListener('jr_officers_updated', loadData);
    };
  }, []);

  // Available years from data
  const availableYears = useMemo(() => {
    const yearsSet = new Set([currentYearNum, currentYearNum - 1, currentYearNum - 2, currentYearNum + 1]);
    victims.forEach((v) => {
      const dates = [
        v.tanggalInformasiDiterima,
        v.tanggalMasukRs,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuAktualKunjungan || a.waktuSelesai),
        ...(v.riwayatKunjungan || []).map((k) => k.tanggalKunjungan || k.tanggal || k.waktuAktualKunjungan)
      ];
      dates.forEach((dStr) => {
        const d = parseDateSafe(dStr);
        if (d) yearsSet.add(d.getFullYear());
      });
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [victims, currentYearNum]);

  // Check if victim is finished
  const checkIsFinished = (v) => {
    const cond = (v.kondisiTerakhir || '').toLowerCase();
    const st = (v.statusPemantauan || '').toLowerCase();
    return (
      cond.includes('pulang') ||
      cond.includes('meninggal') ||
      cond.includes('selesai') ||
      st.includes('selesai') ||
      isVictimFinished(v)
    );
  };

  // Filter victims based on chosen month & year
  const periodVictims = useMemo(() => {
    const targetMonth = Number(selectedMonth);
    const targetYear = Number(selectedYear);

    return victims.filter((v) => {
      const dates = [
        v.tanggalInformasiDiterima,
        v.tanggalMasukRs,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuAktualKunjungan || a.waktuSelesai),
        ...(v.riwayatKunjungan || []).map((k) => k.tanggalKunjungan || k.tanggal || k.waktuAktualKunjungan)
      ].filter(Boolean);

      if (dates.length === 0) return true;

      return dates.some((dStr) => {
        const d = parseDateSafe(dStr);
        return d && d.getFullYear() === targetYear && d.getMonth() === targetMonth;
      });
    });
  }, [victims, selectedMonth, selectedYear]);

  // 1. DAFTAR KORBAN YANG PERLU DITINDAKLANJUTI
  // Strictly only victims with overdue visits or pending SLA requirements (excludes finished victims)
  const overdueVictims = useMemo(() => {
    return periodVictims.filter((v) => {
      // Jangan memasukkan korban berstatus Selesai
      if (checkIsFinished(v)) return false;

      // 1. Kunjungan Pertama: belum ada kunjungan dan sudah melewati SLA 72 jam
      const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      if (!v.kunjunganPertama) {
        if (firstSla.isOverdue) {
          v._overdueReason = `Kunjungan awal terlambat ${Math.abs(firstSla.diffHours || 72)} jam`;
          return true;
        }
        // Jika belum ada kunjungan sama sekali tapi sudah mendekati atau butuh tindakan
        if (firstSla.isWarning) {
          v._overdueReason = `Menunggu kunjungan awal (${firstSla.description})`;
          return true;
        }
      }

      // 2. Pemantauan Lanjutan: sudah ada kunjungan pertama, evaluasi monitoring interval
      const monSla = calculateMonitoringSla(v);
      if (monSla.isOverdue) {
        v._overdueReason = monSla.description || 'Pemantauan berkala terlambat (> 3 hari)';
        return true;
      }

      // 3. Status eksplisit tindak lanjut
      if (v.isOverdue || v.slaStatus === 'TERLAMBAT') {
        v._overdueReason = v.slaDescription || 'Melewati batas waktu SLA tindak lanjut';
        return true;
      }

      if (v.masihPerluTindakLanjut && (monSla.isWarning || v.statusTindakLanjut === 'Perlu Pemantauan Lanjutan')) {
        v._overdueReason = 'Menunggu pelaksanaan tindak lanjut berkala';
        return true;
      }

      return false;
    });
  }, [periodVictims]);

  // 2. PERINGKAT KINERJA PETUGAS
  // Diurutkan berdasarkan penilaian KPI dan SLA yang sebenarnya (sinkron dengan Dashboard & Kinerja Petugas).
  const officerRankings = useMemo(() => {
    const list = officers.map((off) => {
      const assignedVictims = periodVictims.filter((v) =>
        storageService.isOfficerAssignedToVictim(off, v, officers)
      );
      const kpi = evaluateOfficerKpi(assignedVictims, new Date(), 90, 30, off);

      const jumlahKorbanDitangani = assignedVictims.length;
      const jumlahKunjungan = kpi.totalKunjungan;
      const tepatWaktu = kpi.kunjunganTepat;
      const terlambat = kpi.kunjunganTerlambat;
      const persentaseSla = kpi.slaKunjungan;
      const ketepatanWaktuKunjungan = terlambat > 0
        ? `${tepatWaktu} Tepat (${terlambat} Terlambat)`
        : `${tepatWaktu} Tepat Waktu`;

      return {
        id: off.id,
        nama: off.nama,
        wilayah: off.wilayah,
        jumlahKorbanDitangani,
        jumlahKunjungan,
        tepatWaktu,
        terlambat,
        ketepatanWaktuKunjungan,
        persentaseSla
      };
    });

    // Urutkan berdasarkan SLA & ketepatan (jumlah korban hanya informasi beban kerja)
    list.sort((a, b) => (b.persentaseSla ?? -1) - (a.persentaseSla ?? -1) || b.tepatWaktu - a.tepatWaktu || b.jumlahKunjungan - a.jumlahKunjungan);

    let rankCounter = 0;
    return list.map((item) => ({
      ...item,
      peringkat: item.jumlahKorbanDitangani > 0 ? ++rankCounter : '-'
    }));
  }, [officers, periodVictims, selectedMonth, selectedYear]);

  // 3. RINGKASAN LAPORAN
  const summaryReport = useMemo(() => {
    const totalKorban = periodVictims.length;
    let totalKunjungan = 0;
    let selesai = 0;

    const targetMonth = Number(selectedMonth);
    const targetYear = Number(selectedYear);

    periodVictims.forEach((v) => {
      if (checkIsFinished(v)) {
        selesai++;
      }

      // Hitung kunjungan pertama pada periode
      if (v.kunjunganPertama) {
        const visitDate = v.kunjunganPertama.tanggalKunjungan || v.kunjunganPertama.waktuAktualKunjungan || v.kunjunganPertama.tanggal;
        const d = parseDateSafe(visitDate);
        if (d && d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
          totalKunjungan++;
        }
      }

      // Hitung pemantauan berkala pada periode
      const acts = [...(v.riwayatAktivitas || []), ...(v.riwayatKunjungan || [])];
      acts.forEach((a) => {
        if (a.jenisAktivitas !== 'Kunjungan Pertama' && a.kunjunganKe !== 1) {
          const actDate = a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || a.waktuSelesai;
          const d = parseDateSafe(actDate);
          if (d && d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
            totalKunjungan++;
          }
        }
      });
    });

    return {
      totalKorban,
      totalKunjungan,
      perluTindakLanjut: overdueVictims.length,
      selesai
    };
  }, [periodVictims, overdueVictims, selectedMonth, selectedYear]);

  const currentDateFormatted = useMemo(() => {
    return formatDateIndo(new Date());
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 print:space-y-0 ${embedded ? '' : 'p-4 sm:p-6 lg:p-8 print:p-0'}`}>
      {/* ── TOOLBAR KONTROL & FILTER (Hidden during print) ── */}
      <div className="print:hidden bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs">
            <Filter className="w-4 h-4 text-[#145DA0]" />
            <span>Periode Laporan:</span>
          </div>

          {/* Dropdown Bulan */}
          <div className="w-40">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#145DA0]/20 focus:border-[#145DA0] cursor-pointer"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>
          </div>

          {/* Dropdown Tahun */}
          <div className="w-28">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#145DA0]/20 focus:border-[#145DA0] cursor-pointer"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0A3981] text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          DOKUMEN LAPORAN RESMI (TAMPILAN MINIMALIS, BERSIH, PROFESIONAL)
         ════════════════════════════════════════════════════════════════════ */}
      <div
        id="document-sheet"
        className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 sm:p-10 lg:p-12 max-w-5xl mx-auto space-y-8 print:border-none print:shadow-none print:rounded-none print:p-0 print:m-0 print:max-w-none print:w-full print:space-y-5 text-slate-900"
      >
        {/* ── 1. HEADER DOKUMEN & LOGO JASA RAHARJA ── */}
        <div className="space-y-4">
          {/* Logo Jasa Raharja (Header Kiri sesuai contoh lampiran) */}
          <div>
            <img
              src="/img/logo-jasa-raharja.png"
              alt="PT Jasa Raharja"
              className="h-12 w-auto object-contain"
            />
          </div>

          {/* Judul & Informasi Laporan */}
          <div className="pt-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Laporan Monitoring dan Kinerja Petugas
            </h1>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              PT Jasa Raharja Kantor Wilayah Riau
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-2 font-medium">
              <span>Periode: <strong>{MONTH_NAMES[selectedMonth]} {selectedYear}</strong></span>
              <span className="text-slate-300">•</span>
              <span>Tanggal Pembuatan: <strong>{currentDateFormatted}</strong></span>
            </div>
          </div>

          <hr className="border-slate-300 mt-2" />
        </div>

        {/* ── 2. RINGKASAN LAPORAN (4 METRIK EKSEKUTIF) ── */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Ringkasan Laporan
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-3">
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <span className="block text-[11px] font-medium text-slate-500">
                Total Korban Dipantau
              </span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                {summaryReport.totalKorban}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <span className="block text-[11px] font-medium text-slate-500">
                Total Kunjungan Dilakukan
              </span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                {summaryReport.totalKunjungan}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <span className="block text-[11px] font-medium text-slate-500">
                Perlu Ditindaklanjuti
              </span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                {summaryReport.perluTindakLanjut}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <span className="block text-[11px] font-medium text-slate-500">
                Pemantauan Selesai
              </span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                {summaryReport.selesai}
              </div>
            </div>
          </div>
        </div>

        {/* ── 2.5 GRAFIK BATANG PERBANDINGAN KINERJA PETUGAS ── */}
        <div className="space-y-3 break-inside-avoid">
          <div className="flex flex-col sm:flex-row print:flex-row sm:items-center print:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Perbandingan Kinerja Petugas
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Jumlah kunjungan tepat waktu vs terlambat untuk seluruh petugas lapangan ({selectedYear})
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-semibold shrink-0">
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                Tepat Waktu
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-600">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                Terlambat
              </span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 print:p-3 bg-white">
            <div className="h-[230px] print:h-[190px] w-full print:[&_.recharts-responsive-container]:!w-full print:[&_svg]:max-w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[...officerRankings]
                    .sort((a, b) => (a.nama || '').localeCompare(b.nama || ''))
                    .map((o) => ({
                      name: (o.nama || '').split(' ')[0] || o.nama,
                      fullName: o.nama,
                      tepatWaktu: o.tepatWaktu || 0,
                      terlambat: o.terlambat || 0
                    }))}
                  margin={{ top: 22, right: 16, left: -12, bottom: 4 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={{ stroke: '#CBD5E1' }}
                    tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={{ stroke: '#CBD5E1' }}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ fill: '#F8FAFC' }}
                    formatter={(value, name) => [
                      `${value} Kunjungan`,
                      name === 'tepatWaktu' ? 'Tepat Waktu' : 'Terlambat'
                    ]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                  />
                  <Bar dataKey="tepatWaktu" name="tepatWaktu" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    <LabelList
                      dataKey="tepatWaktu"
                      position="top"
                      formatter={(val) => (val > 0 ? val : '')}
                      style={{ fill: '#065F46', fontSize: 11, fontWeight: 700 }}
                    />
                  </Bar>
                  <Bar dataKey="terlambat" name="terlambat" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    <LabelList
                      dataKey="terlambat"
                      position="top"
                      formatter={(val) => (val > 0 ? val : '')}
                      style={{ fill: '#B91C1C', fontSize: 11, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── 3. DAFTAR KORBAN YANG PERLU DITINDAKLANJUTI ── */}
        <div className="space-y-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Daftar Korban yang Perlu Ditindaklanjuti
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Korban yang mengalami keterlambatan kunjungan atau belum melakukan tindak lanjut sesuai ketentuan SLA (tidak termasuk korban berstatus selesai).
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden print:overflow-visible">
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-xs print:text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-800 font-semibold">
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center w-10 print:w-7">No</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5">Nama Korban</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5">Nama Petugas</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5">Rumah Sakit</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 whitespace-nowrap print:whitespace-normal">Tanggal Kecelakaan</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 whitespace-nowrap print:whitespace-normal">Tanggal Masuk</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5">Status Terakhir</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5">Keterangan Keterlambatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {overdueVictims.length > 0 ? (
                  overdueVictims.map((v, idx) => (
                    <tr key={v.id || idx} className="hover:bg-slate-50/60 break-inside-avoid">
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 font-semibold text-slate-900">
                        {v.nama}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-slate-700">
                        {v.namaPetugas || 'Petugas Lapangan'}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-slate-700">
                        {v.rumahSakit || '—'}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-slate-600 whitespace-nowrap print:whitespace-normal">
                        {formatDateIndo(v.tanggalKecelakaan)}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-slate-600 whitespace-nowrap print:whitespace-normal">
                        {formatDateIndo(v.tanggalMasukRs)}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-slate-700">
                        {v.kondisiTerakhir || v.statusPemantauan || 'Masih Dirawat'}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-slate-800 font-medium">
                        {v._overdueReason || 'Perlu pemantauan lanjutan'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="py-6 text-center text-slate-500 italic">
                      Tidak ada korban yang perlu ditindaklanjuti pada periode ini. Seluruh pemantauan berjalan sesuai ketentuan SLA.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        {/* ── 4. PERINGKAT KINERJA PETUGAS ── */}
        <div className="space-y-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Peringkat Kinerja Petugas
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Diurutkan berdasarkan pencapaian KPI dan kepatuhan SLA aktual. Jumlah korban hanya menjadi informasi beban kerja, bukan target capaian.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden print:overflow-visible">
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-xs print:text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-800 font-semibold">
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center w-16 print:w-12">Peringkat</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5">Nama Petugas</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center whitespace-nowrap print:whitespace-normal">Jumlah Korban yang Ditangani</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center whitespace-nowrap print:whitespace-normal">Jumlah Kunjungan</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center whitespace-nowrap print:whitespace-normal">Ketepatan Waktu Kunjungan</th>
                  <th className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center whitespace-nowrap print:whitespace-normal">Persentase Pencapaian SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {officerRankings.length > 0 ? (
                  officerRankings.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/60 break-inside-avoid">
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center font-bold font-mono text-slate-700">
                        {o.peringkat}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 font-semibold text-slate-900">
                        {o.nama}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center font-mono text-slate-700">
                        {o.jumlahKorbanDitangani} Korban
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center font-mono text-slate-700">
                        {o.jumlahKunjungan}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center text-slate-700">
                        {o.ketepatanWaktuKunjungan}
                      </td>
                      <td className="py-2.5 px-3 print:py-1.5 print:px-1.5 text-center font-bold font-mono text-slate-900">
                        {o.persentaseSla !== null && o.persentaseSla !== undefined ? `${o.persentaseSla}%` : 'N/A'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-500 italic">
                      Tidak ada data kinerja petugas pada periode ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        {/* ── 5. LEMBAR PENGESAHAN TANDA TANGAN ── */}
        <div className="pt-6 print:pt-4 flex justify-end break-inside-avoid">
          <div className="w-64 text-center text-xs space-y-1">
            <p className="text-slate-600">Pekanbaru, {currentDateFormatted}</p>
            <p className="text-slate-600">Mengetahui / Mengesahkan,</p>
            <p className="font-bold text-slate-900">{resolvedKabag.jabatan}</p>
            <p className="text-slate-700">PT Jasa Raharja {resolvedKabag.wilayah}</p>

            <div className="h-16 flex items-center justify-center">
              {/* Ruang tanda tangan / stempel */}
            </div>

            <p className="font-bold text-slate-900 underline">
              {resolvedKabag.nama}
            </p>
            <p className="text-[11px] text-slate-500 font-mono">
              {resolvedKabag.nip ? `NIP. ${resolvedKabag.nip}` : 'NIP. —'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
