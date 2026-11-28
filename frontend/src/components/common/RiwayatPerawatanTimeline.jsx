import React, { useState } from 'react';
import {
  Building2,
  ArrowRight,
  ArrowUpRight,
  User,
  Calendar,
  CheckCircle2,
  Clock,
  Activity,
  Home,
  Info,
  FileText,
  AlertTriangle,
  AlertOctagon,
  PlusCircle,
  Eye,
  Lock,
  List,
  GitCommit,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { parseCatatanKondisi, parseDateToTimestamp, isNoteDuplicateOfActions } from '../../services/backendMapper';
import { groupCareEpisodes } from '../../services/careHistoryService';
import { isVictimFinished } from '../../utils/monitoringStatus';
import MonitoringStatusBadge from './MonitoringStatusBadge';
import { formatDateIndo, formatTimeIndo, formatDateTimeIndo } from '../../utils/dateUtils';
import { storageService } from '../../services/storageService';
import { isSameHospital } from '../../utils/referralUtils';
import RiwayatPerawatanAntarRs from './RiwayatPerawatanAntarRs';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return formatDateIndo(dateStr);
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return formatTimeIndo(dateStr);
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return formatDateTimeIndo(dateStr);
}

/**
 * Resolusi akurat rumah sakit asal, tujuan, dan rumah sakit saat ini untuk kasus rujukan.
 * Memastikan RS Asal tidak pernah tertimpa oleh RS Tujuan / RS Saat Ini.
 */
export function resolveReferralHospitals(victim) {
  if (!victim) {
    return {
      isReferred: false,
      rsAsal: 'Rumah Sakit Asal',
      rsTujuan: 'Rumah Sakit Rujukan',
      rsSaatIni: 'Rumah Sakit Saat Ini'
    };
  }

  // Prioritas Utama: Jika memiliki struktur careEpisodes (>= 2 episode rawatan),
  // episode pertama adalah RS asal dan episode terakhir adalah RS saat ini.
  if (Array.isArray(victim.careEpisodes) && victim.careEpisodes.length >= 2) {
    const originEp = victim.careEpisodes[0];
    const currentEp = victim.careEpisodes[victim.careEpisodes.length - 1];
    const rsAsalVal = originEp.rumahSakit || victim.rumahSakitAsal;
    const rsSaatIniVal = currentEp.rumahSakit || victim.rumahSakit;

    // Rujukan valid jika ada riwayat rujukan resmi (tetap dipertahankan meski pasien kemudian pulang & rawat lanjutan)
    const isExplicitReferred = Boolean(
      victim.careEpisodes.some((ep) => ep.tipePerawatan === 'Rujukan' || ep.status === 'Dirujuk') ||
      victim.statusPerawatan === 'Rujukan' ||
      (Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.length > 0) ||
      (Array.isArray(victim.referrals) && victim.referrals.length > 0)
    );

    return {
      isReferred: isExplicitReferred,
      rsAsal: rsAsalVal || 'Rumah Sakit Asal',
      rsTujuan: rsSaatIniVal || 'Rumah Sakit Saat Ini',
      rsSaatIni: rsSaatIniVal || 'Rumah Sakit Saat Ini'
    };
  }

  let rsAsal = victim.rumahSakitAsal;
  let rsTujuan = victim.rumahSakitTujuan;

  // 1. Ekstrak dari riwayat rujukan resmi jika ada
  if (Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.length > 0) {
    const firstRef = victim.riwayatRujukan[0];
    const lastRef = victim.riwayatRujukan[victim.riwayatRujukan.length - 1];
    const originCandidate = firstRef.dariRs || firstRef.rumahSakitAsal || firstRef.source_hospital_nama;
    const targetCandidate = lastRef.keRs || lastRef.rumahSakitTujuan || lastRef.target_hospital_nama;
    if (originCandidate && targetCandidate && originCandidate.toLowerCase().trim() !== targetCandidate.toLowerCase().trim()) {
      rsAsal = originCandidate;
      rsTujuan = targetCandidate;
    } else {
      if (!rsAsal || rsAsal === rsTujuan) {
        if (originCandidate) rsAsal = originCandidate;
      }
      if (!rsTujuan || rsTujuan === rsAsal) {
        if (targetCandidate) rsTujuan = targetCandidate;
      }
    }
  }

  // 2. Ekstrak dari riwayat perawatan makro
  if (Array.isArray(victim.riwayatPerawatan) && victim.riwayatPerawatan.length > 0) {
    if (!rsAsal || rsAsal === rsTujuan) {
      const initCare = victim.riwayatPerawatan.find(
        (c) => (c.jenisPerawatan === 'Rawat Pertama' || c.id?.includes('INIT')) && c.rumahSakit && (!rsTujuan || c.rumahSakit !== rsTujuan)
      );
      if (initCare) rsAsal = initCare.rumahSakit;
    }
    if (!rsTujuan || rsTujuan === rsAsal) {
      const refCare = victim.riwayatPerawatan.find(
        (c) => c.jenisPerawatan === 'Rujukan' && c.rumahSakit && (!rsAsal || c.rumahSakit !== rsAsal)
      );
      if (refCare) rsTujuan = refCare.rumahSakit;
    }
  }

  // 3. Ekstrak dari riwayat kunjungan / aktivitas
  if (Array.isArray(victim.riwayatAktivitas) && victim.riwayatAktivitas.length > 0) {
    if (!rsTujuan || rsTujuan === rsAsal) {
      const refAct = victim.riwayatAktivitas.find((a) => a.rumahSakitRujukan && (!rsAsal || a.rumahSakitRujukan !== rsAsal));
      if (refAct) rsTujuan = refAct.rumahSakitRujukan;
    }
    if (!rsAsal || rsAsal === rsTujuan) {
      const firstAct = [...victim.riwayatAktivitas].reverse().find(
        (a) => a.rumahSakit && (!rsTujuan || a.rumahSakit !== rsTujuan)
      );
      if (firstAct) rsAsal = firstAct.rumahSakit;
    }
  }

  // 4. Ekstrak dari teks status kondisi jika belum ditemukan
  if (!rsTujuan || rsTujuan === rsAsal) {
    const statusStr = victim.status_kondisi || victim.kondisiTerakhir || victim.statusPemantauan || '';
    if (typeof statusStr === 'string' && statusStr.startsWith('Dirujuk ke ')) {
      const parsed = statusStr.replace(/^Dirujuk ke\s+/i, '').trim();
      if (parsed && parsed !== 'RS Lain' && (!rsAsal || parsed !== rsAsal)) {
        rsTujuan = parsed;
      }
    }
  }

  // 5. Ekstrak dari catatanRawatLanjutan jika pasien rawat lanjutan tapi rsAsal belum terdeteksi
  if (!rsAsal || rsAsal === victim.rumahSakit) {
    const rawatNote = victim.catatanRawatLanjutan || victim.keteranganTambahan || '';
    if (typeof rawatNote === 'string') {
      const match = rawatNote.match(/sebelumnya (?:pulang dari|di)\s+([^().\n]+)/i);
      if (match && match[1]) {
        const extracted = match[1].trim();
        if (extracted && extracted.toLowerCase() !== (victim.rumahSakit || '').toLowerCase()) {
          rsAsal = extracted;
        }
      }
    }
  }

  // 6. Ekstrak dari riwayat perawatan / aktivitas / kunjungan faskes sebelumnya
  if (!rsAsal || rsAsal === victim.rumahSakit) {
    if (Array.isArray(victim.riwayatPerawatan) && victim.riwayatPerawatan.length > 0) {
      const initCare = victim.riwayatPerawatan.find(
        (c) => c.rumahSakit && victim.rumahSakit && c.rumahSakit.toLowerCase().trim() !== victim.rumahSakit.toLowerCase().trim()
      );
      if (initCare) rsAsal = initCare.rumahSakit;
    }
    if ((!rsAsal || rsAsal === victim.rumahSakit) && Array.isArray(victim.riwayatAktivitas) && victim.riwayatAktivitas.length > 0) {
      const diffAct = [...victim.riwayatAktivitas].reverse().find(
        (a) => a.rumahSakit && victim.rumahSakit && a.rumahSakit.toLowerCase().trim() !== victim.rumahSakit.toLowerCase().trim()
      );
      if (diffAct) rsAsal = diffAct.rumahSakit;
    }
    if ((!rsAsal || rsAsal === victim.rumahSakit) && Array.isArray(victim.riwayatKunjungan) && victim.riwayatKunjungan.length > 0) {
      const diffVis = [...victim.riwayatKunjungan].reverse().find(
        (v) => v.rumahSakit && victim.rumahSakit && v.rumahSakit.toLowerCase().trim() !== victim.rumahSakit.toLowerCase().trim()
      );
      if (diffVis) rsAsal = diffVis.rumahSakit;
    }
  }

  const isExplicitReferral = Boolean(
    (Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.length > 0) ||
    (Array.isArray(victim.referrals) && victim.referrals.length > 0) ||
    victim.statusPerawatan === 'Rujukan' ||
    victim.statusPerawatan === 'Rujukan Diterima' ||
    Boolean(victim.isRujukanMasuk) ||
    (typeof victim.kondisiTerakhir === 'string' && victim.kondisiTerakhir.startsWith('Dirujuk ke')) ||
    (typeof victim.statusPemantauan === 'string' && victim.statusPemantauan.startsWith('Dirujuk ke'))
  );

  // Jika pasien berstatus rujukan tapi salah satu nama belum terisi:
  if (isExplicitReferral) {
    if (!rsAsal) {
      rsAsal = victim.rumahSakitAsal || (victim.rumahSakit !== rsTujuan ? victim.rumahSakit : 'RS Asal');
    }
    if (!rsTujuan) {
      rsTujuan = victim.rumahSakitTujuan || (victim.rumahSakit !== rsAsal ? victim.rumahSakit : rsAsal);
    }
    // Cegah duplikasi nama jika keduanya sama padahal ada rujukan
    if (rsAsal === rsTujuan) {
      if (victim.rumahSakit && victim.rumahSakit !== rsAsal) {
        rsTujuan = victim.rumahSakit;
      } else if (victim.rumahSakitAsal && victim.rumahSakitAsal !== rsTujuan) {
        rsAsal = victim.rumahSakitAsal;
      } else if (victim.rumahSakitTujuan && victim.rumahSakitTujuan !== rsAsal) {
        rsTujuan = victim.rumahSakitTujuan;
      }
    }
  }

  if (!rsAsal) rsAsal = victim.rumahSakit || 'RS Asal';
  if (!rsTujuan) rsTujuan = rsAsal;

  // RS Saat Ini: lokasi aktif perawatan korban saat ini
  let rsSaatIni = victim.rumahSakit || rsTujuan || rsAsal;
  if (isExplicitReferral && rsSaatIni === rsAsal && rsTujuan !== rsAsal) {
    rsSaatIni = rsTujuan;
  }

  // Rujukan visual valid HANYA jika memang rujukan resmi DAN RS Asal & RS Saat Ini berbeda
  const isActuallyReferred = Boolean(
    isExplicitReferral &&
    rsAsal &&
    rsSaatIni &&
    rsAsal.toLowerCase().trim() !== rsSaatIni.toLowerCase().trim()
  );

  return {
    isReferred: isActuallyReferred,
    rsAsal,
    rsTujuan,
    rsSaatIni
  };
}

