/**
 * Performance Service for Monitoring & Perbandingan Kinerja Petugas
 * Menyediakan data kinerja bulanan, agregasi SLA, tren, dan histori aktivitas
 * Membedakan jumlah korban unik dari jumlah aktivitas kunjungan/pemantauan
 */

import { storageService } from './storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from './slaService';

// Warna profesional konsisten untuk masing-masing petugas
export const OFFICER_COLORS = {
  'PET-01': { stroke: '#1E40AF', name: 'Adi Putra Pratama', colorName: 'Biru Tua' },
  'PET-02': { stroke: '#0D9488', name: 'Citra Dewi Lestari', colorName: 'Teal' },
  'PET-03': { stroke: '#15803D', name: 'Budi Santoso', colorName: 'Hijau' },
  'PET-04': { stroke: '#D97706', name: 'Eko Prasetyo', colorName: 'Amber' },
  'PET-05': { stroke: '#DC2626', name: 'Doni Setiawan', colorName: 'Merah' },
  'PET-06': { stroke: '#7C3AED', name: 'Maya Anggraini', colorName: 'Ungu' }
};

// Data riwayat bulanan kinerja (Januari - Desember)
export const MONTHLY_OFFICER_TRENDS = [
  { bulan: 'Jan', 'PET-01': 88, 'PET-02': 86, 'PET-03': 85, 'PET-04': 78, 'PET-05': 74, 'PET-06': 87 },
  { bulan: 'Feb', 'PET-01': 90, 'PET-02': 87, 'PET-03': 86, 'PET-04': 80, 'PET-05': 75, 'PET-06': 89 },
  { bulan: 'Mar', 'PET-01': 91, 'PET-02': 89, 'PET-03': 88, 'PET-04': 81, 'PET-05': 76, 'PET-06': 90 },
  { bulan: 'Apr', 'PET-01': 92, 'PET-02': 91, 'PET-03': 87, 'PET-04': 82, 'PET-05': 78, 'PET-06': 91 },
  { bulan: 'Mei', 'PET-01': 93, 'PET-02': 92, 'PET-03': 89, 'PET-04': 83, 'PET-05': 79, 'PET-06': 92 },
  { bulan: 'Jun', 'PET-01': 94, 'PET-02': 93, 'PET-03': 90, 'PET-04': 84, 'PET-05': 80, 'PET-06': 93 },
  { bulan: 'Jul', 'PET-01': 95, 'PET-02': 93, 'PET-03': 91, 'PET-04': 85, 'PET-05': 81, 'PET-06': 94 },
  { bulan: 'Agu', 'PET-01': 96, 'PET-02': 94, 'PET-03': 91, 'PET-04': 85, 'PET-05': 81, 'PET-06': 94 },
  { bulan: 'Sep', 'PET-01': 96, 'PET-02': 95, 'PET-03': 92, 'PET-04': 86, 'PET-05': 82, 'PET-06': 95 },
  { bulan: 'Okt', 'PET-01': 97, 'PET-02': 95, 'PET-03': 91, 'PET-04': 86, 'PET-05': 82, 'PET-06': 95 },
  { bulan: 'Nov', 'PET-01': 97, 'PET-02': 94, 'PET-03': 92, 'PET-04': 87, 'PET-05': 83, 'PET-06': 96 },
  { bulan: 'Des', 'PET-01': 98, 'PET-02': 95, 'PET-03': 93, 'PET-04': 87, 'PET-05': 83, 'PET-06': 96 }
];

