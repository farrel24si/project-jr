import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import CameraCapture from '../../components/petugas/CameraCapture';
import GpsCapture from '../../components/petugas/GpsCapture';
import {
  ArrowLeft,
  Building2,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Save,
  Activity,
  FileText,
  Camera,
  MapPin,
  ShieldCheck,
  AlertOctagon
} from 'lucide-react';

export default function PetugasVisitFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [victim, setVictim] = useState(null);
  const [waktuKunjungan, setWaktuKunjungan] = useState(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });

  const [kondisiKorban, setKondisiKorban] = useState('Masih Dirawat');
  const [perkembanganKondisi, setPerkembanganKondisi] = useState('');
  const [komunikasiKeluarga, setKomunikasiKeluarga] = useState('');
  const [penyampaianHak, setPenyampaianHak] = useState(
    'Telah disampaikan informasi hak santunan biaya perawatan RS maksimal Rp20.000.000,- (atau santunan Rp50.000.000,- bagi ahli waris jika korban meninggal dunia).'
  );
  const [arahanLp, setArahanLp] = useState(
    'Koordinasi dengan pihak keluarga perihal pengesahan Laporan Polisi (LP) Laka Lantas dari unit laka setempat.'
  );
  const [catatanTindakLanjut, setCatatanTindakLanjut] = useState('');

  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);

  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const data = storageService.getVictimById(id);
    if (!data) {
      navigate('/petugas/korban');
      return;
    }
    setVictim(data);
    if (data.kondisiTerakhir) {
      setKondisiKorban(data.kondisiTerakhir);
    }
  }, [id, navigate]);

  if (!victim) {
    return (
      <div className="py-16 text-center text-xs text-slate-400">
        Memuat data formulir kunjungan...
      </div>
    );
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');
    setSuccessMessage('');

    if (!perkembanganKondisi.trim()) {
      setValidationError('Perkembangan kondisi korban wajib diisi.');
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    if (!photoData) {
      setValidationError('Foto dokumentasi kunjungan wajib diambil sebagai bukti pertanggungjawaban.');
      return;
    }

    if (!gpsData || !gpsData.latitude || !gpsData.longitude) {
      setValidationError('Koordinat GPS wajib terdeteksi saat melakukan kunjungan lapangan.');
      return;
    }

    setIsSubmitting(true);

    try {
      const visitPayload = {
        tanggalKunjungan: new Date(waktuKunjungan).toISOString(),
        petugasId: currentUser?.profile?.id || victim.petugasId,
        petugasNama: currentUser?.profile?.nama || victim.namaPetugas,
        kondisiKorban,
        hasilKunjungan: perkembanganKondisi,
        komunikasiKeluarga,
        penyampaianHak,
        arahanLp,
        tindakLanjut: catatanTindakLanjut || `Kunjungan selesai: kondisi ${kondisiKorban}`,
        fotoUrl: photoData,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        akurasiLokasi: gpsData.akurasiLokasi,
        waktuFoto: gpsData.waktu || new Date().toISOString()
      };

      const updated = storageService.addVisit(victim.id, visitPayload);
      if (!updated) {
        throw new Error('Gagal memperbarui data korban.');
      }

      setSuccessMessage('Laporan kunjungan berhasil disimpan ke dalam riwayat korban.');
      setTimeout(() => {
        navigate(`/petugas/korban/${victim.id}`);
      }, 1000);
    } catch (err) {
      console.error(err);
      setValidationError('Terjadi kendala saat menyimpan laporan kunjungan. Silakan coba kembali.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      {/* Tombol Kembali & Judul */}
      <div className="flex items-center gap-3">
        <Link
          to={`/petugas/korban/${victim.id}`}
          className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          title="Kembali"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Formulir Kunjungan Rumah Sakit
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pencatatan aktivitas kunjungan langsung ke data korban ID: {victim.id}.
          </p>
        </div>
      </div>

      {/* Alert Error / Success */}
      {validationError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Formulir Belum Lengkap</p>
            <p className="mt-0.5">{validationError}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Berhasil Disimpan</p>
            <p className="mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── BAGIAN A: INFORMASI KUNJUNGAN ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#145DA0] text-xs font-bold flex items-center justify-center">
                A
              </span>
              Informasi Kunjungan
            </h2>
            <span className="text-[11px] text-slate-400">Terisi Otomatis</span>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Nama Korban */}
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Nama Korban</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  readOnly
                  value={victim.nama}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium cursor-not-allowed"
                />
              </div>
            </div>

            {/* Rumah Sakit */}
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Rumah Sakit</label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  readOnly
                  value={victim.rumahSakit}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-medium cursor-not-allowed"
                />
              </div>
            </div>

            {/* Waktu Kunjungan */}
            <div>
              <label className="block text-slate-600 font-semibold mb-1">
                Waktu Kunjungan <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="datetime-local"
                  required
                  value={waktuKunjungan}
                  onChange={(e) => setWaktuKunjungan(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium focus:ring-1 focus:ring-[#145DA0] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── BAGIAN B: KONDISI KORBAN ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#145DA0] text-xs font-bold flex items-center justify-center">
                B
              </span>
              Kondisi Korban Saat Kunjungan
            </h2>
          </div>

          <div className="space-y-2 text-xs">
            {[
              { id: 'Masih Dirawat', label: 'Masih Dirawat', desc: 'Korban masih menjalani rawat inap di rumah sakit.' },
              { id: 'Sudah Pulang', label: 'Sudah Pulang', desc: 'Korban telah dinyatakan sembuh / diizinkan pulang oleh dokter.' },
              { id: 'Dirujuk', label: 'Dirujuk', desc: 'Korban dipindahkan/dirujuk ke rumah sakit lain.' },
              { id: 'Meninggal Dunia', label: 'Meninggal Dunia', desc: 'Korban dinyatakan meninggal dunia oleh tim medis RS.' },
              { id: 'Belum Dapat Dikonfirmasi', label: 'Belum Dapat Dikonfirmasi', desc: 'Kondisi belum dapat dipastikan karena kendala verifikasi medis.' }
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  kondisiKorban === opt.id
                    ? 'border-[#145DA0] bg-blue-50/70 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="kondisiKorban"
                  value={opt.id}
                  checked={kondisiKorban === opt.id}
                  onChange={(e) => setKondisiKorban(e.target.value)}
                  className="mt-0.5 text-[#145DA0] focus:ring-[#145DA0]"
                />
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-800 block">{opt.label}</span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── BAGIAN C: HASIL KUNJUNGAN ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#145DA0] text-xs font-bold flex items-center justify-center">
                C
              </span>
              Hasil Kunjungan &amp; Komunikasi
            </h2>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Perkembangan Kondisi Korban <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={perkembanganKondisi}
                onChange={(e) => setPerkembanganKondisi(e.target.value)}
                placeholder="Jelaskan kondisi klinis korban, tindakan operasi yang dilakukan, atau observasi terkini..."
                className="w-full p-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:ring-1 focus:ring-[#145DA0] focus:outline-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Komunikasi dengan Keluarga / Pendamping Korban
              </label>
              <textarea
                rows={2}
                value={komunikasiKeluarga}
                onChange={(e) => setKomunikasiKeluarga(e.target.value)}
                placeholder="Contoh: Bertemu dengan istri korban, menyampaikan empati serta penjelasan proses penjaminan..."
                className="w-full p-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:ring-1 focus:ring-[#145DA0] focus:outline-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Informasi Hak Korban yang Disampaikan
              </label>
              <textarea
                rows={2}
                value={penyampaianHak}
                onChange={(e) => setPenyampaianHak(e.target.value)}
                className="w-full p-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:ring-1 focus:ring-[#145DA0] focus:outline-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Catatan Tindak Lanjut Berikutnya
              </label>
              <input
                type="text"
                value={catatanTindakLanjut}
                onChange={(e) => setCatatanTindakLanjut(e.target.value)}
                placeholder="Contoh: Pemantauan ulang 3 hari ke depan, atau koordinasi berkas santunan..."
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:ring-1 focus:ring-[#145DA0] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* ── BAGIAN D: DOKUMENTASI (KAMERA & GPS) ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#145DA0] text-xs font-bold flex items-center justify-center">
                D
              </span>
              Dokumentasi &amp; Validasi Lokasi
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <GpsCapture
                onLocationCaptured={setGpsData}
                initialLocation={gpsData}
                hospitalName={victim.rumahSakit}
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <CameraCapture
                onPhotoCaptured={setPhotoData}
                initialPhoto={photoData}
                metadata={{
                  petugasNama: currentUser?.profile?.nama || victim.namaPetugas,
                  rumahSakit: victim.rumahSakit,
                  korbanNama: victim.nama,
                  latitude: gpsData?.latitude,
                  longitude: gpsData?.longitude,
                  akurasiLokasi: gpsData?.akurasiLokasi,
                  waktu: waktuKunjungan
                }}
              />
            </div>
          </div>
        </div>

        {/* ── BAGIAN E: TOMBOL SIMPAN ── */}
        <div className="space-y-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-sm font-bold bg-[#145DA0] hover:bg-[#0f497e] disabled:bg-slate-300 text-white shadow-md shadow-blue-900/15 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Menyimpan Laporan...' : 'Simpan Laporan Kunjungan'}</span>
          </button>

          <Link
            to={`/petugas/korban/${victim.id}`}
            className="w-full block text-center py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            Batal dan Kembali
          </Link>
        </div>
      </form>
    </div>
  );
}