/**
 * Menyusun urutan kronologis perjalanan perawatan pasien (Patient Journey)
 * Menggabungkan seluruh tahapan makro (penerimaan, pemulangan, rawatan lanjutan, rujukan)
 * dan aktivitas kunjungan aktual petugas menjadi satu alur kronologis (bead line) utuh.
 */
export function buildPatientJourney(victim) {
  if (!victim) return [];

  const { isReferred, rsAsal, rsTujuan, rsSaatIni } = resolveReferralHospitals(victim);
  const originRs = rsAsal;
  const currentRs = rsSaatIni;
  const initialDate =
    victim.tanggalMasukAwal ||
    victim.tanggalMasukRs ||
    victim.tanggalInformasiDiterima ||
    victim.tanggalKecelakaan ||
    new Date().toISOString();

  // ── PRIORITAS UTAMA: STRUKTUR CARE EPISODES (ISOLASI LENGKAP TIAP RUMAH SAKIT) ──
  // HANYA gunakan alur multi-episode jika memang terbukti kasus rujukan resmi
  if (Array.isArray(victim.careEpisodes) && victim.careEpisodes.length >= 2 && isReferred) {
    const episodeJourney = [];
    victim.careEpisodes.forEach((ep, epIdx) => {
      const isFirstEpisode = epIdx === 0;
      const isLatestEpisode = epIdx === victim.careEpisodes.length - 1;
      const epHospital = ep.rumahSakit || (isFirstEpisode ? originRs : currentRs);
      const isEpDischarged = Boolean(
        ep.isReadOnly ||
        ep.status === 'Pulang' ||
        ep.kondisiTerakhir === 'Pulang' ||
        ep.kondisiTerakhir === 'Sudah Pulang'
      );

      const visitsInEp = (ep.kunjunganList || []).filter((v) => v && v.statusKunjungan !== 'Menunggu');

      if (visitsInEp.length > 0) {
        visitsInEp.forEach((act, vIdx) => {
          const isFirstInEp = vIdx === 0;
          const actDate = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || ep.tanggalMasuk || initialDate;
          const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
          const tindakanList = (act.checklistTindakan && act.checklistTindakan.length > 0)
            ? act.checklistTindakan
            : parsed.tindakanList;

          const isReactivate = Boolean(act.isReactivationLog || String(act.jenisAktivitas || '').includes('Aktivasi Pemantauan Kembali'));
          const isNonVisit = Boolean(act.isNonVisitConfirmation && !isReactivate);

          const visitStatus = isReactivate
            ? 'Rawat Lanjutan'
            : (act.kondisiKorban || (isEpDischarged ? 'Pulang' : (ep.status || 'Sedang Dipantau')));

          const judul = isReactivate
            ? `Aktivasi Pemantauan Kembali (Rawat Lanjutan) di ${epHospital}`
            : isNonVisit
              ? `Konfirmasi Kondisi Tanpa Kunjungan di ${epHospital}`
              : isFirstInEp
                ? (isFirstEpisode ? `Kunjungan Awal di ${epHospital}` : `Kunjungan Perawatan di ${epHospital}`)
                : `Pemantauan Berkala di ${epHospital}`;

          const type = isReactivate
            ? 'readmit'
            : (visitStatus === 'Pulang' || visitStatus === 'Sudah Pulang')
              ? 'discharge'
              : (isFirstEpisode && isFirstInEp ? 'initial' : (isFirstInEp ? 'readmit' : 'visit'));

          episodeJourney.push({
            id: act.id || `JOURNEY-EP${epIdx}-V${vIdx}`,
            tanggal: actDate,
            rumahSakit: epHospital,
            judul,
            jenis: isFirstInEp ? (isFirstEpisode ? 'Kunjungan Awal' : 'Kunjungan Perawatan') : 'Pemantauan Berkala',
            type,
            status: visitStatus,
            petugasNama: act.petugasNama || ep.namaPetugas || victim.namaPetugas,
            catatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan || (isEpDischarged ? `Pasien telah menyelesaikan masa perawatan di ${epHospital} dan dinyatakan pulang.` : `Kunjungan perawatan pasien di ${epHospital}.`),
            tindakanList: tindakanList.length > 0 ? tindakanList : ['Memastikan kondisi terbaru korban'],
            rawActivity: {
              ...act,
              rumahSakit: epHospital,
              kondisiKorban: visitStatus,
              jenisAktivitas: isFirstInEp ? (isFirstEpisode ? 'Kunjungan Awal' : 'Kunjungan Perawatan') : 'Pemantauan Berkala',
              statusTindakLanjut: isEpDischarged ? 'Sudah Selesai' : (act.statusTindakLanjut || 'Masih Perlu Ditindaklanjuti')
            }
          });
        });
      } else {
        // Episode belum memiliki kunjungan selesai (misal baru diinput via WhatsApp Bot dan sedang dipantau)
        const epDate = ep.tanggalMasuk || (isFirstEpisode ? initialDate : (victim.tanggalMasukTerbaru || initialDate));
        const epStatus = isEpDischarged ? 'Pulang' : (ep.status || 'Sedang Dipantau');
        const judul = isFirstEpisode ? `Kunjungan Awal di ${epHospital}` : `Kunjungan Perawatan di ${epHospital}`;
        const type = isEpDischarged ? 'discharge' : (isFirstEpisode ? 'initial' : 'readmit');

        episodeJourney.push({
          id: `JOURNEY-EP${epIdx}-INIT-${ep.caseId || ep.episodeId || victim.id}`,
          tanggal: epDate,
          rumahSakit: epHospital,
          judul,
          jenis: isFirstEpisode ? 'Kunjungan Awal' : 'Kunjungan Perawatan',
          type,
          status: epStatus,
          petugasNama: ep.namaPetugas || victim.namaPetugas || 'Petugas Jasa Raharja',
          catatan: isEpDischarged
            ? `Pasien telah menyelesaikan masa perawatan di ${epHospital} dan dinyatakan pulang. Proses pemantauan di ${epHospital} telah selesai (Arsip Read-Only).`
            : `Pasien masuk melalui faskes ${epHospital} sebagai periode perawatan baru. Memulai proses pemantauan dari awal.`,
          tindakanList: ['Memastikan kondisi terbaru korban'],
          rawActivity: ep.activePendingVisit || {
            id: `ACT-EP${epIdx}-${victim.id}`,
            tanggal: epDate,
            tanggalKunjungan: epDate,
            waktuAktualKunjungan: epDate,
            rumahSakit: epHospital,
            petugasNama: ep.namaPetugas || victim.namaPetugas,
            kondisiKorban: epStatus,
            jenisAktivitas: isFirstEpisode ? 'Kunjungan Awal' : 'Kunjungan Perawatan',
            hasilKunjungan: isEpDischarged ? `Pasien telah pulang dari ${epHospital}.` : `Pemantauan perawatan pasien di ${epHospital}.`,
            catatanTambahan: isEpDischarged ? 'Perawatan selesai.' : 'Menunggu pelaksanaan pemantauan.',
            statusTindakLanjut: isEpDischarged ? 'Sudah Selesai' : 'Masih Perlu Ditindaklanjuti',
            checklistTindakan: ['Memastikan kondisi terbaru korban']
          }
        });
      }
    });

    const sortedJourney = episodeJourney.sort((a, b) => {
      const ta = parseDateToTimestamp(a.tanggal);
      const tb = parseDateToTimestamp(b.tanggal);
      return ta - tb;
    });

    const seenKeys = new Set();
    return sortedJourney.map((item, idx) => {
      let finalId = item.id;
      if (!finalId || seenKeys.has(finalId)) {
        finalId = `JOURNEY-${idx}-${item.type || 'item'}`;
      }
      seenKeys.add(finalId);
      return { ...item, id: finalId, nomor: idx + 1 };
    });
  }

  // 1. Kumpulkan seluruh kunjungan aktual selesai (dari semua sumber tanpa ada yang tertinggal)
  const completedVisits = [];
  const seenVisitKeys = new Set();
  const addVisit = (v) => {
    if (!v || v.statusKunjungan === 'Menunggu') return;
    const vTime = v.waktuAktualKunjungan || v.tanggal || v.tanggalKunjungan || '';
    const key = v.id || v.visitId || `${vTime}-${v.rumahSakit || ''}-${v.nomorKunjungan || ''}`;
    if (!seenVisitKeys.has(key)) {
      seenVisitKeys.add(key);
      completedVisits.push(v);
    }
  };

  if (Array.isArray(victim.riwayatAktivitas)) {
    victim.riwayatAktivitas.forEach(addVisit);
  }
  if (victim.kunjunganPertama) {
    addVisit(victim.kunjunganPertama);
  }
  if (Array.isArray(victim.riwayatKunjungan)) {
    victim.riwayatKunjungan.forEach(addVisit);
  }
  if (Array.isArray(victim.riwayatPemantauan)) {
    victim.riwayatPemantauan.forEach(addVisit);
  }
  if (Array.isArray(victim.careEpisodes)) {
    victim.careEpisodes.forEach((ep) => {
      if (Array.isArray(ep.kunjunganList)) {
        ep.kunjunganList.forEach((v) => {
          const vWithRs = v.rumahSakit ? v : { ...v, rumahSakit: ep.rumahSakit };
          addVisit(vWithRs);
        });
      }
    });
  }

  // Sort visits chronologically
  const sortedVisits = [...completedVisits].sort((a, b) => {
    const da = new Date(a.waktuAktualKunjungan || a.tanggal || a.tanggalKunjungan || 0).getTime();
    const db = new Date(b.waktuAktualKunjungan || b.tanggal || b.tanggalKunjungan || 0).getTime();
    return da - db;
  });

  const journey = [];

  const originRsLower = (originRs || '').toLowerCase().trim();
  const currentRsLower = (currentRs || '').toLowerCase().trim();

  // Multi-hospital HANYA aktif jika ADA RUMAH SAKIT ASAL dan RUMAH SAKIT SAAT INI yang benar-benar berbeda
  const hasDistinctHospitals = Boolean(
    originRsLower &&
    currentRsLower &&
    originRsLower !== currentRsLower &&
    !originRsLower.includes(currentRsLower) &&
    !currentRsLower.includes(originRsLower)
  );

  const isMultiHospital = Boolean(
    isReferred &&
    hasDistinctHospitals
  );

  if (isMultiHospital) {
    // ── MULTI-HOSPITAL RAWAT LANJUTAN SCENARIO (No. 1: RS Asal/Prima, No. 2: RS Lanjutan/Syafira) ──
    const originVisits = [];
    const currentVisits = [];

    // Cari petugas resmi yang bertanggung jawab terhadap rumah sakit asal dan rumah sakit tujuan
    const allOfficers = typeof storageService?.getOfficers === 'function' ? storageService.getOfficers() : [];
    const officerForCurrentRs = allOfficers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isSameHospital(rs, currentRs))
    );
    const officerForOriginRs = allOfficers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isSameHospital(rs, originRs))
    );

    // Resolusi nama petugas yang benar sesuai plotting RS resmi:
    // RS Syafira Pekanbaru -> Siti Isrizkiah
    // RS Tabrani -> Syaiful Hidayat
    // RS Bhayangkara -> Dimas Andaru
    const refTargetOfficer = officerForCurrentRs?.nama ||
      (isSameHospital(currentRs, 'RS Syafira') ? 'Siti Isrizkiah' : null) ||
      victim.petugasTujuanNama ||
      victim.riwayatRujukan?.[0]?.petugasTujuanNama ||
      'Petugas RS Tujuan';

    const refOriginOfficer = officerForOriginRs?.nama ||
      (isSameHospital(originRs, 'RS Tabrani') ? 'Syaiful Hidayat' : null) ||
      victim.petugasAsalNama ||
      victim.riwayatRujukan?.[0]?.petugasAsalNama ||
      'Petugas RS Asal';

    const readmitThresholdTime = victim.tanggalMasukTerbaru
      ? new Date(victim.tanggalMasukTerbaru).getTime()
      : (victim.tanggalPulangSebelumnya ? new Date(victim.tanggalPulangSebelumnya).getTime() : 0);

    sortedVisits.forEach((v) => {
      const vTime = new Date(v.waktuAktualKunjungan || v.tanggal || v.tanggalKunjungan || 0).getTime();
      const vRs = (v.rumahSakit || '').toLowerCase().trim();

      if (vRs && originRsLower && (vRs === originRsLower || vRs.includes(originRsLower) || originRsLower.includes(vRs))) {
        originVisits.push(v);
      } else if (vRs && currentRsLower && (vRs === currentRsLower || vRs.includes(currentRsLower) || currentRsLower.includes(vRs))) {
        currentVisits.push(v);
      } else if (readmitThresholdTime > 0 && vTime < readmitThresholdTime) {
        originVisits.push(v);
      } else if (readmitThresholdTime > 0 && vTime >= readmitThresholdTime) {
        currentVisits.push(v);
      } else {
        if (originVisits.length === 0) {
          originVisits.push(v);
        } else {
          currentVisits.push(v);
        }
      }
    });

    // 1. TAHAPAN RS ASAL / RS PERTAMA (Misal: RS Syafira Pekanbaru)
    if (originVisits.length > 0) {
      originVisits.forEach((act, idx) => {
        const isFirst = idx === 0;
        const actDate = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || (victim.tanggalMasukAwal || initialDate);
        const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
        const tindakanList = (act.checklistTindakan && act.checklistTindakan.length > 0)
          ? act.checklistTindakan
          : parsed.tindakanList;

        const visitStatus = isReferred
          ? (act.kondisiKorban || (isFirst ? 'Masih Dirawat' : 'Sedang Dipantau'))
          : 'Pulang';

        journey.push({
          id: act.id || `JOURNEY-ORIGIN-${idx}`,
          tanggal: actDate,
          rumahSakit: originRs,
          judul: isFirst ? `Kunjungan Awal di ${originRs}` : `Pemantauan Berkala di ${originRs}`,
          jenis: isFirst ? 'Kunjungan Awal' : 'Pemantauan Berkala',
          type: isReferred ? (isFirst ? 'initial' : 'visit') : 'discharge',
          status: visitStatus,
          petugasNama: act.petugasNama || victim.petugasAsalNama || refOriginOfficer,
          catatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || (isReferred
            ? `Petugas melakukan pemantauan kondisi korban di ${originRs}.`
            : `Pasien pertama kali mendapatkan perawatan di ${originRs}. Seluruh riwayat kunjungan dan pemantauan tersimpan. Pasien telah dinyatakan pulang dan proses pemantauan di ${originRs} telah selesai (Arsip Read-Only).`),
          tindakanList: tindakanList.length > 0 ? tindakanList : ['Memastikan kondisi terbaru korban', 'Memberikan Edukasi kepada pihak keluarga korban'],
          rawActivity: {
            ...act,
            rumahSakit: originRs,
            kondisiKorban: visitStatus,
            jenisAktivitas: isFirst ? 'Kunjungan Awal' : 'Pemantauan Berkala',
            statusTindakLanjut: isReferred ? 'Masih Perlu Ditindaklanjuti' : 'Sudah Selesai',
            hasilKunjungan: isReferred
              ? `Kunjungan pemantauan di ${originRs}.`
              : `Pasien telah menyelesaikan masa perawatan di ${originRs} dan dinyatakan pulang.`
          }
        });
      });
    } else {
      const originDate = victim.tanggalMasukAwal || victim.tanggalPulangSebelumnya || initialDate;
      journey.push({
        id: `JOURNEY-INIT-ORIGIN-${victim.id}`,
        tanggal: originDate,
        rumahSakit: originRs,
        judul: `Kunjungan Awal di ${originRs}`,
        jenis: 'Kunjungan Awal',
        type: isReferred ? 'initial' : 'discharge',
        status: isReferred ? 'Masih Dirawat' : 'Pulang',
        petugasNama: refOriginOfficer || victim.petugasAsalNama || 'Petugas Jasa Raharja',
        catatan: isReferred
          ? `Pasien pertama kali mendapatkan penanganan awal dan dirawat di ${originRs}. Petugas asal bertanggung jawab atas penanganan korban.`
          : `Pasien pertama kali mendapatkan perawatan di ${originRs}. Seluruh riwayat kunjungan dan pemantauan tersimpan. Pasien telah dinyatakan pulang dan proses pemantauan di ${originRs} telah selesai (Arsip Read-Only).`,
        tindakanList: ['Memastikan kondisi terbaru korban', 'Memberikan Edukasi kepada pihak keluarga korban'],
        rawActivity: {
          id: `ACT-ORIGIN-${victim.id}`,
          tanggal: originDate,
          tanggalKunjungan: originDate,
          waktuAktualKunjungan: originDate,
          rumahSakit: originRs,
          petugasNama: refOriginOfficer || victim.petugasAsalNama,
          kondisiKorban: isReferred ? 'Masih Dirawat' : 'Pulang',
          jenisAktivitas: 'Kunjungan Awal',
          hasilKunjungan: `Kunjungan dan penerimaan awal di ${originRs}.`,
          catatanTambahan: 'Kunjungan dan penanganan awal selesai.',
          statusTindakLanjut: isReferred ? 'Masih Perlu Ditindaklanjuti' : 'Sudah Selesai',
          checklistTindakan: ['Memastikan kondisi terbaru korban', 'Memberikan Edukasi kepada pihak keluarga korban']
        }
      });
    }

    // TAHAPAN RUJUKAN & PENGALIHAN TANGGUNG JAWAB (Jika kasus rujukan)
    if (isReferred) {
      const refDate = victim.tanggalRujukan || (victim.riwayatRujukan?.[0]?.tanggal) || initialDate;

      journey.push({
        id: `JOURNEY-REF-${victim.id}`,
        tanggal: refDate,
        rumahSakit: originRs,
        judul: `Korban Dirujuk ke ${currentRs}`,
        jenis: 'Rujukan Antar-Rumah Sakit',
        type: 'referral',
        status: `Dirujuk ke ${currentRs}`,
        petugasNama: refOriginOfficer,
        catatan: `Korban dirujuk dari ${originRs} ke ${currentRs} untuk fasilitas medis lanjutan. Petugas mencatat informasi rujukan.`
      });

      journey.push({
        id: `JOURNEY-HANDOFF-${victim.id}`,
        tanggal: refDate,
        rumahSakit: currentRs,
        judul: `Pengalihan Tanggung Jawab ke Petugas ${currentRs}`,
        jenis: 'Pengalihan Tanggung Jawab',
        type: 'referral_accepted',
        status: 'Sedang Dipantau',
        petugasNama: refTargetOfficer,
        catatan: `Tanggung jawab pemantauan aktif dialihkan kepada ${refTargetOfficer} selaku petugas penanggung jawab ${currentRs}. Petugas penerima menerima notifikasi rujukan.`
      });
    }

    // 2. TAHAPAN RS KEDUA / RS TUJUAN (Misal: RS Tabrani Rab) -> NO. 2 dst.
    const isSecondEpisodeDischarged = Boolean(
      !victim.isReactivated &&
      (
        ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.kondisiTerakhir) ||
        ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.status_kondisi)
      )
    );

    const currentHospitalStatus = isSecondEpisodeDischarged
      ? 'Pulang'
      : (victim.kondisiTerakhir === 'Luka Berat' ? 'Sedang Dirawat' : (victim.kondisiTerakhir || 'Sedang Dirawat'));

    if (currentVisits.length > 0) {
      currentVisits.forEach((act, idx) => {
        const isFirstInCurrent = idx === 0;
        const isReactivate = Boolean(act.isReactivationLog || String(act.jenisAktivitas || '').includes('Aktivasi Pemantauan Kembali'));
        const isNonVisit = Boolean(act.isNonVisitConfirmation && !isReactivate);
        const actDate = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || (victim.tanggalMasukTerbaru || new Date().toISOString());
        const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
        const tindakanList = (act.checklistTindakan && act.checklistTindakan.length > 0)
          ? act.checklistTindakan
          : parsed.tindakanList;

        const visitStatus = isReactivate
          ? 'Rawat Lanjutan'
          : (act.kondisiKorban || currentHospitalStatus);

        journey.push({
          id: act.id || `JOURNEY-CURRENT-${idx}`,
          tanggal: actDate,
          rumahSakit: currentRs,
          judul: isReactivate
            ? `Aktivasi Pemantauan Kembali (Rawat Lanjutan) di ${currentRs}`
            : isNonVisit
              ? `Konfirmasi Kondisi Tanpa Kunjungan di ${currentRs}`
              : isFirstInCurrent
                ? (isReferred ? `Kunjungan Lanjutan di ${currentRs}` : `Kunjungan Perawatan di ${currentRs}`)
                : `Pemantauan Berkala di ${currentRs}`,
          jenis: isReactivate
            ? 'Rawat Lanjutan'
            : isNonVisit
              ? 'Konfirmasi Non-Kunjungan'
              : isFirstInCurrent
                ? (isReferred ? 'Kunjungan Lanjutan di RS Rujukan' : 'Kunjungan Perawatan Lanjutan')
                : 'Pemantauan Berkala',
          type: isReactivate ? 'readmit' : ((visitStatus === 'Pulang' || visitStatus === 'Sudah Pulang') ? 'discharge' : (isFirstInCurrent ? (isReferred ? 'visit' : 'readmit') : 'visit')),
          status: visitStatus,
          petugasNama: act.petugasNama || refTargetOfficer,
          catatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || (isReferred
            ? `Petugas penerima melanjutkan pemantauan dan pencatatan kondisi korban di ${currentRs}.`
            : `Pasien kembali mendapatkan perawatan di ${currentRs} sebagai periode perawatan baru.`),
          tindakanList: tindakanList.length > 0 ? tindakanList : ['Memastikan kondisi terbaru korban'],
          rawActivity: {
            ...act,
            rumahSakit: currentRs,
            kondisiKorban: visitStatus,
            jenisAktivitas: isFirstInCurrent
              ? (isReferred ? 'Kunjungan Lanjutan di RS Rujukan' : 'Kunjungan Perawatan Lanjutan')
              : 'Pemantauan Berkala'
          }
        });
      });
    } else {
      const admissionDate = victim.tanggalMasukTerbaru || victim.tanggalMasukRs || new Date().toISOString();
      journey.push({
        id: `JOURNEY-LANJUT-RS2-${victim.id}`,
        tanggal: admissionDate,
        rumahSakit: currentRs,
        judul: isReferred ? `Kunjungan Lanjutan di ${currentRs}` : `Kunjungan Perawatan di ${currentRs}`,
        jenis: isReferred ? 'Kunjungan Lanjutan di RS Rujukan' : 'Kunjungan Perawatan Lanjutan',
        type: isSecondEpisodeDischarged ? 'discharge' : (isReferred ? 'visit' : 'readmit'),
        status: currentHospitalStatus,
        petugasNama: refTargetOfficer || 'Petugas Jasa Raharja',
        catatan: isReferred
          ? `Pasien dalam pemantauan petugas penanggung jawab di ${currentRs} pasca rujukan dari ${originRs}.`
          : (victim.catatanRawatLanjutan || `Pasien kembali mendapatkan perawatan di ${currentRs} sebagai periode perawatan baru setelah sebelumnya menyelesaikan perawatan di ${originRs}.`),
        tindakanList: ['Memastikan kondisi terbaru korban'],
        rawActivity: {
          id: `ACT-LANJUT-${victim.id}`,
          tanggal: admissionDate,
          tanggalKunjungan: admissionDate,
          waktuAktualKunjungan: admissionDate,
          rumahSakit: currentRs,
          petugasNama: refTargetOfficer,
          kondisiKorban: currentHospitalStatus,
          jenisAktivitas: isReferred ? 'Kunjungan Lanjutan di RS Rujukan' : 'Kunjungan Perawatan Lanjutan',
          hasilKunjungan: `Kunjungan perawatan pasien di ${currentRs}.`,
          catatanTambahan: victim.catatanRawatLanjutan || 'Pemantauan perawatan pasien di rumah sakit.',
          statusTindakLanjut: isSecondEpisodeDischarged ? 'Sudah Selesai' : 'Masih Perlu Ditindaklanjuti',
          checklistTindakan: ['Memastikan kondisi terbaru korban']
        }
      });
    }
  } else {
    // ── KASUS BIASA (SATU RUMAH SAKIT / BUKAN RAWAT LANJUTAN ANTAR-RS) ──
    const singleHospital = victim.rumahSakit || originRs || 'Rumah Sakit';
    const isSingleDischarged = Boolean(
      ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.kondisiTerakhir) ||
      ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.status_kondisi) ||
      victim.statusPemantauan === 'Selesai Dipantau' ||
      victim.statusPerawatan === 'Pulang'
    );

    // Kunjungan dari faskes lain dilarang muncul pada alur satu rumah sakit (non-rujukan)
    const validVisits = sortedVisits.filter((act) => {
      if (!act) return false;
      const vRs = act.rumahSakit;
      if (!vRs || vRs === '—') return true;
      return isSameHospital(vRs, singleHospital);
    });

    const allOfficers = typeof storageService?.getOfficers === 'function' ? storageService.getOfficers() : [];
    const officerForSingleRs = allOfficers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isSameHospital(rs, singleHospital))
    );
    const resolvedSingleOfficer = officerForSingleRs?.nama ||
      (isSameHospital(singleHospital, 'RS Syafira') ? 'Siti Isrizkiah' : null) ||
      (isSameHospital(singleHospital, 'RS Tabrani') ? 'Syaiful Hidayat' : null) ||
      (isSameHospital(singleHospital, 'RS Bhayangkara') ? 'Dimas Andaru' : null) ||
      victim.namaPetugas ||
      'Petugas Jasa Raharja';

    if (validVisits.length === 0) {
      journey.push({
        id: `JOURNEY-INIT-${victim.id}`,
        tanggal: initialDate,
        rumahSakit: singleHospital,
        judul: `Kunjungan Awal di ${singleHospital}`,
        jenis: 'Kunjungan Awal',
        type: isSingleDischarged ? 'discharge' : 'initial',
        status: isSingleDischarged ? 'Pulang' : (victim.kondisiTerakhir || 'Masih Dirawat'),
        petugasNama: victim.petugasAsalNama || resolvedSingleOfficer,
        catatan: victim.lokasiKejadian && victim.lokasiKejadian !== '—'
          ? `Pasien masuk fasilitas kesehatan pasca kejadian kecelakaan di ${victim.lokasiKejadian}.`
          : `Penerimaan awal dan rawatan pertama pasien di ${singleHospital}.`,
        rawActivity: {
          id: `ACT-INIT-${victim.id}`,
          tanggal: initialDate,
          tanggalKunjungan: initialDate,
          waktuAktualKunjungan: initialDate,
          rumahSakit: singleHospital,
          petugasNama: victim.petugasAsalNama || resolvedSingleOfficer,
          kondisiKorban: isSingleDischarged ? 'Pulang' : (victim.kondisiTerakhir || 'Masih Dirawat'),
          jenisAktivitas: 'Kunjungan Awal',
          hasilKunjungan: `Kunjungan awal di ${singleHospital}.`,
          statusTindakLanjut: isSingleDischarged ? 'Sudah Selesai' : 'Masih Perlu Ditindaklanjuti',
          checklistTindakan: ['Memastikan kondisi terbaru korban']
        }
      });
    } else {
      let physicalVisitIdx = 0;
      validVisits.forEach((act, idx) => {
        const isReactivate = Boolean(act.isReactivationLog || String(act.jenisAktivitas || '').includes('Aktivasi Pemantauan Kembali'));
        const isNonVisit = Boolean(act.isNonVisitConfirmation && !isReactivate);
        const isFirst = !isReactivate && !isNonVisit && (physicalVisitIdx++ === 0);
        const actDate = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || initialDate;
        const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
        const tindakanList = (act.checklistTindakan && act.checklistTindakan.length > 0)
          ? act.checklistTindakan
          : parsed.tindakanList;

        let hospitalName = singleHospital;
        let judul = isReactivate
          ? `Aktivasi Pemantauan Kembali (Rawat Lanjutan) di ${hospitalName}`
          : isNonVisit
            ? `Konfirmasi Kondisi Tanpa Kunjungan di ${hospitalName}`
            : isFirst
              ? `Kunjungan Awal di ${hospitalName}`
              : `Pemantauan Berkala di ${hospitalName}`;

        let type = isReactivate ? 'readmit' : (isFirst ? 'initial' : 'visit');
        let status = isReactivate ? 'Rawat Lanjutan' : (act.kondisiKorban || (isFirst ? 'Masih Dirawat' : 'Sedang Dipantau'));

        if (!isReactivate && (act.kondisiKorban === 'Sudah Pulang' || act.kondisiKorban === 'Pulang' || act.kondisiKorban === 'Selesai')) {
          status = 'Pulang';
          type = 'discharge';
        } else if (typeof act.kondisiKorban === 'string' && act.kondisiKorban.startsWith('Dirujuk')) {
          status = act.kondisiKorban;
          type = 'referral';
        } else if (act.kondisiKorban === 'Meninggal Dunia') {
          status = 'Meninggal Dunia';
          type = 'deceased';
        }

        journey.push({
          id: act.id || `JOURNEY-VISIT-${idx}`,
          tanggal: actDate,
          rumahSakit: hospitalName,
          judul,
          jenis: isReactivate ? 'Rawat Lanjutan' : (isNonVisit ? 'Konfirmasi Non-Kunjungan' : (isFirst ? 'Kunjungan Awal' : 'Pemantauan Berkala')),
          type,
          status,
          petugasNama: act.petugasNama || resolvedSingleOfficer,
          catatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan || act.catatan || 'Kunjungan telah selesai dilaksanakan.',
          tindakanList,
          rawActivity: act
        });
      });
    }
  }

  // 3. Gabungkan tahapan riwayat rujukan jika ada
  if (isReferred && !isMultiHospital && !journey.some((j) => j.type === 'referral' || j.status?.includes('Dirujuk'))) {
    if (victim.rumahSakitTujuan && victim.rumahSakitTujuan !== originRs) {
      journey.push({
        id: `JOURNEY-REF-GEN-${victim.id}`,
        tanggal: victim.tanggalRujukan || initialDate,
        rumahSakit: originRs,
        judul: `Pasien Dirujuk ke ${victim.rumahSakitTujuan}`,
        jenis: 'Rujukan ke RS Lain',
        type: 'referral',
        status: `Dirujuk ke ${victim.rumahSakitTujuan}`,
        petugasNama: victim.petugasAsalNama || victim.namaPetugas,
        catatan: `Pasien dialihkan dari ${originRs} ke ${victim.rumahSakitTujuan} untuk fasilitas medis lanjutan.`
      });

      if (victim.rujukanAccepted) {
        journey.push({
          id: `JOURNEY-REF-ACC-GEN-${victim.id}`,
          tanggal: victim.tanggalRujukan || initialDate,
          rumahSakit: victim.rumahSakitTujuan,
          judul: `Melanjutkan Pemantauan di ${victim.rumahSakitTujuan}`,
          jenis: 'Rujukan Aktif',
          type: 'referral_accepted',
          status: 'Sedang Dipantau',
          petugasNama: victim.petugasTujuanNama || victim.namaPetugas,
          catatan: `Pasien telah tiba dan pemantauan dilanjutkan oleh petugas di ${victim.rumahSakitTujuan}.`
        });
      }
    }
  }

  // 4. Tahapan khusus Korban Meninggal Dunia (MD) jika tercatat
  const isVictimDeceased = Boolean(
    victim.tanggalMeninggal ||
    victim.kondisiTerakhir === 'Meninggal Dunia' ||
    victim.status_kondisi === 'Meninggal Dunia'
  );

  if (isVictimDeceased && !journey.some((j) => j.type === 'deceased')) {
    const mdDate = (victim.tanggalMeninggal && victim.jamMeninggal)
      ? `${victim.tanggalMeninggal}T${victim.jamMeninggal}:00`
      : (victim.waktuMeninggal || victim.tanggalMeninggal || new Date().toISOString());

    journey.push({
      id: `JOURNEY-MD-${victim.id}`,
      tanggal: mdDate,
      rumahSakit: victim.rumahSakit || currentRs || originRs,
      judul: 'Korban Dinyatakan Meninggal Dunia (MD)',
      jenis: 'Status Akhir',
      type: 'deceased',
      status: 'Meninggal Dunia',
      petugasNama: victim.dicatatOleh || victim.namaPetugas,
      tanggalMeninggal: victim.tanggalMeninggal,
      jamMeninggal: victim.jamMeninggal,
      waktuPencatatanMD: victim.waktuPencatatanMD,
      catatan: `Korban dinyatakan Meninggal Dunia pada tanggal ${victim.tanggalMeninggal ? new Date(victim.tanggalMeninggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} pukul ${victim.jamMeninggal ? `${victim.jamMeninggal} WIB` : '—'}. Dicatat oleh: ${victim.dicatatOleh || victim.namaPetugas}. Pemantauan klinis berakhir.`,
      tindakanList: ['Pencatatan Status Meninggal Dunia (MD)', 'Proses Administrasi Santunan Ahli Waris']
    });
  }

  // Pastikan tanggal kronologis konsisten jika multi-RS: Seluruh episode RS Asal mendahului RS Lanjutan
  if (isMultiHospital) {
    const originItems = journey.filter((j) => j.rumahSakit && j.rumahSakit.toLowerCase().trim() === (originRs || '').toLowerCase().trim());
    const currentItems = journey.filter((j) => j.rumahSakit && j.rumahSakit.toLowerCase().trim() === (currentRs || '').toLowerCase().trim());

    if (originItems.length > 0 && currentItems.length > 0) {
      const latestOriginTime = Math.max(...originItems.map((o) => new Date(o.tanggal).getTime()));
      currentItems.forEach((c, cIdx) => {
        const cTime = new Date(c.tanggal).getTime();
        if (cTime <= latestOriginTime) {
          c.tanggal = new Date(latestOriginTime + (cIdx + 1) * 3600 * 1000).toISOString();
        }
      });
    }
  }

  // Urutkan kronologis naik (earliest to latest) dan berikan nomor urut unik
  const sortedJourney = journey
    .sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

  const seenKeys = new Set();
  return sortedJourney.map((item, idx) => {
    let finalId = item.id;
    if (!finalId || seenKeys.has(finalId)) {
      finalId = `JOURNEY-${idx}-${item.type || 'item'}`;
    }
    seenKeys.add(finalId);
    return { ...item, id: finalId, nomor: idx + 1 };
  });
}