export const performanceService = {
  /**
   * Menghitung metrik performa petugas berdasarkan daftar korban unik dan aktivitasnya
   */
  getOfficersComparison(year = '2024', period = 'ALL', filterMonth = 'ALL') {
    const officers = storageService.getOfficers();
    const victims = storageService.getVictims();

    return officers.map((off) => {
      const assigned = victims.filter((v) => v.petugasId === off.id);
      const totalKorbanUnik = assigned.length;

      let kunjunganPertamaCount = 0;
      let kunjunganTepat = 0;
      let kunjunganTerlambat = 0;
      let belumDikunjungi = 0;

      let totalPemantauanLanjutan = 0;
      let pemantauanTepat = 0;
      let pemantauanTerlambat = 0;
      let pemantauanAktif = 0;
      let pemantauanSelesai = 0;
      let korbanButuhTindakLanjut = 0;

      assigned.forEach((v) => {
        const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        const monSla = calculateMonitoringSla(v);

        // Kunjungan pertama
        if (v.kunjunganPertama) {
          kunjunganPertamaCount++;
          if (firstSla.wasLate) {
            kunjunganTerlambat++;
          } else {
            kunjunganTepat++;
          }
        } else {
          belumDikunjungi++;
          if (firstSla.isOverdue) {
            kunjunganTerlambat++;
          }
        }

        // Pemantauan lanjutan
        const monList = v.riwayatPemantauan || [];
        totalPemantauanLanjutan += monList.length;

        if (monSla.status === 'TERLAMBAT') {
          pemantauanTerlambat++;
        } else if (monSla.status === 'TEPAT_WAKTU') {
          pemantauanTepat++;
        }

        if (v.statusPemantauan === 'Pemantauan Aktif') {
          pemantauanAktif++;
          korbanButuhTindakLanjut++;
        } else if (v.statusPemantauan === 'Belum Dikunjungi' || v.statusPemantauan === 'Menunggu Konfirmasi Kondisi') {
          korbanButuhTindakLanjut++;
        } else if (v.statusPemantauan === 'Selesai Dipantau') {
          pemantauanSelesai++;
        }
      });

      const totalSeluruhAktivitas = kunjunganPertamaCount + totalPemantauanLanjutan;

      // Hitung persentase ketepatan waktu kunjungan pertama
      const totalEvaluasiKunjungan = kunjunganTepat + kunjunganTerlambat;
      const ketepatanKunjunganPct = totalEvaluasiKunjungan > 0
        ? Math.round((kunjunganTepat / totalEvaluasiKunjungan) * 100)
        : 100;

      // Hitung persentase ketepatan waktu pemantauan
      const totalEvaluasiPemantauan = pemantauanTepat + pemantauanTerlambat;
      const ketepatanPemantauanPct = totalEvaluasiPemantauan > 0
        ? Math.round((pemantauanTepat / totalEvaluasiPemantauan) * 100)
        : 100;

      // Kinerja terbobot (kunjungan pertama bobot 60%, pemantauan lanjutan 40%)
      const persentaseKinerja = Math.round((ketepatanKunjunganPct * 0.6) + (ketepatanPemantauanPct * 0.4));

      // Ambil nilai tren dari data bulanan
      const octVal = MONTHLY_OFFICER_TRENDS[9][off.id] || 90;
      const sepVal = MONTHLY_OFFICER_TRENDS[8][off.id] || 90;
      let tren = 'Stabil';
      let trenDiff = octVal - sepVal;
      if (trenDiff > 0) tren = 'Meningkat';
      else if (trenDiff < 0) tren = 'Menurun';

      // Status Kategori
      let kategori = 'Sangat Baik';
      let badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      if (persentaseKinerja < 85) {
        kategori = 'Perlu Perhatian';
        badgeClass = 'text-rose-700 bg-rose-50 border-rose-200';
      } else if (persentaseKinerja < 90) {
        kategori = 'Cukup';
        badgeClass = 'text-amber-700 bg-amber-50 border-amber-200';
      } else if (persentaseKinerja < 95) {
        kategori = 'Baik';
        badgeClass = 'text-blue-700 bg-blue-50 border-blue-200';
      }

      return {
        id: off.id,
        nama: off.nama,
        nip: off.nip,
        jabatan: off.jabatan,
        wilayah: off.wilayah,
        avatar: off.avatar,
        plottingRs: off.plottingRs || ['RSUP Dr. Cipto Mangunkusumo', 'RS Polri'],
        totalKorban: totalKorbanUnik,
        totalKorbanUnik,
        kunjunganPertamaCount,
        totalKunjungan: kunjunganPertamaCount,
        totalPemantauanLanjutan,
        totalSeluruhAktivitas,
        kunjunganTepat,
        kunjunganTerlambat,
        ketepatanKunjunganPct,
        pemantauanTepat,
        pemantauanTerlambat,
        ketepatanPemantauanPct,
        belumDikunjungi,
        pemantauanBelumDiperbarui: pemantauanTerlambat,
        pemantauanAktif,
        pemantauanSelesai,
        korbanButuhTindakLanjut,
        persentaseKinerja,
        tren,
        trenDiff,
        kategori,
        badgeClass,
        isSufficientData: totalKorbanUnik >= 1,
        assignedVictims: assigned
      };
    }).sort((a, b) => b.persentaseKinerja - a.persentaseKinerja || a.kunjunganTerlambat - b.kunjunganTerlambat);
  },

  /**
   * Detail kinerja lengkap satu petugas
   */
  getOfficerDetail(officerId) {
    const officers = storageService.getOfficers();
    const officer = officers.find((o) => o.id === officerId) || officers[0];
    if (!officer) return null;

    const victims = storageService.getVictims().filter((v) => v.petugasId === officer.id);

    let kunjunganPertamaCount = 0;
    let kunjunganTepat = 0;
    let kunjunganTerlambat = 0;
    let belumDikunjungi = 0;

    let totalPemantauanLanjutan = 0;
    let pemantauanTepat = 0;
    let pemantauanTerlambat = 0;
    let pemantauanAktif = 0;
    let pemantauanSelesai = 0;
    let korbanButuhTindakLanjut = 0;

    let totalJamRespons = 0;
    let kunjunganAdaWaktu = 0;

    victims.forEach((v) => {
      const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      const monSla = calculateMonitoringSla(v);

      if (v.kunjunganPertama) {
        kunjunganPertamaCount++;
        if (firstSla.wasLate) {
          kunjunganTerlambat++;
        } else {
          kunjunganTepat++;
        }

        const tTerima = new Date(v.tanggalInformasiDiterima).getTime();
        const tKunjungan = new Date(v.kunjunganPertama.tanggalKunjungan).getTime();
        const selisihJam = Math.max(0, (tKunjungan - tTerima) / (1000 * 60 * 60));
        totalJamRespons += selisihJam;
        kunjunganAdaWaktu++;
      } else {
        belumDikunjungi++;
        if (firstSla.isOverdue) {
          kunjunganTerlambat++;
        }
      }

      const monList = v.riwayatPemantauan || [];
      totalPemantauanLanjutan += monList.length;

      if (monSla.status === 'TERLAMBAT') {
        pemantauanTerlambat++;
      } else if (monSla.status === 'TEPAT_WAKTU') {
        pemantauanTepat++;
      }

      if (v.statusPemantauan === 'Pemantauan Aktif') {
        pemantauanAktif++;
        korbanButuhTindakLanjut++;
      } else if (v.statusPemantauan === 'Belum Dikunjungi' || v.statusPemantauan === 'Menunggu Konfirmasi Kondisi') {
        korbanButuhTindakLanjut++;
      } else if (v.statusPemantauan === 'Selesai Dipantau') {
        pemantauanSelesai++;
      }
    });

    const totalEvaluasiKunjungan = kunjunganTepat + kunjunganTerlambat;
    const ketepatanKunjunganPct = totalEvaluasiKunjungan > 0
      ? Math.round((kunjunganTepat / totalEvaluasiKunjungan) * 100)
      : 100;

    const totalEvaluasiPemantauan = pemantauanTepat + pemantauanTerlambat;
    const ketepatanPemantauanPct = totalEvaluasiPemantauan > 0
      ? Math.round((pemantauanTepat / totalEvaluasiPemantauan) * 100)
      : 100;

    const persentaseKinerja = Math.round((ketepatanKunjunganPct * 0.6) + (ketepatanPemantauanPct * 0.4));

    const rataRataJam = kunjunganAdaWaktu > 0
      ? (totalJamRespons / kunjunganAdaWaktu).toFixed(1)
      : '—';

    // Rangkaian tren 12 bulan individu petugas
    const individualMonthlyTrend = MONTHLY_OFFICER_TRENDS.map((m) => ({
      bulan: m.bulan,
      kinerja: m[officer.id] || 85,
      target: 90
    }));

    // Riwayat timeline aktivitas gabungan
    const timelineActivities = [];
    victims.forEach((v) => {
      // 1. Info diterima
      timelineActivities.push({
        id: `ACT-INFO-${v.id}`,
        tipe: 'INFORMASI_DITERIMA',
        judul: 'Informasi Korban Diterima',
        deskripsi: `Laporan masuk dari ${v.sumberInformasi || 'IRSMS Korlantas Polri'}`,
        korbanNama: v.nama,
        korbanId: v.id,
        rs: v.rumahSakit,
        waktu: v.tanggalInformasiDiterima
      });

      // 2. Semua aktivitas
      const acts = v.riwayatAktivitas || [];
      acts.forEach((act) => {
        timelineActivities.push({
          id: act.id,
          tipe: act.jenisAktivitas === 'Kunjungan Pertama' ? 'KUNJUNGAN_LAPANGAN' : 'PEMANTAUAN_BERKALA',
          judul: `${act.jenisAktivitas} — ${act.kondisiKorban}`,
          deskripsi: act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan || 'Aktivitas dicatat.',
          korbanNama: v.nama,
          korbanId: v.id,
          rs: v.rumahSakit,
          waktu: act.tanggal,
          kondisi: act.kondisiKorban
        });
      });
    });

    timelineActivities.sort((a, b) => new Date(b.waktu).getTime() - new Date(a.waktu).getTime());

    // Evaluasi analitis
    const evaluasi = {
      kekuatan: ketepatanKunjunganPct >= 90
        ? 'Konsisten memenuhi tenggat waktu SLA kunjungan pertama di bawah 72 jam.'
        : 'Koordinasi pihak rumah sakit dan pencatatan riwayat korban berjalan teratur.',
      catatanKeterlambatan: kunjunganTerlambat > 0
        ? `Terdapat ${kunjunganTerlambat} kunjungan pertama yang melewati batas SLA 72 jam. Perlu penyesuaian plotting mobilitas rute.`
        : 'Tidak ada keterlambatan kunjungan pertama pada periode ini.',
      catatanPemantauan: pemantauanTerlambat > 0
        ? `${pemantauanTerlambat} korban rawat inap memiliki jadwal pemantauan yang belum diperbarui.`
        : 'Seluruh riwayat pemantauan lanjutan korban telah diperbarui tepat waktu.',
      trenEvaluasi: persentaseKinerja >= 90
        ? 'Kinerja stabil berada di atas standar SLA Jasa Raharja (90%).'
        : 'Perlu peningkatan kepatuhan interval pemantauan 3 hari.'
    };

    return {
      officer,
      metrics: {
        totalKorban: victims.length,
        totalKorbanUnik: victims.length,
        totalKunjungan: kunjunganPertamaCount,
        kunjunganPertamaCount,
        totalPemantauanLanjutan,
        totalSeluruhAktivitas: kunjunganPertamaCount + totalPemantauanLanjutan,
        kunjunganTepat,
        kunjunganTerlambat,
        ketepatanKunjunganPct,
        pemantauanTepat,
        pemantauanTerlambat,
        ketepatanPemantauanPct,
        belumDikunjungi,
        pemantauanBelumDiperbarui: pemantauanTerlambat,
        pemantauanAktif,
        pemantauanSelesai,
        korbanButuhTindakLanjut,
        persentaseKinerja,
        rataRataJam
      },
      victims,
      monthlyTrends: individualMonthlyTrend,
      timelineActivities,
      evaluasi
    };
  }
};
