import React, { useState, useEffect, useMemo } from 'react';
import { 
  Download, 
  Printer, 
  Calendar, 
  Filter, 
  CheckCircle2, 
  AlertCircle,
  FileText
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { isVictimFinished } from '../../utils/monitoringStatus';
import { formatDateIndo, formatDateTimeIndo, parseDateSafe } from '../../utils/dateUtils';
import { generateOfficialKabagReportPdf } from '../../services/pdfReportService';
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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [apiUserData, setApiUserData] = useState(null);

  // Ambil profil user aktual yang sedang login secara dinamis dari API & session
  useEffect(() => {
    let isMounted = true;
    api.getMe().then((res) => {
      if (isMounted && res) {
        setApiUserData(res);
      }
    }).catch(() => {});
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
    storageService.syncWithBackend(true).catch(() => {});
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
  // Diurutkan berdasarkan penilaian KPI dan SLA yang sebenarnya. Jumlah korban hanya beban kerja.
  const officerRankings = useMemo(() => {
    const targetMonth = Number(selectedMonth);
    const targetYear = Number(selectedYear);

    const list = officers.map((off) => {
      const assignedVictims = periodVictims.filter(
        (v) => v.petugasId === off.id || (v.namaPetugas && v.namaPetugas.toLowerCase().includes(off.nama.toLowerCase()))
      );

      const jumlahKorbanDitangani = assignedVictims.length;
      let jumlahKunjungan = 0;
      let tepatWaktu = 0;
      let terlambat = 0;

      assignedVictims.forEach((v) => {
        // Evaluasi Kunjungan Pertama
        if (v.kunjunganPertama) {
          const visitDate = v.kunjunganPertama.tanggalKunjungan || v.kunjunganPertama.waktuAktualKunjungan || v.kunjunganPertama.tanggal;
          const d = parseDateSafe(visitDate);
          if (d && d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
            jumlahKunjungan++;
            const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
            if (firstSla.wasLate) terlambat++;
            else tepatWaktu++;
          }
        } else {
          const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, null);
          if (firstSla.isOverdue) terlambat++;
        }

        // Evaluasi Pemantauan Berkala
        const acts = [...(v.riwayatAktivitas || []), ...(v.riwayatKunjungan || [])];
        acts.forEach((a) => {
          if (a.jenisAktivitas !== 'Kunjungan Pertama' && a.kunjunganKe !== 1) {
            const actDate = a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || a.waktuSelesai;
            const d = parseDateSafe(actDate);
            if (d && d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
              jumlahKunjungan++;
              if (a.terlambat || a.wasLate) terlambat++;
              else tepatWaktu++;
            }
          }
        });

        // Pemantauan aktif yang terlambat
        const monSla = calculateMonitoringSla(v);
        if (v.kunjunganPertama && !checkIsFinished(v) && monSla.isOverdue) {
          terlambat++;
        }
      });

      const totalEvaluated = tepatWaktu + terlambat;
      const persentaseSla = totalEvaluated > 0 ? Math.round((tepatWaktu / totalEvaluated) * 100) : 100;
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
    list.sort((a, b) => b.persentaseSla - a.persentaseSla || b.tepatWaktu - a.tepatWaktu || b.jumlahKunjungan - a.jumlahKunjungan);

    return list.map((item, idx) => ({
      ...item,
      peringkat: idx + 1
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

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setToastMessage('Menyiapkan dokumen PDF Laporan...');
    try {
      await generateOfficialKabagReportPdf({
        periodMonthName: MONTH_NAMES[selectedMonth],
        periodYear: String(selectedYear),
        createdDateStr: currentDateFormatted,
        summary: summaryReport,
        overdueVictims: overdueVictims.map((v) => ({
          ...v,
          tanggalKecelakaanFormatted: formatDateIndo(v.tanggalKecelakaan),
          tanggalMasukFormatted: formatDateIndo(v.tanggalMasukRs),
          keteranganKeterlambatan: v._overdueReason || 'Perlu pemantauan lanjutan'
        })),
        officerRankings,
        kabagProfile: {
          nama: resolvedKabag.nama,
          nip: resolvedKabag.nip,
          jabatan: resolvedKabag.jabatan,
          wilayah: resolvedKabag.wilayah
        }
      });
      setToastMessage('Dokumen Laporan PDF berhasil diunduh!');
    } catch (err) {
      console.error(err);
      setToastMessage('Gagal mengunduh PDF. Silakan coba lagi.');
    } finally {
      setIsGeneratingPdf(false);
      setTimeout(() => setToastMessage(''), 4000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 ${embedded ? '' : 'p-4 sm:p-6 lg:p-8'}`}>
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
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0A3981] text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="print:hidden p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-[#145DA0] flex items-center justify-between animate-fade-in">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage('')} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          DOKUMEN LAPORAN RESMI (TAMPILAN MINIMALIS, BERSIH, PROFESIONAL)
         ════════════════════════════════════════════════════════════════════ */}
      <div 
        id="document-sheet"
        className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 sm:p-10 lg:p-12 max-w-5xl mx-auto space-y-8 print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none text-slate-900"
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

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-800 font-semibold">
                  <th className="py-2.5 px-3 text-center w-10">No</th>
                  <th className="py-2.5 px-3">Nama Korban</th>
                  <th className="py-2.5 px-3">Nama Petugas</th>
                  <th className="py-2.5 px-3">Rumah Sakit</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tanggal Kecelakaan</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Tanggal Masuk</th>
                  <th className="py-2.5 px-3">Status Terakhir</th>
                  <th className="py-2.5 px-3">Keterangan Keterlambatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {overdueVictims.length > 0 ? (
                  overdueVictims.map((v, idx) => (
                    <tr key={v.id || idx} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {v.nama}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {v.namaPetugas || 'Petugas Lapangan'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {v.rumahSakit || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {formatDateIndo(v.tanggalKecelakaan)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {formatDateIndo(v.tanggalMasukRs)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {v.kondisiTerakhir || v.statusPemantauan || 'Masih Dirawat'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium">
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

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-800 font-semibold">
                  <th className="py-2.5 px-3 text-center w-16">Peringkat</th>
                  <th className="py-2.5 px-3">Nama Petugas</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Jumlah Korban yang Ditangani</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Jumlah Kunjungan</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Ketepatan Waktu Kunjungan</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Persentase Pencapaian SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {officerRankings.length > 0 ? (
                  officerRankings.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-700">
                        {o.peringkat}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {o.nama}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                        {o.jumlahKorbanDitangani} Korban
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                        {o.jumlahKunjungan}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-700">
                        {o.ketepatanWaktuKunjungan}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-900">
                        {o.persentaseSla}%
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

        {/* ── 5. LEMBAR PENGESAHAN TANDA TANGAN ── */}
        <div className="pt-6 flex justify-end">
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