const BEAD_THEMES = {
  initial: {
    bead: 'border-blue-500 text-blue-700 bg-blue-50 ring-4 ring-blue-50/70',
    dot: 'bg-blue-600',
    card: 'bg-white border-slate-200/90 hover:border-blue-300'
  },
  visit: {
    bead: 'border-sky-500 text-sky-700 bg-sky-50 ring-4 ring-sky-50/70',
    dot: 'bg-sky-600',
    card: 'bg-white border-slate-200/90 hover:border-sky-300'
  },
  discharge: {
    bead: 'border-emerald-500 text-emerald-700 bg-emerald-50 ring-4 ring-emerald-50/70',
    dot: 'bg-emerald-600',
    card: 'bg-emerald-50/20 border-emerald-200/80 hover:border-emerald-300'
  },
  readmit: {
    bead: 'border-indigo-500 text-indigo-700 bg-indigo-50 ring-4 ring-indigo-50/70',
    dot: 'bg-indigo-600',
    card: 'bg-indigo-50/20 border-indigo-200/80 hover:border-indigo-300'
  },
  referral: {
    bead: 'border-purple-500 text-purple-700 bg-purple-50 ring-4 ring-purple-50/70',
    dot: 'bg-purple-600',
    card: 'bg-purple-50/20 border-purple-200/80 hover:border-purple-300'
  },
  referral_accepted: {
    bead: 'border-violet-600 text-violet-800 bg-violet-50 ring-4 ring-violet-50/70',
    dot: 'bg-violet-600',
    card: 'bg-violet-50/20 border-violet-200/80 hover:border-violet-300'
  },
  deceased: {
    bead: 'border-red-500 text-red-700 bg-red-50 ring-4 ring-red-50/70',
    dot: 'bg-red-600',
    card: 'bg-red-50/20 border-red-200/80 hover:border-red-300'
  }
};

