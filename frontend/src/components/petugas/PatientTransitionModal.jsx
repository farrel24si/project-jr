import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../common/Modal';
import { 
  Building2, 
  ArrowRight, 
  User, 
  Calendar, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight,
  Activity,
  ShieldAlert
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { INITIAL_HOSPITALS } from '../../services/initialDataset';

export default function PatientTransitionModal({
  isOpen,
  onClose,
  victim,
  transitionType = 'RAWAT_LANJUTAN', // 'RAWAT_LANJUTAN' | 'RUJUKAN'
  targetHospitalDefault = '',
  onConfirmed
}) {
  const isRujukan = transitionType === 'RUJUKAN';
  const isRawatLanjutan = transitionType === 'RAWAT_LANJUTAN';

  const [targetHospital, setTargetHospital] = useState(
    targetHospitalDefault || (isRujukan ? '' : (victim?.rumahSakit || ''))
  );
  const [transitionDate, setTransitionDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState('');
  const [isConfirmedAgreement, setIsConfirmedAgreement] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hospitalsList, setHospitalsList] = useState(INITIAL_HOSPITALS);

  useEffect(() => {
    if (isOpen && victim) {
      setTargetHospital(targetHospitalDefault || (isRujukan ? '' : (victim?.rumahSakit || '')));
      setNotes('');
      setIsConfirmedAgreement(false);
      setValidationError('');
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setTransitionDate(d.toISOString().slice(0, 16));
    }
  }, [isOpen, victim?.id, isRujukan, targetHospitalDefault]);

  useEffect(() => {
    storageService.getOrFetchHospitals().then((res) => {
      if (Array.isArray(res)) {
        setHospitalsList(res.map((h) => typeof h === 'string' ? h : h.nama_rs).filter(Boolean));
      }
    }).catch(() => {});
  }, []);

  // Cari petugas JR yang bertugas di RS tujuan secara dinamis
  const assignedOfficerForTarget = useMemo(() => {
    if (!targetHospital) return null;
    const allOfficers = storageService.getOfficers();
    const caseRs = targetHospital.trim().toLowerCase();
    return allOfficers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
        (rs) => (rs || '').trim().toLowerCase() === caseRs
      )
    );
  }, [targetHospital]);

  const isSameHospital = (targetHospital || '').trim().toLowerCase() === (victim?.rumahSakit || '').trim().toLowerCase();

  if (!isOpen || !victim) return null;

  const handleConfirm = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (!targetHospital.trim()) {
      setValidationError('Nama rumah sakit tujuan/lanjutan wajib diisi.');
      return;
    }

    if (!isConfirmedAgreement) {
      setValidationError('Harap beri tanda centang untuk mengonfirmasi kecocokan identitas kasus korban.');
      return;
    }

    setIsSubmitting(true);

    try {
      let updatedVictim = null;
      if (isRujukan) {
        updatedVictim = storageService.confirmRujukan(victim.id, {
          rumahSakitTujuan: targetHospital.trim(),
          tanggalRujukan: transitionDate,
          catatan: notes.trim() || `Pasien dirujuk dari ${victim.rumahSakit} ke ${targetHospital.trim()} untuk penanganan medis lanjutan.`
        });
      } else {
        updatedVictim = storageService.confirmRawatLanjutan(victim.id, {
          rumahSakit: targetHospital.trim(),
          tanggalMasuk: transitionDate,
          catatan: notes.trim() || (isSameHospital
            ? `Pasien kembali masuk untuk rawat lanjutan di RS yang sama (${targetHospital.trim()}).`
            : `Pasien menjalani rawat lanjutan di ${targetHospital.trim()} (sebelumnya di ${victim.rumahSakit}).`),
          isSameHospital
        });
      }

      if (onConfirmed) {
        onConfirmed(updatedVictim);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setValidationError(err.message || 'Gagal menyimpan konfirmasi perawatan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isRujukan ? 'Konfirmasi Pasien Dirujuk ke RS Berbeda' : 'Konfirmasi Pasien Rawat Lanjutan'}
      subtitle="Pastikan identitas korban, nomor LP, dan kasus kecelakaan sesuai sebelum menghubungkan riwayat perawatan."
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleConfirm} className="space-y-4 text-xs">
        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{validationError}</span>
          </div>
        )}

        {/* 1. Ringkasan Kasus Pasien Terdaftar */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/90 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
            <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider">
              DATA KASUS KORBAN SAAT INI
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#0A3981]">
              ID: {victim.nomorTiket || victim.id}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Nama Korban:</span>
              <strong className="text-slate-900 text-sm font-bold">{victim.nama}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Nomor Induk Kependudukan (NIK):</span>
              <span className="font-mono font-semibold text-slate-800">{victim.nik || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Nomor Laporan / Tiket Kasus:</span>
              <span className="font-mono text-slate-800">{victim.nomorTiket || victim.nomorLaporan || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Tanggal Kecelakaan:</span>
              <span className="text-slate-800 font-medium">
                {victim.tanggalKecelakaan ? new Date(victim.tanggalKecelakaan).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Rumah Sakit Sebelumnya / Asal:</span>
              <strong className="text-[#0A3981] font-bold">{victim.rumahSakit}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Status Terakhir Pasien:</span>
              <span className="font-semibold text-slate-800">{victim.kondisiTerakhir || 'Rawat Inap'}</span>
            </div>
          </div>
        </div>

        {/* 2. Informasi Perpindahan / Rawat Lanjutan */}
        <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-200 space-y-3">
          <div className="flex items-center gap-2 text-[#0A3981] font-bold text-xs uppercase tracking-wide">
            {isRujukan ? <ArrowUpRight className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
            <span>
              {isRujukan 
                ? 'Rincian Rujukan ke Rumah Sakit Tujuan' 
                : (isSameHospital ? 'Rawat Lanjutan di RS yang Sama' : 'Rawat Lanjutan di RS Berbeda')}
            </span>
          </div>

          {/* Form Input RS Tujuan */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              {isRujukan ? 'Pilih Rumah Sakit Tujuan Rujukan' : 'Rumah Sakit Tempat Rawat Lanjutan'} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={targetHospital}
                onChange={(e) => setTargetHospital(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white text-xs font-semibold cursor-pointer"
                required
              >
                <option value="">— Pilih Rumah Sakit Tujuan Rujukan —</option>
                {hospitalsList
                  .filter((h) => !isRujukan || (h || '').trim().toLowerCase() !== (victim.rumahSakit || '').trim().toLowerCase())
                  .map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Petugas JR Penanggung Jawab di RS Tujuan */}
          <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#145DA0] shrink-0" />
              <div>
                <span className="text-[11px] text-slate-500 block">Petugas JR Penanggung Jawab RS Tujuan:</span>
                <strong className="text-slate-900 font-bold text-xs">
                  {assignedOfficerForTarget ? assignedOfficerForTarget.nama : (assignedOfficerForTarget === null && targetHospital ? 'Belum Ada Petugas Penanggung Jawab' : 'Pilih RS Tujuan')}
                </strong>
                {assignedOfficerForTarget && (
                  <span className="text-[10px] text-slate-400 block">
                    Wilayah: {assignedOfficerForTarget.wilayah || '—'}
                  </span>
                )}
              </div>
            </div>
            {assignedOfficerForTarget && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Terpetakan
              </span>
            )}
          </div>

          {/* Tanggal Masuk / Tanggal Rujukan */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
              {isRujukan ? 'Waktu & Tanggal Rujukan Pasien' : 'Waktu & Tanggal Pasien Masuk Kembali'} <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={transitionDate}
              onChange={(e) => setTransitionDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white text-xs"
              required
            />
          </div>

          {/* Catatan / Alasan Medis */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              <FileText className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
              Catatan Klinis / Keterangan Tambahan
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isRujukan 
                ? 'Contoh: Pasien dirujuk karena memerlukan penanganan bedah saraf intensif di ICU...'
                : 'Contoh: Pasien masuk kembali untuk kontrol operasi atau fisioterapi lanjutan pasca pulang...'}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white text-xs"
            />
          </div>
        </div>

        {/* 3. Konfirmasi Kesesuaian Kasus */}
        <label
          className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2 cursor-pointer select-none hover:bg-amber-100/60 transition-colors block"
        >
          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={isConfirmedAgreement}
              onChange={(e) => setIsConfirmedAgreement(e.target.checked)}
              className="mt-0.5 rounded border-amber-300 text-[#0A3981] focus:ring-blue-500 w-4 h-4 shrink-0 cursor-pointer"
            />
            <span className="text-xs text-amber-950 leading-relaxed">
              Saya telah memeriksa kecocokan identitas korban (NIK/Nama) dan kasus kecelakaan.
              Dengan ini saya mengonfirmasi bahwa pasien adalah <strong>korban yang sama</strong> dan
              riwayat perawatannya disambungkan ke nomor kasus <strong>{victim.nomorTiket || victim.id}</strong> tanpa membuat entri korban baru.
            </span>
          </div>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A3981] text-white font-bold hover:bg-[#072B62] disabled:opacity-50 cursor-pointer shadow-2xs transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isSubmitting 
                ? 'Menyimpan...' 
                : (isRujukan ? 'Konfirmasi Rujukan' : 'Konfirmasi Rawat Lanjutan')}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

