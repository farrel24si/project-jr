import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../common/Modal';
import CameraModal from './CameraModal';
import GpsCapture from './GpsCapture';
import { storageService } from '../../services/storageService';
import { cachePhoto } from '../../services/photoService';
import { useAuth } from '../../context/AuthContext';
import { checkVisitInterval } from '../../services/slaService';
import { Save, AlertCircle, AlertTriangle, CheckCircle2, Camera, RefreshCw, Clock, Lock } from 'lucide-react';

export default function FormKunjunganModal({ isOpen, onClose, victim, onVisitSaved }) {
  const { currentUser } = useAuth();

  const nowString = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    waktuKunjungan: nowString(),
    kondisiKorban: victim?.kondisiTerakhir || 'Rawat Inap',
    tanggalMeninggal: victim?.tanggalMeninggal || '',
    jamMeninggal: victim?.jamMeninggal || '',
    cekKomunikasiKeluarga: true,
    cekEdukasiSantunan: true,
    cekArahanLp: true,
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

  useEffect(() => {
    if (isOpen) {
      setFormData((prev) => ({
        ...prev,
        waktuKunjungan: nowString()
      }));
    }
  }, [isOpen]);

  const previousVisitDate = victim?.tanggalKunjunganTerakhir || 
                            victim?.waktuPemantauanTerakhir || 
                            victim?.kunjunganPertama?.tanggalKunjungan || 
                            victim?.tanggalInformasiDiterima;

  const intervalCheck = useMemo(() => {
    return checkVisitInterval(previousVisitDate, formData.waktuKunjungan);
  }, [previousVisitDate, formData.waktuKunjungan]);

  if (!victim) return null;

  const isFirstVisit = !victim.kunjunganPertama && (victim.riwayatAktivitas || []).filter((a) => a.statusKunjungan !== 'Menunggu').length === 0;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (new Date(formData.waktuKunjungan) > new Date(Date.now() + 5 * 60000)) {
      setValidationError('Waktu kunjungan aktual tidak boleh di masa mendatang. Harap masukkan waktu saat kunjungan telah benar-benar dilakukan.');
      return;
    }

    if (formData.kondisiKorban === 'Meninggal Dunia') {
      if (!formData.tanggalMeninggal) {
        setValidationError('Tanggal meninggal dunia wajib diisi.');
        return;
      }
      if (!formData.jamMeninggal) {
        setValidationError('Jam meninggal dunia wajib diisi.');
        return;
      }
      const deathTime = new Date(`${formData.tanggalMeninggal}T${formData.jamMeninggal}`);
      if (deathTime.getTime() > Date.now()) {
        setValidationError('Tanggal dan jam meninggal dunia tidak boleh berada di masa depan.');
        return;
      }
    }

    if (!formData.hasilKunjungan.trim()) {
      setValidationError('Catatan kondisi & hasil kunjungan wajib diisi.');
      return;
    }

    const hasValidGps = gpsData &&
      Number.isFinite(Number(gpsData.latitude ?? gpsData.lat_petugas)) &&
      Number.isFinite(Number(gpsData.longitude ?? gpsData.lng_petugas));

    if (!hasValidGps) {
      setValidationError('Harap mengunci lokasi koordinat GPS / maps rumah sakit terlebih dahulu.');
      return;
    }

    if (!photoData) {
      setValidationError('Harap mengupload atau mengambil dokumentasi foto kunjungan.');
      return;
    }

    setIsSubmitting(true);

    try {
      const visitPayload = {
        tanggalKunjungan: new Date(formData.waktuKunjungan).toISOString(),
        waktuAktualKunjungan: new Date(formData.waktuKunjungan).toISOString(),
        waktuPencatatanSistem: new Date().toISOString(),
        petugasNama: currentUser?.profile?.nama || 'Petugas Jasa Raharja',
        kondisiKorban: formData.kondisiKorban,
        tanggalMeninggal: formData.kondisiKorban === 'Meninggal Dunia' ? formData.tanggalMeninggal : null,
        jamMeninggal: formData.kondisiKorban === 'Meninggal Dunia' ? formData.jamMeninggal : null,
        waktuMeninggal: formData.kondisiKorban === 'Meninggal Dunia' ? new Date(`${formData.tanggalMeninggal}T${formData.jamMeninggal}`).toISOString() : null,
        dicatatOleh: currentUser?.profile?.nama || 'Petugas Jasa Raharja',
        waktuPencatatanMD: formData.kondisiKorban === 'Meninggal Dunia' ? new Date().toISOString() : null,
        cek_komunikasi_keluarga: formData.cekKomunikasiKeluarga,
        cek_edukasi_santunan: formData.cekEdukasiSantunan,
        cek_arahan_lp: formData.cekArahanLp,
        catatan_kondisi: formData.hasilKunjungan,
        hasilKunjungan: formData.hasilKunjungan,
        komunikasiKeluarga: formData.komunikasiKeluarga,
        penyampaianHak: formData.penyampaianHak,
        arahanLp: formData.arahanLp,
        catatan: formData.catatan,
        tindakLanjut: formData.tindakLanjut || `Kunjungan selesai: ${formData.kondisiKorban}`,
        fotoUrl: photoData,
        latitude: Number(gpsData.latitude ?? gpsData.lat_petugas),
        longitude: Number(gpsData.longitude ?? gpsData.lng_petugas),
        lat_petugas: Number(gpsData.lat_petugas ?? gpsData.latitude),
        lng_petugas: Number(gpsData.lng_petugas ?? gpsData.longitude),
        akurasiLokasi: Number.isFinite(Number(gpsData.akurasiLokasi ?? gpsData.akurasi_lokasi_meter)) ? Number(gpsData.akurasiLokasi ?? gpsData.akurasi_lokasi_meter) : null,
        akurasi_lokasi_meter: Number.isFinite(Number(gpsData.akurasi_lokasi_meter ?? gpsData.akurasiLokasi)) ? Number(gpsData.akurasi_lokasi_meter ?? gpsData.akurasiLokasi) : null,
        sumberKoordinat: gpsData.sumberKoordinat ?? gpsData.sumber_koordinat ?? (gpsData.isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat'),
        sumber_koordinat: gpsData.sumberKoordinat ?? gpsData.sumber_koordinat ?? (gpsData.isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat'),
        isSimulated: Boolean(gpsData.isSimulated),
        waktuFoto: gpsData.waktu || new Date().toISOString()
      };

      if (photoData) {
        cachePhoto(victim.id, photoData);
        if (victim.caseId) {
          cachePhoto(victim.caseId, photoData);
          cachePhoto(`case_${victim.caseId}`, photoData);
        }
        if (victim.activeVisitId) {
          cachePhoto(victim.activeVisitId, photoData);
          cachePhoto(`VISIT-${victim.activeVisitId}`, photoData);
        }
      }

      const updated = await storageService.addVisit(victim.id, visitPayload);
      if (onVisitSaved) {
        onVisitSaved(updated);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setValidationError(err.message || 'Gagal menyimpan kunjungan.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isFirstVisit ? 'Formulir Kunjungan Pertama' : 'Formulir Kunjungan Selanjutnya'}
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

          {/* Tanggal & Waktu Kunjungan Aktual (Otomatis & Terkunci Sistem) */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-slate-700">
                Tanggal &amp; Waktu Kunjungan Aktual <span className="text-rose-500">*</span>
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 font-semibold bg-slate-200/80 px-2 py-0.5 rounded">
                <Lock className="w-3 h-3 text-slate-500" />
                Terkunci Sistem
              </span>
            </div>
            <input
              type="datetime-local"
              name="waktuKunjungan"
              readOnly
              disabled
              value={formData.waktuKunjungan}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-600 bg-slate-100 font-medium cursor-not-allowed select-none"
            />
            <p className="text-[10px] text-slate-500">
              Tanggal dan jam dicatat otomatis oleh sistem sesuai waktu aktual saat ini (terkunci / tidak dapat diubah).
            </p>
            {previousVisitDate && (
              <div className="mt-2">
                {intervalCheck.isOverdue ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg flex items-start gap-2 text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                    <span className="text-[11px] leading-relaxed">
                      <strong>Peringatan: Kunjungan Melewati Batas Waktu 3 Hari!</strong> Berjarak {intervalCheck.durationText} dari kunjungan sebelumnya. Batas waktu maksimal adalah 72 jam (3 hari).
                    </span>
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Kunjungan tepat waktu ({intervalCheck.durationText} dari kunjungan sebelumnya).</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kondisi Korban Saat Kunjungan (Status)
              </label>
              <select
                name="kondisiKorban"
                value={formData.kondisiKorban}
                onChange={handleChange}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800"
              >
                <option value="Rawat Inap">Rawat Inap</option>
                <option value="Luka Ringan">Luka Ringan</option>
                <option value="Luka Berat">Luka Berat</option>
                <option value="Meninggal Dunia">Meninggal Dunia</option>
                <option value="Selesai">Selesai / Sembuh Pulang</option>
              </select>
            </div>

            {/* Input Khusus jika Kondisi Meninggal Dunia (MD) */}
            {formData.kondisiKorban === 'Meninggal Dunia' && (
              <div className="col-span-1 sm:col-span-2 p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-3">
                <span className="font-bold text-red-950 text-xs block">
                  Pencatatan Korban Meninggal Dunia (MD)
                </span>
                <p className="text-[11px] text-red-800 leading-relaxed">
                  Wajib mengisi tanggal dan jam kematian korban sesuai fakta medis. Waktu pencatatan sistem akan dicatat terpisah.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-red-200">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1 text-xs">
                      Tanggal Meninggal Dunia <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      name="tanggalMeninggal"
                      max={new Date().toISOString().split('T')[0]}
                      value={formData.tanggalMeninggal}
                      onChange={handleChange}
                      className="w-full text-xs rounded-md border border-slate-300 px-3 py-2 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1 text-xs">
                      Jam Meninggal Dunia <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      name="jamMeninggal"
                      value={formData.jamMeninggal}
                      onChange={handleChange}
                      className="w-full text-xs rounded-md border border-slate-300 px-3 py-2 text-slate-800"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Keluarga / Ahli Waris yang Ditemui
              </label>
              <input
                type="text"
                name="komunikasiKeluarga"
                value={formData.komunikasiKeluarga}
                onChange={handleChange}
                placeholder="Nama & hubungan keluarga / perawat RS"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-800"
              />
            </div>
          </div>

          {/* Checklist 3 SOP Kunjungan Sesuai Database */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wide">
              Checklist SOP Kunjungan (Verifikasi Lapangan)
            </span>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="cekKomunikasiKeluarga"
                  checked={formData.cekKomunikasiKeluarga}
                  onChange={handleChange}
                  className="rounded text-[#0A3981] focus:ring-[#0A3981] w-4 h-4 cursor-pointer"
                />
                <span className="text-slate-800 font-medium">1. Komunikasi langsung dengan korban / ahli waris</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="cekEdukasiSantunan"
                  checked={formData.cekEdukasiSantunan}
                  onChange={handleChange}
                  className="rounded text-[#0A3981] focus:ring-[#0A3981] w-4 h-4 cursor-pointer"
                />
                <span className="text-slate-800 font-medium">2. Edukasi hak dan kepastian santunan Jasa Raharja</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="cekArahanLp"
                  checked={formData.cekArahanLp}
                  onChange={handleChange}
                  className="rounded text-[#0A3981] focus:ring-[#0A3981] w-4 h-4 cursor-pointer"
                />
                <span className="text-slate-800 font-medium">3. Arahan pengurusan Laporan Polisi (LP) Laka Lantas</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Catatan Kondisi Korban &amp; Hasil Kunjungan <span className="text-rose-500">*</span>
            </label>
            <textarea
              name="hasilKunjungan"
              rows={2}
              value={formData.hasilKunjungan}
              onChange={handleChange}
              placeholder="Catatan kondisi luka fisik, tindakan medis dokter, atau penjaminan RS..."
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
                Foto Bukti Kunjungan <span className="text-rose-500">*</span>
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
              <GpsCapture
                onLocationCaptured={(loc) => setGpsData(loc)}
                initialLocation={gpsData}
                hospitalName={victim.rumahSakit}
                hospitalCoords={
                  victim?.hospital_lat != null && victim?.hospital_lng != null
                    ? { lat: Number(victim.hospital_lat), lng: Number(victim.hospital_lng), radius_meter: Number(victim.hospital_radius || 200) }
                    : null
                }
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-md font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Kunjungan'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Dedicated Camera Popup Modal with GPS Watermark */}
      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        currentPhoto={photoData}
        onPhotoConfirmed={(dataUrl) => setPhotoData(dataUrl)}
        metadata={{
          petugasNama: currentUser?.profile?.nama || 'Petugas Jasa Raharja',
          rumahSakit: victim.rumahSakit,
          korbanNama: victim.nama,
          latitude: gpsData?.latitude ?? gpsData?.lat_petugas,
          longitude: gpsData?.longitude ?? gpsData?.lng_petugas,
          akurasiLokasi: gpsData?.akurasiLokasi ?? gpsData?.akurasi_lokasi_meter,
          sumberKoordinat: gpsData?.sumberKoordinat ?? gpsData?.sumber_koordinat,
          isSimulated: gpsData?.isSimulated,
          waktu: formData.waktuKunjungan
        }}
      />
    </>
  );
}