export default function RiwayatPerawatanTimeline({
  victim,
  onOpenTransitionModal,
  onSelectVisit,
  onOpenMonitoringModal,
  monitoringSla
}) {
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'table'
  const [expandedEpisodes, setExpandedEpisodes] = useState({});

  if (!victim) return null;

  const journey = buildPatientJourney(victim);
  const episodesAsc = groupCareEpisodes(victim);
  const episodesDesc = [...episodesAsc].reverse();
  const { isReferred, rsAsal, rsTujuan, rsSaatIni } = resolveReferralHospitals(victim);

  const isEpisodeExpanded = (ep, idx) => {
    if (Object.prototype.hasOwnProperty.call(expandedEpisodes, ep.id)) {
      return expandedEpisodes[ep.id];
    }
    return idx === 0; // Episode terbaru terbuka otomatis, episode sebelumnya dapat dibuka
  };

  const toggleEpisode = (epId, currentlyExpanded) => {
    setExpandedEpisodes((prev) => ({ ...prev, [epId]: !currentlyExpanded }));
  };

  const activeEpisode = episodesAsc.length > 0 ? episodesAsc[episodesAsc.length - 1] : null;
  const isFinishedNow = isVictimFinished(victim);
  const isDischarged = !isFinishedNow ? false : (activeEpisode?.statusEpisode === 'Selesai Pulang');
  const isDeceased = Boolean(
    victim.tanggalMeninggal ||
    victim.kondisiTerakhir === 'Meninggal Dunia' ||
    victim.status_kondisi === 'Meninggal Dunia'
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-5">
      {/* Header Bagian Bead Line & Riwayat Kunjungan */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Riwayat Penanganan
            </h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Arsip Kronologis (Read-Only)</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Timeline kronologis perjalanan penanganan korban dari rumah sakit asal hingga rumah sakit tujuan.
          </p>
        </div>

        {/* Controls: View Mode Toggle & Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Toggle View: Timeline Bead Line vs Tabel Kunjungan */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/90 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${viewMode === 'timeline'
                ? 'bg-white text-[#145DA0] shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Timeline (Bead Line)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${viewMode === 'table'
                ? 'bg-white text-[#145DA0] shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Tabel Kunjungan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Visual Rute Rujukan (HANYA tampil untuk status rujukan resmi aktif, BUKAN untuk rawatan lanjutan pasca pulang) */}
      {isReferred && !victim.isRawatLanjutan && !victim.rawatLanjutanDariPulang && victim.statusPerawatan !== 'Rawat Lanjutan' && rsAsal && rsSaatIni && (rsAsal.toLowerCase().trim() !== rsSaatIni.toLowerCase().trim()) && (
        <div className="bg-gradient-to-r from-purple-50/80 via-blue-50/40 to-purple-50/80 p-4 sm:p-5 rounded-2xl border border-purple-200/90 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex-1 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Rumah Sakit Asal
              </span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{rsAsal}</span>
              </div>
            </div>

            <div className="flex sm:flex-col items-center justify-center gap-1 px-3.5 py-1.5 bg-white/95 rounded-xl border border-purple-200 shadow-2xs shrink-0 self-start sm:self-auto">
              <ArrowRight className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider">
                Dirujuk ke
              </span>
            </div>

            <div className="flex-1 space-y-1 sm:text-right">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">
                Rumah Sakit Saat Ini
              </span>
              <div className="flex items-center sm:justify-end gap-1.5 font-extrabold text-purple-950 text-sm">
                <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{rsSaatIni}</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-purple-200/60 flex items-center gap-2 text-xs text-purple-900 font-medium">
            <Info className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span>
              <strong>Keterangan:</strong> Dirujuk dari <strong>{rsAsal}</strong> ke <strong>{rsSaatIni}</strong>.
            </span>
          </div>
        </div>
      )}

      {/* ── TAMPILAN TABEL KUNJUNGAN ATAU BEAD LINE TIMELINE ── */}
      {viewMode === 'table' ? (
        <div className="rounded-xl border border-slate-200/90 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-12 text-center">NO.</th>
                  <th className="py-3 px-4">AKTIVITAS / TAHAPAN</th>
                  <th className="py-3 px-4">RUMAH SAKIT</th>
                  <th className="py-3 px-4">TANGGAL &amp; WAKTU</th>
                  <th className="py-3 px-4">STATUS KONDISI</th>
                  <th className="py-3 px-4 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {episodesDesc.map((ep, epIdx) => {
                  const expanded = isEpisodeExpanded(ep, epIdx);
                  const epEvents = [
                    ...(ep.kunjunganList || []).map((vis) => ({
                      id: vis.id || vis.visitId,
                      judul: `Kunjungan ke-${vis.nomorKunjunganEpisode}`,
                      petugasNama: vis.petugasNama || ep.petugasNama,
                      rumahSakit: vis.rumahSakit || ep.rumahSakit,
                      tanggal: vis.waktuAktualKunjungan || vis.tanggalKunjungan || vis.tanggal,
                      status: vis.kondisiKorban || 'Masih Dirawat',
                      type: (vis.kondisiKorban === 'Sudah Pulang' || vis.kondisiKorban === 'Pulang' || vis.kondisiKorban === 'Selesai')
                        ? 'discharge'
                        : vis.kondisiKorban === 'Meninggal Dunia'
                          ? 'deceased'
                          : (vis.nomorKunjunganEpisode === 1 ? 'initial' : 'visit'),
                      rawActivity: vis,
                      _ts: parseDateToTimestamp(vis.waktuAktualKunjungan || vis.tanggalKunjungan || vis.tanggal)
                    })),
                    ...(ep.rujukanList || []).map((ref, rIdx) => ({
                      id: `REF-${ep.id}-${rIdx}`,
                      judul: `Rujukan ke ${ref.keRs}`,
                      petugasNama: ref.petugasAsalNama || ep.petugasNama,
                      rumahSakit: `${ref.dariRs} → ${ref.keRs}`,
                      tanggal: ref.tanggal,
                      status: `Dirujuk ke ${ref.keRs}`,
                      type: 'referral',
                      rawActivity: null,
                      _ts: parseDateToTimestamp(ref.tanggal)
                    })),
                    ...(ep.nonVisitLogs || []).map((log, lIdx) => ({
                      id: log.id || `LOG-${ep.id}-${lIdx}`,
                      judul: log.jenisAktivitas || 'Catatan Status',
                      petugasNama: log.petugasNama || ep.petugasNama,
                      rumahSakit: log.rumahSakit || ep.rumahSakit,
                      tanggal: log.tanggal,
                      status: log.kondisiKorban || ep.statusEpisode,
                      type: log.isReactivationLog ? 'readmit' : 'visit',
                      rawActivity: null,
                      _ts: parseDateToTimestamp(log.tanggal)
                    }))
                  ].sort((a, b) => b._ts - a._ts);

                  return (
                    <React.Fragment key={ep.id}>
                      {/* Baris Header Episode dengan Panah Lipat di Kolom NO. */}
                      <tr
                        onClick={() => toggleEpisode(ep.id, expanded)}
                        className={`cursor-pointer transition-colors ${ep.isAktif ? 'bg-sky-50/70 hover:bg-sky-50' : 'bg-slate-100/80 hover:bg-slate-100'}`}
                      >
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-600 shadow-2xs">
                            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5 rotate-90" />}
                          </span>
                        </td>
                        <td colSpan={2} className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${ep.isAktif ? 'bg-[#145DA0] text-white' : 'bg-slate-200 text-slate-700'}`}>
                              {ep.labelPeriode}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {ep.rumahSakitList.length > 1 ? ep.rumahSakitList.join(' → ') : ep.rumahSakit}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              • {ep.totalKunjungan} Kunjungan
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-600 whitespace-nowrap">
                          Mulai: <strong>{formatDate(ep.tanggalMulai)}</strong>
                          {!ep.isAktif && ep.tanggalSelesai ? ` · Selesai: ${formatDate(ep.tanggalSelesai)}` : ''}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <MonitoringStatusBadge status={ep.statusEpisode} size="xs" />
                        </td>
                        <td className="py-3 px-4 text-right text-[11px] font-semibold text-[#145DA0] whitespace-nowrap">
                          {expanded ? 'Tutup' : 'Buka'}
                        </td>
                      </tr>

                      {/* Baris Kunjungan di dalam Episode */}
                      {expanded && (epEvents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 px-4 text-center text-xs text-slate-500 italic bg-white">
                            Belum ada kunjungan fisik tercatat pada episode ini.
                          </td>
                        </tr>
                      ) : epEvents.map((item, idx) => {
                        const theme = BEAD_THEMES[item.type] || BEAD_THEMES.initial;
                        return (
                          <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors bg-white">
                            <td className="py-3.5 px-4 font-mono text-slate-400 text-center font-medium">
                              {String(idx + 1).padStart(2, '0')}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">{item.judul}</span>
                                <span className="text-[10px] text-slate-400 font-normal block mt-0.5">
                                  {item.petugasNama ? `Petugas: ${item.petugasNama}` : 'Sistem Jasa Raharja'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-800 font-medium whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{item.rumahSakit}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                              <span className="font-semibold text-slate-800 block text-xs">
                                {formatDate(item.tanggal)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {formatTime(item.tanggal)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                                <span>{item.status}</span>
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              {item.rawActivity && onSelectVisit ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectVisit(item.rawActivity)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                                  title="Buka rincian lengkap kunjungan ini (Read-Only)"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Detail</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">Arsip Sistem</span>
                              )}
                            </td>
                          </tr>
                        );
                      }))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAMPILAN KRONOLOGIS BERDASARKAN EPISODE PERAWATAN (TERBARU PALING ATAS) */
        <div className="space-y-4">
          {episodesDesc.map((ep, epIdx) => {
            const expanded = isEpisodeExpanded(ep, epIdx);
            const visitsDesc = [...(ep.kunjunganList || [])].reverse();
            return (
              <div
                key={ep.id}
                className={`rounded-2xl border overflow-hidden transition-all ${ep.isAktif
                  ? 'border-sky-300 bg-white shadow-2xs'
                  : 'border-slate-200 bg-slate-50/40'
                  }`}
              >
                {/* Header Episode (Klik untuk buka/tutup riwayat episode sebelumnya) */}
                <button
                  type="button"
                  onClick={() => toggleEpisode(ep.id, expanded)}
                  className={`w-full text-left p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer ${ep.isAktif ? 'bg-sky-50/50 hover:bg-sky-50/80' : 'bg-slate-100/70 hover:bg-slate-100'
                    }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${ep.isAktif ? 'bg-[#145DA0] text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                        {ep.labelPeriode}
                      </span>
                      <MonitoringStatusBadge status={ep.statusEpisode} size="xs" />
                      {ep.rujukanList.length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                          Rujukan Antar-RS
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold flex-wrap pt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{ep.rumahSakitList.length > 1 ? ep.rumahSakitList.join(' → ') : ep.rumahSakit}</span>
                      <span className="text-slate-300">•</span>
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{ep.petugasNama}</span>
                      <span className="text-slate-300">•</span>
                      <span>{ep.totalKunjungan} Kunjungan</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
                    <div className="text-[11px] text-slate-600 text-left sm:text-right">
                      <div>Mulai: <strong className="text-slate-800">{formatDate(ep.tanggalMulai)}</strong></div>
                      <div>
                        {ep.isAktif ? (
                          <span className="text-sky-700 font-semibold">Masih Berlangsung</span>
                        ) : (
                          <span>Selesai: <strong className="text-slate-800">{formatDate(ep.tanggalSelesai)}</strong></span>
                        )}
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500">
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="p-4 sm:p-5 space-y-4 border-t border-slate-200/80 bg-white">
                    {/* Riwayat Rujukan dalam Episode Ini */}
                    {ep.rujukanList.length > 0 && (
                      <div className="space-y-2">
                        {ep.rujukanList.map((ref, rIdx) => (
                          <div key={rIdx} className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 text-xs flex items-start gap-2.5">
                            <ArrowUpRight className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold text-purple-950">
                                Rujukan: {ref.dariRs} → {ref.keRs}
                              </div>
                              <div className="text-[11px] text-purple-800 mt-0.5">
                                {formatDateTime(ref.tanggal)}
                                {ref.petugasAsalNama ? ` • Petugas Asal: ${ref.petugasAsalNama}` : ''}
                                {ref.petugasTujuanNama ? ` • Petugas Tujuan: ${ref.petugasTujuanNama}` : ''}
                              </div>
                              {ref.catatan && <p className="text-[11px] text-purple-900 mt-1">{ref.catatan}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Log Non-Kunjungan (Aktivasi Ulang / Konfirmasi Tanpa Kunjungan) */}
                    {ep.nonVisitLogs && ep.nonVisitLogs.length > 0 && (
                      <div className="space-y-2">
                        {ep.nonVisitLogs.map((log, lIdx) => (
                          <div key={log.id || lIdx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-start justify-between gap-3">
                            <div>
                              <span className="font-bold text-slate-800 block">{log.jenisAktivitas || 'Catatan Status'}</span>
                              <span className="text-[11px] text-slate-500 block">{formatDateTime(log.tanggal)} • {log.petugasNama}</span>
                              {log.hasilKomunikasi && <p className="text-[11px] text-slate-700 mt-1">{log.hasilKomunikasi}</p>}
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 shrink-0">
                              {log.kondisiKorban || 'Terkonfirmasi'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Daftar Kunjungan Petugas dalam Episode Ini */}
                    {visitsDesc.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-xs text-slate-500">
                        Belum ada kunjungan fisik tercatat pada episode ini.
                      </div>
                    ) : (
                      <div className="relative pl-10 sm:pl-12 space-y-4">
                        <div className="absolute left-[15px] sm:left-[19px] top-3 bottom-3 w-0.5 bg-slate-200" />
                        {visitsDesc.map((vis, vIdx) => {
                          const visCond = vis.kondisiKorban || 'Masih Dirawat';
                          const isDisch = visCond === 'Sudah Pulang' || visCond === 'Pulang' || visCond === 'Selesai';
                          const isMd = visCond === 'Meninggal Dunia';
                          const theme = isMd ? BEAD_THEMES.deceased : isDisch ? BEAD_THEMES.discharge : (vis.nomorKunjunganEpisode === 1 ? BEAD_THEMES.initial : BEAD_THEMES.visit);
                          const visDate = vis.waktuAktualKunjungan || vis.tanggalKunjungan || vis.tanggal;

                          return (
                            <div key={vis.id || vis.visitId || vIdx} className="relative group">
                              <div className={`absolute -left-10 sm:-left-12 top-1.5 w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 bg-white flex items-center justify-center font-black text-xs z-10 ${theme.bead}`}>
                                {vis.nomorKunjunganEpisode}
                              </div>
                              <div className={`rounded-xl border p-3.5 sm:p-4 shadow-2xs space-y-2 ${theme.card}`}>
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-2">
                                  <div>
                                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                                      Kunjungan ke-{vis.nomorKunjunganEpisode} di {vis.rumahSakit || ep.rumahSakit}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                                      <span className="font-semibold text-slate-700">{formatDateTime(visDate)}</span>
                                      <span className="text-slate-300">•</span>
                                      <span className="inline-flex items-center gap-1 text-slate-600">
                                        <Building2 className="w-3 h-3 text-slate-400" />
                                        <span>{vis.rumahSakit || ep.rumahSakit}</span>
                                      </span>
                                      <span className="text-slate-300">•</span>
                                      <span className="inline-flex items-center gap-1 text-slate-600">
                                        <User className="w-3 h-3 text-slate-400" />
                                        <span>{vis.petugasNama || ep.petugasNama}</span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                      <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                                      <span>{visCond}</span>
                                    </span>
                                    {onSelectVisit && (
                                      <button
                                        type="button"
                                        onClick={() => onSelectVisit(vis)}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#145DA0] hover:text-[#0f497e] bg-slate-50 hover:bg-blue-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>Lihat Detail</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {vis.cleanCatatan && !isNoteDuplicateOfActions(vis.cleanCatatan, vis.tindakanList) && (
                                  <p className="text-xs text-slate-600 leading-relaxed">{vis.cleanCatatan}</p>
                                )}

                                {Array.isArray(vis.tindakanList) && vis.tindakanList.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    {vis.tindakanList.map((action, i) => (
                                      <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-slate-50 text-slate-600 border border-slate-200/80 px-2 py-0.5 rounded-md">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                        <span>{action}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Banner Jadwal Berikutnya hanya pada Episode Aktif */}
                    {ep.isAktif && !isFinishedNow && monitoringSla && !monitoringSla.isCompleted && monitoringSla.needed !== false && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs">
                          <span className="font-bold text-slate-900">Jadwal Pemantauan Berkala Berikutnya</span>
                          <p className="text-slate-600 mt-0.5">
                            Batas waktu 3 hari:{' '}
                            <strong className={monitoringSla.isOverdue ? 'text-rose-600' : 'text-slate-800'}>
                              {formatDateTime(monitoringSla.dueDate)}
                            </strong>{' '}
                            ({monitoringSla.description || 'Dalam batas waktu'})
                          </p>
                        </div>
                        {onOpenMonitoringModal && (
                          <button
                            type="button"
                            onClick={onOpenMonitoringModal}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-colors shrink-0 cursor-pointer"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>+ Catat Kunjungan ke-{ep.totalKunjungan + 1}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Ringkasan Penutupan Episode (Pulang / MD / Tolak JR) */}
                    {!ep.isAktif && (
                      <div className={`rounded-xl border p-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${ep.statusEpisode === 'Selesai MD'
                        ? 'bg-rose-50/60 border-rose-200 text-rose-900'
                        : ep.statusEpisode === 'Selesai Tidak Bersedia'
                          ? 'bg-stone-100 border-stone-300 text-stone-800'
                          : 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                        }`}>
                        <div>
                          <span className="font-bold block">
                            {ep.statusEpisode === 'Selesai MD'
                              ? `Episode Berakhir: Meninggal Dunia (${formatDate(ep.tanggalSelesai)}${ep.jamMeninggal ? `, ${ep.jamMeninggal} WIB` : ''})`
                              : ep.statusEpisode === 'Selesai Tidak Bersedia'
                                ? `Episode Berakhir: Tidak Bersedia Jaminan JR (${formatDate(ep.tanggalSelesai)})`
                                : `Episode Berakhir: Selesai Pulang (${formatDate(ep.tanggalSelesai)})`}
                          </span>
                          {ep.keteranganSelesai && <p className="text-[11px] mt-0.5 opacity-90">{ep.keteranganSelesai}</p>}
                        </div>
                        {ep.statusEpisode === 'Selesai Pulang' && epIdx === 0 && onOpenTransitionModal && (
                          <button
                            type="button"
                            onClick={() => onOpenTransitionModal('RAWAT_LANJUTAN')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-2xs transition-colors shrink-0 cursor-pointer self-start sm:self-center"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Kembali Berobat (Buat Episode Baru)</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
