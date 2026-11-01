import React, { useState } from 'react';
import Modal from '../common/Modal';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import CameraCapture from './CameraCapture';
import GpsCapture from './GpsCapture';
import ConditionBadge from '../common/ConditionBadge';
import MonitoringStatusBadge from '../common/MonitoringStatusBadge';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  AlertCircle,
  Save,
  Building2,
  User,
  ShieldAlert,
  ArrowUpRight,
  Home,
  HelpCircle,
  History,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  ExternalLink,
  Image as ImageIcon
} from 'lucide-react';

export default function FormPemantauanModal({ isOpen, onClose, victim, onMonitoringSaved }) {
  const { currentUser } = useAuth();

  const nowString = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    kondisi: victim?.kondisiTerakhir || 'Masih Dirawat',
    statusKonfirmasi: 'Terkonfirmasi',
    sumberInfo: 'Petugas Ruangan / Perawat RS',
    waktuPemantauan: nowString(),
    hasilPemantauan: '',
    informasiHak: '',
    tindakLanjut: '',
    // Jika dirujuk
    rumahSakitRujukan: '',
    // Jika Pulang / Meninggal
    tanggalKejadian: nowString(),
    keteranganKonfirmasi: '',
    konfirmasiHentikanRutin: false
  });

  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [selectedPreviewPhoto, setSelectedPreviewPhoto] = useState(null);

  if (!victim) return null;

  const previousActivities = (victim.riwayatAktivitas && victim.riwayatAktivitas.length > 0)
    ? victim.riwayatAktivitas
    : [
        ...(victim.riwayatKunjungan || []),
        ...(victim.riwayatPemantauan || [])
      ].sort((a, b) => new Date(b.tanggal || b.tanggalKunjungan).getTime() - new Date(a.tanggal || a.tanggalKunjungan).getTime());

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    } catch {
      return dateStr;
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setValidationError('');
  };

  const isResolvingCondition =
    formData.kondisi === 'Sudah Pulang' ||
    formData.kondisi === 'Pulang' ||
    formData.kondisi === 'Meninggal Dunia';

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (!formData.hasilPemantauan.trim()) {
      setValidationError('Catatan hasil pemantauan perkembangan korban wajib diisi.');
      return;
    }

    if (formData.kondisi === 'Dirujuk' && !formData.rumahSakitRujukan.trim()) {
      setValidationError('Nama rumah sakit rujukan baru wajib diisi untuk pasien yang dirujuk.');
      return;
    }

    if (isResolvingCondition && formData.statusKonfirmasi === 'Terkonfirmasi') {
      if (!formData.konfirmasiHentikanRutin) {
        setValidationError(
          'Harap centang konfirmasi penghentian pemantauan rutin untuk kondisi korban yang telah terkonfirmasi selesai.'
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const monPayload = {
        tanggal: new Date(formData.waktuPemantauan).toISOString(),
        petugasId: currentUser?.profile?.id || victim.petugasId,
        petugasNama: currentUser?.profile?.nama || victim.namaPetugas,
        kondisi: formData.kondisi === 'Pulang' ? 'Sudah Pulang' : formData.kondisi,
        statusKonfirmasi: formData.statusKonfirmasi,
        sumberInfo: formData.sumberInfo,
        hasilPemantauan: formData.hasilPemantauan.trim(),
        informasiHak: formData.informasiHak.trim() || null,
        tindakLanjut: formData.tindakLanjut.trim() || `Pemantauan dicatat: ${formData.kondisi}`,
        rumahSakitRujukan: formData.kondisi === 'Dirujuk' ? formData.rumahSakitRujukan.trim() : null,
        tanggalKejadian: isResolvingCondition ? new Date(formData.tanggalKejadian).toISOString() : null,
        keteranganKonfirmasi: formData.keteranganKonfirmasi.trim() || null,
        fotoUrl: photoData,
        latitude: gpsData?.latitude || null,
        longitude: gpsData?.longitude || null,
        akurasiLokasi: gpsData?.akurasiLokasi || null
      };

      const updated = storageService.addMonitoring(victim.id, monPayload);
      setSuccessMessage(true);

      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessMessage(false);
        if (onMonitoringSaved) {
          onMonitoringSaved(updated);
        }
        onClose();
      }, 700);
    } catch (err) {
      console.error(err);
      setValidationError('Terjadi kendala saat menyimpan aktivitas pemantauan.');
      setIsSubmitting(false);
    }
  };

  const activeHospital = formData.kondisi === 'Dirujuk' && formData.rumahSakitRujukan
    ? formData.rumahSakitRujukan
    : victim.rumahSakit;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pemantauan Berkelanjutan Korban"
      subtitle="Satu pasien dipantau terus menerus hingga dinyatakan pulang atau selesai dirawat."
      maxWidth="max-w-3xl"
    >
      {successMessage ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">Hasil Pemantauan Berhasil Disimpan!</h4>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Aktivitas baru telah dicatat ke data korban <strong>{victim.nama}</strong>. Data korban tetap satu dan tidak diduplikasi.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Ringkasan Pasien & Status Saat Ini */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                PASIEN YANG DIPANTAU (ID: {victim.id})
              </span>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-base font-black text-slate-900">{victim.nama}</span>
                <span className="text-slate-400">•</span>
                <span className="font-semibold text-slate-700">{victim.rumahSakit}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <MonitoringStatusBadge status={victim.statusPemantauan} size="xs" />
              <ConditionBadge kondisi={victim.kondisiTerakhir} statusKonfirmasi={victim.statusKonfirmasiKondisi} size="xs" />
            </div>
          </div>

          {/* ── BAGIAN: HISTORI KUNJUNGAN & PEMANTAUAN SEBELUMNYA ── */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/30 overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-100/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-[#145DA0] text-white flex items-center justify-center">
                  <History className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-xs block">
                    Riwayat Kunjungan &amp; Pemantauan Sebelumnya
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {previousActivities.length} aktivitas tercatat sebelumnya untuk pasien ini
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold text-[#145DA0]">
                <span>{showHistory ? 'Sembunyikan Riwayat' : 'Buka Riwayat'}</span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showHistory && (
              <div className="p-4 pt-2 border-t border-blue-100 max-h-60 overflow-y-auto space-y-3 divide-y divide-blue-100">
                {previousActivities.length === 0 ? (
                  <div className="py-4 text-center text-slate-500 text-xs italic">
                    Belum ada riwayat kunjungan atau pemantauan sebelumnya. Formulir di bawah akan disimpan sebagai aktivitas pertama.
                  </div>
                ) : (
                  previousActivities.map((act, idx) => {
                    const isFirst = act.jenisAktivitas === 'Kunjungan Pertama';
                    const actDate = act.tanggal || act.tanggalKunjungan;
                    const notes = act.hasilKomunikasi || act.hasilPemantauan || act.hasilKunjungan || 'Aktivitas pemantauan lapangan.';

                    return (
                      <div key={act.id || idx} className="pt-3 first:pt-1 space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs">
                              #{previousActivities.length - idx} {act.jenisAktivitas || 'Pemantauan Lanjutan'}
                            </span>
                            <ConditionBadge kondisi={act.kondisiKorban} size="xs" />
                            {isFirst && (
                              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                Kunjungan Awal
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {formatDateTime(actDate)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-blue-100 leading-relaxed">
                          {notes}
                        </p>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5 flex-wrap gap-2">
                          <span>
                            Petugas: <strong className="text-slate-800">{act.petugasNama || victim.namaPetugas}</strong>
                          </span>

                          <div className="flex items-center gap-3">
                            {act.fotoUrl && (
                              <button
                                type="button"
                                onClick={() => setSelectedPreviewPhoto(act.fotoUrl)}
                                className="inline-flex items-center gap-1 text-[#145DA0] font-semibold hover:underline cursor-pointer"
                              >
                                <ImageIcon className="w-3 h-3" />
                                <span>Lihat Foto Watermark</span>
                              </button>
                            )}

                            {act.latitude && act.longitude && (
                              <a
                                href={`https://www.google.com/maps?q=${act.latitude},${act.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline"
                                title="Buka titik koordinat di Google Maps"
                              >
                                <MapPin className="w-3 h-3 text-red-500" />
                                <span>Google Maps ({Number(act.latitude).toFixed(4)}, {Number(act.longitude).toFixed(4)})</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Validation Error Alert */}
          {validationError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold">{validationError}</div>
            </div>
          )}

          {/* ── BAGIAN: FORMULIR INPUT PEMANTAUAN TERKINI ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#145DA0]" />
                <span>Formulir Pemantauan Lanjutan Terbaru</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Akan dicatat sebagai riwayat ke-{(previousActivities.length || 0) + 1}
              </span>
            </div>

            {/* Kondisi Korban & Status Konfirmasi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kondisi Perkembangan Terkini <span className="text-red-500">*</span>
                </label>
                <select
                  name="kondisi"
                  value={formData.kondisi}
                  onChange={handleChange}
                  className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
                >
                  <option value="Masih Dirawat">Masih Dirawat (Pemantauan Rutin Berlanjut)</option>
                  <option value="Sudah Pulang">Sudah Pulang (Pasien Selesai Rawat Inap)</option>
                  <option value="Dirujuk">Dirujuk (Dipindahkan ke Rumah Sakit Lain)</option>
                  <option value="Meninggal Dunia">Meninggal Dunia</option>
                  <option value="Belum Dapat Dikonfirmasi">Belum Dapat Dikonfirmasi</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Status Konfirmasi Kondisi <span className="text-red-500">*</span>
                </label>
                <select
                  name="statusKonfirmasi"
                  value={formData.statusKonfirmasi}
                  onChange={handleChange}
                  className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
                >
                  <option value="Terkonfirmasi">Terkonfirmasi Medis / Dokter DPJP</option>
                  <option value="Belum Dikonfirmasi">Belum Dikonfirmasi (Menunggu Berkas)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Waktu Pemantauan
                </label>
                <input
                  type="datetime-local"
                  name="waktuPemantauan"
                  value={formData.waktuPemantauan}
                  onChange={handleChange}
                  className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Sumber Informasi Pemantauan
                </label>
                <select
                  name="sumberInfo"
                  value={formData.sumberInfo}
                  onChange={handleChange}
                  className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                >
                  <option value="Petugas Ruangan / Perawat RS">Petugas Ruangan / Perawat RS</option>
                  <option value="Dokter Penanggung Jawab Pasien (DPJP)">Dokter Penanggung Jawab Pasien (DPJP)</option>
                  <option value="Bagian Administrasi / Kasir RS">Bagian Administrasi / Kasir RS</option>
                  <option value="Keluarga / Pendamping Pasien">Keluarga / Pendamping Pasien</option>
                  <option value="Pemeriksaan Langsung Petugas JR">Pemeriksaan Langsung Petugas JR</option>
                </select>
              </div>
            </div>

            {/* JIKA DIRUJUK: Input Rumah Sakit Baru */}
            {formData.kondisi === 'Dirujuk' && (
              <div className="p-3.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-950 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-violet-900">
                  <ArrowUpRight className="w-4 h-4 text-violet-700" />
                  <span>Pasien Dirujuk ke Fasilitas Lain</span>
                </div>
                <p className="text-[11px] text-violet-800 leading-relaxed">
                  Pemantauan tetap aktif di rumah sakit tujuan rujukan. Jangan menghentikan pemantauan hanya karena pasien berpindah rumah sakit.
                </p>
                <div>
                  <label className="block font-semibold text-violet-900 mb-1">
                    Nama Rumah Sakit Rujukan Baru <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="rumahSakitRujukan"
                    required
                    value={formData.rumahSakitRujukan}
                    onChange={handleChange}
                    placeholder="Contoh: RSUP Fatmawati (ICU Bedah Saraf)"
                    className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-slate-800 font-medium"
                  />
                </div>
              </div>
            )}

            {/* JIKA SUDAH PULANG / MENINGGAL DUNIA */}
            {isResolvingCondition && (
              <div
                className={`p-3.5 rounded-xl border space-y-3 ${
                  formData.kondisi === 'Meninggal Dunia'
                    ? 'bg-red-50/80 border-red-200 text-red-950'
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  {formData.kondisi === 'Meninggal Dunia' ? (
                    <AlertOctagon className="w-4 h-4 text-red-600" />
                  ) : (
                    <Home className="w-4 h-4 text-emerald-600" />
                  )}
                  <span>
                    Informasi Penyelesaian: Pasien {formData.kondisi}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tanggal Kejadian ({formData.kondisi})
                    </label>
                    <input
                      type="datetime-local"
                      name="tanggalKejadian"
                      value={formData.tanggalKejadian}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Keterangan Bukti Konfirmasi
                    </label>
                    <input
                      type="text"
                      name="keteranganKonfirmasi"
                      value={formData.keteranganKonfirmasi}
                      onChange={handleChange}
                      placeholder="Contoh: Resume Medis Keluar RS / Surat Kematian RS"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                    />
                  </div>
                </div>

                {formData.statusKonfirmasi === 'Terkonfirmasi' ? (
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Kondisi terkonfirmasi resmi: jadwal pemantauan rutin akan dihentikan dan status berubah menjadi <strong>Selesai Dipantau</strong>. Seluruh riwayat kunjungan tetap disimpan permanen.
                    </p>
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        name="konfirmasiHentikanRutin"
                        checked={formData.konfirmasiHentikanRutin}
                        onChange={handleChange}
                        className="mt-0.5 rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                      />
                      <span className="text-[11px] font-bold text-slate-800">
                        Konfirmasi: Saya telah memverifikasi bukti sah dan menyetujui penghentian jadwal pemantauan rutin untuk pasien ini.
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Kondisi belum terkonfirmasi resmi. Status pemantauan akan diatur menjadi <strong>Menunggu Konfirmasi Kondisi</strong> dan pemantauan TIDAK dianggap selesai sampai ada verifikasi sah.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Catatan Hasil Pemantauan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan Hasil Pemantauan &amp; Kondisi Klinis Korban <span className="text-red-500">*</span>
              </label>
              <textarea
                name="hasilPemantauan"
                rows={3}
                required
                value={formData.hasilPemantauan}
                onChange={handleChange}
                placeholder="Catatan perkembangan pemulihan korban, hasil tindakan medis terbaru, atau observasi terkini..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#145DA0] leading-relaxed"
              />
            </div>

            {/* Rencana Tindak Lanjut */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan Tindak Lanjut
              </label>
              <input
                type="text"
                name="tindakLanjut"
                value={formData.tindakLanjut}
                onChange={handleChange}
                placeholder="Contoh: Pemantauan ulang 3 hari ke depan, jemput berkas tagihan, atau penutupan berkas"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              />
            </div>

            {/* Validasi Lokasi Google Maps & Dokumentasi Foto dengan Watermark */}
            <div className="space-y-4 pt-3 border-t border-slate-100">
              {/* 1. GPS Google Maps */}
              <GpsCapture
                onLocationCaptured={setGpsData}
                initialLocation={gpsData}
                hospitalName={activeHospital}
              />

              {/* 2. Kamera dengan Stempel Watermark Resmi */}
              <CameraCapture
                onPhotoCaptured={setPhotoData}
                initialPhoto={photoData}
                metadata={{
                  petugasNama: currentUser?.profile?.nama || victim.namaPetugas || 'Petugas Lapangan',
                  rumahSakit: activeHospital,
                  korbanNama: victim.nama,
                  latitude: gpsData?.latitude,
                  longitude: gpsData?.longitude,
                  akurasiLokasi: gpsData?.akurasiLokasi,
                  waktu: formData.waktuPemantauan
                }}
              />
            </div>
          </div>

          {/* Tombol Aksi */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Hasil Pemantauan'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Modal Zoom Foto Watermark */}
      {selectedPreviewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedPreviewPhoto(null)}
        >
          <div className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
            <img
              src={selectedPreviewPhoto}
              alt="Foto Watermark Dokumentasi"
              className="w-full max-h-[80vh] object-contain"
            />
            <div className="p-3 bg-slate-950 flex items-center justify-between text-xs text-white">
              <span className="font-semibold text-blue-300">
                Dokumentasi Lapangan Terstempel Watermark Resmi
              </span>
              <button
                type="button"
                onClick={() => setSelectedPreviewPhoto(null)}
                className="px-3 py-1 bg-white text-slate-900 font-bold rounded-lg hover:bg-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
