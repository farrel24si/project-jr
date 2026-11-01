import React, { useState } from 'react';
import Modal from '../common/Modal';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import { Edit3, AlertCircle, Save } from 'lucide-react';

export default function ModalKoreksiCatatan({ isOpen, onClose, victimId, activity, onCorrected }) {
  const { currentUser } = useAuth();
  const [hasilKomunikasi, setHasilKomunikasi] = useState(
    activity?.hasilKomunikasi || activity?.hasilKunjungan || activity?.hasilPemantauan || ''
  );
  const [tindakLanjut, setTindakLanjut] = useState(
    activity?.catatanTindakLanjut || activity?.tindakLanjut || ''
  );
  const [alasanKoreksi, setAlasanKoreksi] = useState('');
  const [error, setError] = useState('');

  if (!activity) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!alasanKoreksi.trim()) {
      setError('Alasan koreksi wajib diisi sebagai catatan audit.');
      return;
    }

    try {
      const updated = storageService.updateActivity(victimId, activity.id, {
        hasilKomunikasi: hasilKomunikasi.trim(),
        catatanTindakLanjut: tindakLanjut.trim(),
        alasanKoreksi: alasanKoreksi.trim(),
        editedBy: currentUser?.profile?.nama || 'Petugas Jasa Raharja'
      });

      if (onCorrected) {
        onCorrected(updated);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError('Gagal menyimpan koreksi catatan.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Koreksi Catatan Aktivitas (Jejak Audit)"
      subtitle={`Aktivitas: ${activity.jenisAktivitas} • ID: ${activity.id}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
          <strong>Perhatian:</strong> Catatan lama tidak akan dihapus. Perubahan akan disimpan bersama jejak audit berisi nama petugas, waktu koreksi, dan alasan perbaikan.
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Catatan Hasil Pemantauan / Kunjungan
          </label>
          <textarea
            rows={3}
            required
            value={hasilKomunikasi}
            onChange={(e) => setHasilKomunikasi(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Catatan Tindak Lanjut
          </label>
          <input
            type="text"
            value={tindakLanjut}
            onChange={(e) => setTindakLanjut(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Alasan Koreksi <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={alasanKoreksi}
            onChange={(e) => setAlasanKoreksi(e.target.value)}
            placeholder="Contoh: Koreksi typo penulisan nama dokter / penyesuaian rekam medis"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
          />
        </div>

        <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
          >
            Batal
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Simpan Koreksi</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

