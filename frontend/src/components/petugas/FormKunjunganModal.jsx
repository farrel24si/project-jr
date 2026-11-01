import React, { useState } from 'react';
import Modal from '../common/Modal';
import CameraModal from './CameraModal';
import GpsCapture from './GpsCapture';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import { Save, AlertCircle, CheckCircle2, Camera, RefreshCw } from 'lucide-react';

export default function FormKunjunganModal({ isOpen, onClose, victim, onVisitSaved }) {
  const { currentUser } = useAuth();

  const [formData, setFormData] = useState({
    kondisiKorban: victim?.kondisiTerakhir || 'Masih Dirawat',
    hasilKunjungan: '',
    komunikasiKeluarga: '',
    penyampaianHak: 'Hak santunan biaya perawatan RS maksimal Rp20.000.000,- (atau Rp50.000.000,- jika meninggal dunia).',
    arahanLp: 'Koordinasi pengesahan Laporan Polisi (LP) Laka Lantas.',
    catatan: '',
    tindakLanjut: ''
  });

  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!victim) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setValidationError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (!formData.hasilKunjungan.trim()) {
      setValidationError('Catatan hasil kunjungan wajib diisi.');
      return;
    }

    if (!photoData) {
      setValidationError('Foto bukti kunjungan wajib diambil.');
      return;
    }

    if (!gpsData || !gpsData.latitude || !gpsData.longitude) {
      setValidationError('Koordinat GPS wajib terdeteksi.');
      return;
    }

    setIsSubmitting(true);

    try {
      const visitPayload = {
        tanggalKunjungan: new Date().toISOString(),
        petugasNama: currentUser?.profile?.nama || 'Petugas Jasa Raharja',
        kondisiKorban: formData.kondisiKorban,
        hasilKunjungan: formData.hasilKunjungan,
        komunikasiKeluarga: formData.komunikasiKeluarga,
        penyampaianHak: formData.penyampaianHak,
        arahanLp: formData.arahanLp,
        catatan: formData.catatan,
        tindakLanjut: formData.tindakLanjut || `Kunjungan selesai: ${formData.kondisiKorban}`,
        fotoUrl: photoData,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        akurasiLokasi: gpsData.akurasiLokasi,
        waktuFoto: gpsData.waktu || new Date().toISOString()
      };

      const updated = storageService.addVisit(victim.id, visitPayload);
      if (onVisitSaved) {
        onVisitSaved(updated);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setValidationError('Gagal menyimpan kunjungan.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Formulir Kunjungan Rumah Sakit"
        subtitle={`${victim.nama} (${victim.rumahSakit})`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {validationError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kondisi Korban Saat Kunjungan
              </label>
              <select
                name="kondisiKorban"
                value={formData.kondisiKorban}
                onChange={handleChange}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800"
              >
                <option value="Masih Dirawat">Masih Dirawat</option>
                <option value="Pulang">Pulang</option>
                <option value="Dirujuk">Dirujuk</option>
                <option value="Meninggal Dunia">Meninggal Dunia</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Keluarga / Ahli Waris yang Ditemui
              </label>
              <input
                type="text"
                name="komunikasiKeluarga"
                value={formData.komunikasiKeluarga}
                onChange={handleChange}
                placeholder="Nama & hubungan keluarga"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Hasil Kunjungan Medis
            </label>
            <textarea
              name="hasilKunjungan"
              rows={2}
              value={formData.hasilKunjungan}
              onChange={handleChange}
              placeholder="Catatan kondisi fisik / tindakan medis pasien"
              className="w-full rounded-md border border-slate-300 p-2.5 text-slate-800"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Penyampaian Hak & Santunan
            </label>
            <input
              type="text"
              name="penyampaianHak"
              value={formData.penyampaianHak}
              onChange={handleChange}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-800"
            />
          </div>

          {/* Section Bukti Foto (Modal Popup) & GPS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            {/* Foto Bukti via Modal Popup */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <label className="block font-semibold text-slate-700">
                Foto Bukti Kunjungan
              </label>

              {photoData ? (
                <div className="space-y-2">
                  <div className="relative rounded overflow-hidden bg-black h-28 border border-slate-300 flex items-center justify-center">
                    <img
                      src={photoData}
                      alt="Bukti"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCameraModalOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ubah / Foto Ulang</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(true)}
                  className="w-full py-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50/50 hover:bg-blue-50 text-blue-800 flex flex-col items-center justify-center gap-1.5 transition-colors"
                >
                  <Camera className="w-6 h-6 text-[#0A3981]" />
                  <span className="font-bold text-xs text-[#0A3981]">
                    Buka Popup Kamera
                  </span>
                </button>
              )}
            </div>

            {/* GPS Capture */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <GpsCapture onLocationCaptured={(loc) => setGpsData(loc)} />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md font-medium text-slate-700 bg-slate-100 hover:bg-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Kunjungan'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Dedicated Camera Popup Modal */}
      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        currentPhoto={photoData}
        onPhotoConfirmed={(dataUrl) => setPhotoData(dataUrl)}
      />
    </>
  );
}
