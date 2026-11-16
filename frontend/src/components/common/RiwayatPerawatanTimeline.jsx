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
  PlusCircle,
  Eye,
  Lock,
  List,
  GitCommit
} from 'lucide-react';
import { parseCatatanKondisi, parseDateToTimestamp } from '../../services/backendMapper';
import { groupCareEpisodes } from '../../services/careHistoryService';
import RiwayatPerawatanAntarRs from './RiwayatPerawatanAntarRs';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const ts = parseDateToTimestamp(dateStr);
    if (!ts || isNaN(ts)) return dateStr;
    const d = new Date(ts);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const ts = parseDateToTimestamp(dateStr);
    if (!ts || isNaN(ts)) return '';
    const d = new Date(ts);
    return `${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
  } catch {
    return '';
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const fd = formatDate(dateStr);
  const ft = formatTime(dateStr);
  return ft ? `${fd}, ${ft}` : fd;
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
    const isDistinct = Boolean(
      rsAsalVal && rsSaatIniVal &&
      rsAsalVal.toLowerCase().trim() !== rsSaatIniVal.toLowerCase().trim()
    );
    return {
      isReferred: isDistinct,
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

  const isReferred =
    Boolean(rsTujuan && rsAsal && rsTujuan !== rsAsal) ||
    Boolean(victim.rumahSakitAsal && victim.rumahSakit && victim.rumahSakitAsal !== victim.rumahSakit) ||
    Boolean(victim.rumahSakitTujuan && victim.rumahSakit && victim.rumahSakitTujuan !== victim.rumahSakitAsal) ||
    (typeof victim.kondisiTerakhir === 'string' && victim.kondisiTerakhir.startsWith('Dirujuk')) ||
    (typeof victim.statusPemantauan === 'string' && victim.statusPemantauan.startsWith('Dirujuk')) ||
    victim.statusPerawatan === 'Rujukan' ||
    victim.statusPerawatan === 'Rujukan Diterima' ||
    Boolean(victim.isRujukanMasuk) ||
    Boolean(victim.rujukanAccepted) ||
    (Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.length > 0) ||
    (Array.isArray(victim.referrals) && victim.referrals.length > 0);

  // Jika pasien berstatus rujukan tapi salah satu nama belum terisi:
  if (isReferred) {
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
  if (isReferred && rsSaatIni === rsAsal && rsTujuan !== rsAsal) {
    rsSaatIni = rsTujuan;
  }

  // Rujukan visual valid HANYA jika RS Asal dan RS Saat Ini benar-benar berbeda
  const isActuallyReferred = Boolean(
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
  if (Array.isArray(victim.careEpisodes) && victim.careEpisodes.length >= 2) {
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

          const visitStatus = isEpDischarged
            ? 'Pulang'
            : (act.kondisiKorban && act.kondisiKorban !== 'Pulang' ? act.kondisiKorban : (ep.status || 'Sedang Dipantau'));

          const judul = isFirstInEp
            ? (isFirstEpisode ? `Kunjungan Awal di ${epHospital}` : `Kunjungan Perawatan di ${epHospital}`)
            : `Pemantauan Berkala di ${epHospital}`;

          const type = visitStatus === 'Pulang'
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
    hasDistinctHospitals && (
      victim.isRawatLanjutan ||
      victim.rawatLanjutanDariPulang ||
      victim.statusPerawatan === 'Rawat Lanjutan' ||
      (Array.isArray(victim.careEpisodes) && victim.careEpisodes.length > 1) ||
      Boolean(victim.rumahSakitAsal && victim.rumahSakit && victim.rumahSakitAsal.trim().toLowerCase() !== victim.rumahSakit.trim().toLowerCase())
    )
  );

  if (isMultiHospital) {
    // ── MULTI-HOSPITAL RAWAT LANJUTAN SCENARIO (No. 1: RS Asal/Prima, No. 2: RS Lanjutan/Syafira) ──
    const originVisits = [];
    const currentVisits = [];

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

    // 1. TAHAPAN RS ASAL / RS PERTAMA (Misal: RS Prima Pekanbaru) -> NO. 1
    if (originVisits.length > 0) {
      originVisits.forEach((act, idx) => {
        const isFirst = idx === 0;
        const actDate = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || (victim.tanggalMasukAwal || initialDate);
        const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
        const tindakanList = (act.checklistTindakan && act.checklistTindakan.length > 0)
          ? act.checklistTindakan
          : parsed.tindakanList;

        journey.push({
          id: act.id || `JOURNEY-ORIGIN-${idx}`,
          tanggal: actDate,
          rumahSakit: originRs,
          judul: isFirst ? `Kunjungan Awal di ${originRs}` : `Pemantauan Berkala di ${originRs}`,
          jenis: isFirst ? 'Kunjungan Awal' : 'Pemantauan Berkala',
          type: 'discharge',
          status: 'Pulang',
          petugasNama: act.petugasNama || victim.petugasAsalNama || victim.namaPetugas,
          catatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || `Pasien pertama kali mendapatkan perawatan di ${originRs}. Seluruh riwayat kunjungan dan pemantauan tersimpan. Pasien telah dinyatakan pulang dan proses pemantauan di ${originRs} telah selesai (Arsip Read-Only).`,
          tindakanList: tindakanList.length > 0 ? tindakanList : ['Memastikan kondisi terbaru korban', 'Memberikan Edukasi kepada pihak keluarga korban'],
          rawActivity: {
            ...act,
            rumahSakit: originRs,
            kondisiKorban: 'Pulang',
            jenisAktivitas: isFirst ? 'Kunjungan Awal' : 'Pemantauan Berkala',
            statusTindakLanjut: 'Sudah Selesai',
            hasilKunjungan: `Pasien telah menyelesaikan masa perawatan di ${originRs} dan dinyatakan pulang.`
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
        type: 'discharge',
        status: 'Pulang',
        petugasNama: victim.petugasAsalNama || victim.namaPetugas || 'Petugas Jasa Raharja',
        catatan: `Pasien pertama kali mendapatkan perawatan di ${originRs}. Seluruh riwayat kunjungan dan pemantauan tersimpan. Pasien telah dinyatakan pulang dan proses pemantauan di ${originRs} telah selesai (Arsip Read-Only).`,
        tindakanList: ['Memastikan kondisi terbaru korban', 'Memberikan Edukasi kepada pihak keluarga korban'],
        rawActivity: {
          id: `ACT-ORIGIN-${victim.id}`,
          tanggal: originDate,
          tanggalKunjungan: originDate,
          waktuAktualKunjungan: originDate,
          rumahSakit: originRs,
          petugasNama: victim.petugasAsalNama || victim.namaPetugas,
          kondisiKorban: 'Pulang',
          jenisAktivitas: 'Kunjungan Awal',
          hasilKunjungan: `Pasien telah menyelesaikan masa perawatan awal di ${originRs} dan dinyatakan pulang.`,
          catatanTambahan: 'Kunjungan dan penanganan awal selesai. Menunggu kelengkapan berkas.',
          statusTindakLanjut: 'Sudah Selesai',
          checklistTindakan: ['Memastikan kondisi terbaru korban', 'Memberikan Edukasi kepada pihak keluarga korban']
        }
      });
    }

    // 2. TAHAPAN RS KEDUA / PERIODE PERAWATAN BARU (Misal: RS Syafira Pekanbaru) -> NO. 2 dst.
    const isSecondEpisodeDischarged = Boolean(
      ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.kondisiTerakhir) ||
      ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.status_kondisi)
    );

    const currentHospitalStatus = isSecondEpisodeDischarged
      ? 'Pulang'
      : (victim.kondisiTerakhir === 'Luka Berat' ? 'Sedang Dirawat' : (victim.kondisiTerakhir || 'Sedang Dirawat'));

    if (currentVisits.length > 0) {
      currentVisits.forEach((act, idx) => {
        const isFirstInCurrent = idx === 0;
        const actDate = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || (victim.tanggalMasukTerbaru || new Date().toISOString());
        const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
        const tindakanList = (act.checklistTindakan && act.checklistTindakan.length > 0)
          ? act.checklistTindakan
          : parsed.tindakanList;

        const visitStatus = isSecondEpisodeDischarged
          ? 'Pulang'
          : (act.kondisiKorban && act.kondisiKorban !== 'Pulang' ? act.kondisiKorban : currentHospitalStatus);

        journey.push({
          id: act.id || `JOURNEY-CURRENT-${idx}`,
          tanggal: actDate,
          rumahSakit: currentRs,
          judul: isFirstInCurrent ? `Kunjungan Perawatan di ${currentRs}` : `Pemantauan Berkala di ${currentRs}`,
          jenis: isFirstInCurrent ? 'Kunjungan Perawatan Lanjutan' : 'Pemantauan Berkala',
          type: visitStatus === 'Pulang' ? 'discharge' : (isFirstInCurrent ? 'readmit' : 'visit'),
          status: visitStatus,
          petugasNama: act.petugasNama || victim.namaPetugas,
          catatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || `Pasien kembali mendapatkan perawatan di ${currentRs} sebagai periode perawatan baru.`,
          tindakanList: tindakanList.length > 0 ? tindakanList : ['Memastikan kondisi terbaru korban'],
          rawActivity: {
            ...act,
            rumahSakit: currentRs,
            kondisiKorban: visitStatus,
            jenisAktivitas: isFirstInCurrent ? 'Kunjungan Perawatan Lanjutan' : 'Pemantauan Berkala'
          }
        });
      });
    } else {
      const admissionDate = victim.tanggalMasukTerbaru || victim.tanggalMasukRs || new Date().toISOString();
      journey.push({
        id: `JOURNEY-LANJUT-RS2-${victim.id}`,
        tanggal: admissionDate,
        rumahSakit: currentRs,
        judul: `Kunjungan Perawatan di ${currentRs}`,
        jenis: 'Kunjungan Perawatan Lanjutan',
        type: isSecondEpisodeDischarged ? 'discharge' : 'readmit',
        status: currentHospitalStatus,
        petugasNama: victim.namaPetugas || 'Petugas Jasa Raharja',
        catatan: victim.catatanRawatLanjutan || `Pasien kembali mendapatkan perawatan di ${currentRs} sebagai periode perawatan baru setelah sebelumnya menyelesaikan perawatan di ${originRs}.`,
        tindakanList: ['Memastikan kondisi terbaru korban'],
        rawActivity: {
          id: `ACT-LANJUT-${victim.id}`,
          tanggal: admissionDate,
          tanggalKunjungan: admissionDate,
          waktuAktualKunjungan: admissionDate,
          rumahSakit: currentRs,
          petugasNama: victim.namaPetugas,
          kondisiKorban: currentHospitalStatus,
          jenisAktivitas: 'Kunjungan Perawatan Lanjutan',
          hasilKunjungan: `Kunjungan perawatan pasien di ${currentRs}.`,
          catatanTambahan: victim.catatanRawatLanjutan || 'Pemantauan perawatan pasien di rumah sakit.',
          statusTindakLanjut: isSecondEpisodeDischarged ? 'Sudah Selesai' : 'Masih Perlu Ditindaklanjuti',
          checklistTindakan: ['Memastikan kondisi terbaru korban']
        }
      });
    }
  } else {
    // ── KASUS BIASA (SATU RUMAH SAKIT / BUKAN RAWAT LANJUTAN ANTAR-RS) ──
    const singleHospital = originRs || victim.rumahSakit || 'Rumah Sakit';
    const isSingleDischarged = Boolean(
      ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.kondisiTerakhir) ||
      ['Sudah Pulang', 'Pulang', 'Selesai'].includes(victim.status_kondisi) ||
      victim.statusPemantauan === 'Selesai Dipantau' ||
      victim.statusPerawatan === 'Pulang'
    );

    if (sortedVisits.length === 0) {
      journey.push({
        id: `JOURNEY-INIT-${victim.id}`,
        tanggal: initialDate,
        rumahSakit: singleHospital,
        judul: `Kunjungan Awal di ${singleHospital}`,
        jenis: 'Kunjungan Awal',
        type: isSingleDischarged ? 'discharge' : 'initial',
        status: isSingleDischarged ? 'Pulang' : (victim.kondisiTerakhir || 'Masih Dirawat'),
        petugasNama: victim.petugasAsalNama || victim.namaPetugas || 'Petugas Jasa Raharja',
        catatan: victim.lokasiKejadian && victim.lokasiKejadian !== '—'
          ? `Pasien masuk fasilitas kesehatan pasca kejadian kecelakaan di ${victim.lokasiKejadian}.`
          : `Penerimaan awal dan rawatan pertama pasien di ${singleHospital}.`,
        rawActivity: {
          id: `ACT-INIT-${victim.id}`,
          tanggal: initialDate,
          tanggalKunjungan: initialDate,
          waktuAktualKunjungan: initialDate,
          rumahSakit: singleHospital,
          petugasNama: victim.petugasAsalNama || victim.namaPetugas,
          kondisiKorban: isSingleDischarged ? 'Pulang' : (victim.kondisiTerakhir || 'Masih Dirawat'),
          jenisAktivitas: 'Kunjungan Awal',
          hasilKunjungan: `Kunjungan awal di ${singleHospital}.`,
          statusTindakLanjut: isSingleDischarged ? 'Sudah Selesai' : 'Masih Perlu Ditindaklanjuti',
          checklistTindakan: ['Memastikan kondisi terbaru korban']
        }
      });
    } else {
      sortedVisits.forEach((act, idx) => {
        const isFirst = idx === 0;
        const actDate = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || initialDate;
        const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
        const tindakanList = (act.checklistTindakan && act.checklistTindakan.length > 0)
          ? act.checklistTindakan
          : parsed.tindakanList;

        let hospitalName = act.rumahSakit && act.rumahSakit !== '—' ? act.rumahSakit : singleHospital;
        let judul = isFirst
          ? `Kunjungan Awal di ${hospitalName}`
          : `Pemantauan Berkala di ${hospitalName}`;

        let type = isFirst ? 'initial' : 'visit';
        let status = act.kondisiKorban || (isFirst ? 'Masih Dirawat' : 'Sedang Dipantau');

        if (act.kondisiKorban === 'Sudah Pulang' || act.kondisiKorban === 'Pulang' || act.kondisiKorban === 'Selesai' || isSingleDischarged) {
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
          jenis: isFirst ? 'Kunjungan Awal' : 'Pemantauan Berkala',
          type,
          status,
          petugasNama: act.petugasNama || victim.namaPetugas,
          catatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan || act.catatan || 'Kunjungan telah selesai dilaksanakan.',
          tindakanList,
          rawActivity: act
        });
      });
    }
  }

  // 3. Gabungkan tahapan riwayat rujukan jika ada (Hanya untuk rujukan resmi aktif, BUKAN untuk rawatan lanjutan pasca pulang)
  if (isReferred && !isMultiHospital && !victim.isRawatLanjutan && !victim.rawatLanjutanDariPulang && !journey.some((j) => j.type === 'referral' || j.status?.includes('Dirujuk'))) {
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

  if (!victim) return null;

  const journey = buildPatientJourney(victim);
  const { isReferred, rsAsal, rsTujuan, rsSaatIni } = resolveReferralHospitals(victim);

  const activeEpisode = Array.isArray(victim.careEpisodes) && victim.careEpisodes.length > 0
    ? victim.careEpisodes[victim.careEpisodes.length - 1]
    : null;

  const lastJourneyItem = journey.length > 0 ? journey[journey.length - 1] : null;
  const isLastJourneyDischarged = Boolean(
    lastJourneyItem && (
      lastJourneyItem.status === 'Pulang' ||
      lastJourneyItem.status === 'Sudah Pulang' ||
      lastJourneyItem.status === 'Selesai' ||
      lastJourneyItem.type === 'discharge'
    )
  );

  const isDischarged = activeEpisode
    ? Boolean(
        activeEpisode.status === 'Pulang' ||
        activeEpisode.kondisiTerakhir === 'Pulang' ||
        activeEpisode.kondisiTerakhir === 'Sudah Pulang'
      )
    : Boolean(
        isLastJourneyDischarged ||
        victim.kondisiTerakhir === 'Sudah Pulang' ||
        victim.kondisiTerakhir === 'Pulang' ||
        victim.kondisiTerakhir === 'Selesai' ||
        victim.statusPemantauan === 'Selesai Dipantau' ||
        victim.status_kondisi === 'Selesai' ||
        victim.status_kondisi === 'Sudah Pulang' ||
        victim.status_kondisi === 'Pulang'
      );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-5">
      {/* Header Bagian Bead Line & Riwayat Kunjungan */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Riwayat Perjalanan &amp; Kunjungan Korban
            </h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Arsip Kronologis (Read-Only)</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Rekam jejak seluruh kunjungan dan periode perawatan korban di rumah sakit.
          </p>
        </div>

        {/* Controls: View Mode Toggle & Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Toggle View: Timeline Bead Line vs Tabel Kunjungan */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/90 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'timeline'
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
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                viewMode === 'table'
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
                {journey.map((item, idx) => {
                  const theme = BEAD_THEMES[item.type] || BEAD_THEMES.initial;
                  return (
                    <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-center font-medium">
                        {String(item.nomor).padStart(2, '0')}
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
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAMPILAN BEAD LINE (TIMELINE DENGAN MANIK-MANIK BULAT) */
        <div className="relative pl-11 sm:pl-14 space-y-5 pt-1">
          {/* Continuous Vertical Spine Line (Garis penghubung manik-manik) */}
          <div className="absolute left-[17px] sm:left-[21px] top-4 bottom-4 w-0.5 bg-slate-200" />

          {journey.map((item) => {
            const theme = BEAD_THEMES[item.type] || BEAD_THEMES.initial;

            return (
              <div key={item.id} className="relative group">
                {/* Bead (Manik-manik Bulat dengan Nomor Urut) */}
                <div
                  className={`absolute -left-11 sm:-left-14 top-1.5 w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 bg-white flex items-center justify-center font-black text-xs sm:text-sm z-10 transition-transform group-hover:scale-105 ${theme.bead}`}
                >
                  {item.nomor}
                </div>

                {/* Card Konten Milestone */}
                <div
                  className={`rounded-xl border p-4 sm:p-4.5 shadow-2xs transition-all space-y-2.5 ${theme.card}`}
                >
                  {/* Baris 1: Judul Milestone, Status Ringkas, & Tombol Lihat Detail */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {item.judul}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                        <span className="font-semibold text-slate-700">{formatDateTime(item.tanggal)}</span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 text-slate-600">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.rumahSakit}</span>
                        </span>
                        {item.petugasNama && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="flex items-center gap-1 text-slate-600">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{item.petugasNama}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                      {/* Status Ringkas Tanpa Badge Berlebihan */}
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                        <span>{item.status}</span>
                      </span>

                      {/* Tombol Lihat Detail (jika ada data kunjungan) */}
                      {item.rawActivity && onSelectVisit && (
                        <button
                          type="button"
                          onClick={() => onSelectVisit(item.rawActivity)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#145DA0] hover:text-[#0f497e] bg-slate-50 hover:bg-blue-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          title="Buka rincian lengkap kunjungan ini (Read-Only)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Detail</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Baris 2: Catatan / Keterangan Kejadian */}
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.catatan}
                  </p>

                  {/* Checklist Tindakan Ringkas (jika ada) */}
                  {Array.isArray(item.tindakanList) && item.tindakanList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.tindakanList.map((action, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-[11px] bg-slate-50 text-slate-600 border border-slate-200/80 px-2 py-0.5 rounded-md"
                        >
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

          {/* Kondisi 1: Pasien Masih Dalam Perawatan Aktif (Tampilkan Jadwal Pemantauan Berikutnya) */}
          {!isDischarged && !victim.statusPemantauan?.startsWith('Dirujuk') && monitoringSla && !monitoringSla.isCompleted && monitoringSla.needed !== false && (
            <div className="relative group pt-1">
              {/* Bead Berikutnya (Garis Putus-Putus) */}
              <div className="absolute -left-11 sm:-left-14 top-2 w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-dashed border-[#145DA0] bg-blue-50/70 text-[#145DA0] flex items-center justify-center font-bold text-xs sm:text-sm z-10 shadow-xs">
                {journey.length + 1}
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      Jadwal Pemantauan Berkala di {rsSaatIni}
                    </h4>
                    <span className="text-[10px] font-semibold text-[#145DA0] bg-blue-100/70 px-2 py-0.5 rounded-full">
                      Menunggu Pelaksanaan
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Batas maksimal SLA 3 hari:{' '}
                    <strong className={monitoringSla.isOverdue ? 'text-rose-600 font-bold' : 'text-slate-800'}>
                      {formatDateTime(monitoringSla.dueDate)}
                    </strong>{' '}
                    ({monitoringSla.description || 'Dalam batas waktu SLA'}).
                  </p>
                </div>

                {onOpenMonitoringModal && (
                  <button
                    type="button"
                    onClick={onOpenMonitoringModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-colors shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>+ Catat Pemantauan Hari Ini</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Kondisi 2: Pasien Sudah Pulang (Pemantauan Selesai, Tidak Ada Jadwal Lanjutan, Menunggu Berkas) */}
          {isDischarged && (
            <div className="relative group pt-1">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Proses Pemantauan di Rumah Sakit Telah Selesai
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Pasien telah dinyatakan pulang. Petugas hanya menunggu kelengkapan berkas dari rumah sakit apabila masih ada dokumen yang belum diterima.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 px-3 py-1.5 rounded-full shrink-0 self-start sm:self-auto">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Selesai / Menunggu Berkas</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
