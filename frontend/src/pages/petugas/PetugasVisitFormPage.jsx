import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { storageService } from '../../services/storageService';
import { cachePhoto } from '../../services/photoService';
import { useAuth } from '../../context/AuthContext';
import { checkVisitInterval } from '../../services/slaService';
import CameraCapture from '../../components/petugas/CameraCapture';
import GpsCapture from '../../components/petugas/GpsCapture';
import {
  ArrowLeft,
  Building2,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Save,
  ShieldCheck,
  AlertOctagon,
  Lock
} from 'lucide-react';

const DEFAULT_PENYAMPAIAN_HAK =
  'Telah disampaikan informasi hak santunan biaya perawatan RS maksimal Rp20.000.000,- (atau santunan Rp50.000.000,- bagi ahli waris jika korban meninggal dunia).';
const DEFAULT_ARAHAN_LP =
  'Koordinasi dengan pihak keluarga perihal pengesahan Laporan Polisi (LP) Laka Lantas dari unit laka setempat.';

export default function PetugasVisitFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [victim, setVictim] = useState(null);
  const [waktuKunjungan] = useState(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });

  const [kondisiKorban, setKondisiKorban] = useState('Rawat Inap');
  const [tanggalMeninggal, setTanggalMeninggal] = useState('');
  const [jamMeninggal, setJamMeninggal] = useState('');
  const [cekKomunikasiKeluarga, setCekKomunikasiKeluarga] = useState(true);
  const [cekEdukasiSantunan, setCekEdukasiSantunan] = useState(true);
  const [cekArahanLp, setCekArahanLp] = useState(true);
  const [perkembanganKondisi, setPerkembanganKondisi] = useState('');
  const [komunikasiKeluarga, setKomunikasiKeluarga] = useState('');
  const [catatanTindakLanjut, setCatatanTindakLanjut] = useState('');

  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);

  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      let data = storageService.getVictimById(id);
      if (!data) {
        data = await storageService.fetchVictimDetail(id);
      }
      if (!data) {
        navigate('/petugas/korban');
        return;
      }
      setVictim(data);
      if (data.kondisiTerakhir) {
        setKondisiKorban(data.kondisiTerakhir);
      }
      if (data.tanggalMeninggal) {
        setTanggalMeninggal(data.tanggalMeninggal);
      }
      if (data.jamMeninggal) {
        setJamMeninggal(data.jamMeninggal);
      }
    };
    load();
  }, [id, navigate]);

  const previousVisitDate = victim?.tanggalKunjunganTerakhir || 
                            victim?.waktuPemantauanTerakhir || 
                            victim?.kunjunganPertama?.tanggalKunjungan || 
                            victim?.tanggalInformasiDiterima;

  const intervalCheck = useMemo(() => {
    return checkVisitInterval(previousVisitDate, waktuKunjungan);
  }, [previousVisitDate, waktuKunjungan]);

  if (!victim) {
    return (
      <div className="py-16 text-center text-xs text-slate-400">
        Memuat data formulir kunjungan...
      </div>
    );
  }

  // Verifikasi Otorisasi: Petugas hanya dapat menginput kunjungan korban yang ditugaskan kepadanya
  const allOfficers = storageService.getOfficers();
  const isAssigned = currentUser?.role === 'petugas'
    ? storageService.isOfficerAssignedToVictim(currentUser?.profile || currentUser?.profile?.id || currentUser?.profile?.nama, victim, allOfficers)
    : true;

  if (!isAssigned) {
    return (
      <div className="max-w-md mx-auto my-16 p-6 bg-white rounded-3xl border border-rose-200 shadow-xl text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-7 h-7 text-rose-600" />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
            Akses Formulir Ditolak
          </span>
          <h2 className="text-lg font-black text-slate-900">Bukan Tanggung Jawab Anda</h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Anda tidak dapat menginput kunjungan untuk korban <strong>{victim.nama}</strong> karena faskes atau penugasan korban berada di luar tanggung jawab Anda.
        </p>
        <button
          type="button"
          onClick={() => navigate('/petugas/pemantauan')}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#145DA0] text-white hover:bg-[#0f4980] transition-colors cursor-pointer"
        >
          Kembali ke Jadwal Pemantauan Saya
        </button>
      </div>
    );
  }

  const isFirstVisit = !victim?.kunjunganPertama && (victim?.riwayatAktivitas || []).filter((a) => a.statusKunjungan !== 'Menunggu').length === 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    setSuccessMessage('');

    if (new Date(waktuKunjungan) > new Date(Date.now() + 5 * 60000)) {
      setValidationError('Waktu kunjungan aktual tidak boleh di masa mendatang. Harap masukkan waktu saat kunjungan telah benar-benar dilakukan.');
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    if (!perkembanganKondisi.trim()) {
      setValidationError('Perkembangan kondisi korban wajib diisi.');
      window.scrollTo({ top: 300, behavior: 'smooth' });
      return;
    }

    if (kondisiKorban === 'Meninggal Dunia') {
      if (!tanggalMeninggal) {
        setValidationError('Tanggal meninggal dunia wajib diisi.');
        return;
      }
      if (!jamMeninggal) {
        setValidationError('Jam meninggal dunia wajib diisi.');
        return;
      }
      const deathTime = new Date(`${tanggalMeninggal}T${jamMeninggal}`);
      if (deathTime.getTime() > Date.now()) {
        setValidationError('Tanggal dan jam meninggal dunia tidak boleh berada di masa depan.');
        return;
      }
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
        tanggalKunjungan: new Date(waktuKunjungan).toISOString(),
        waktuAktualKunjungan: new Date(waktuKunjungan).toISOString(),
        waktuPencatatanSistem: new Date().toISOString(),
        petugasId: currentUser?.profile?.id || victim.petugasId,
        petugasNama: currentUser?.profile?.nama || victim.namaPetugas,
        kondisiKorban,
        tanggalMeninggal: kondisiKorban === 'Meninggal Dunia' ? tanggalMeninggal : null,
        jamMeninggal: kondisiKorban === 'Meninggal Dunia' ? jamMeninggal : null,
        waktuMeninggal: kondisiKorban === 'Meninggal Dunia' ? new Date(`${tanggalMeninggal}T${jamMeninggal}`).toISOString() : null,
        dicatatOleh: currentUser?.profile?.nama || victim.namaPetugas || 'Petugas Jasa Raharja',
        waktuPencatatanMD: kondisiKorban === 'Meninggal Dunia' ? new Date().toISOString() : null,
        cek_komunikasi_keluarga: cekKomunikasiKeluarga,
        cek_edukasi_santunan: cekEdukasiSantunan,
        cek_arahan_lp: cekArahanLp,
        catatan_kondisi: perkembanganKondisi,
        hasilKunjungan: perkembanganKondisi,
        komunikasiKeluarga,
        penyampaianHak: DEFAULT_PENYAMPAIAN_HAK,
        arahanLp: DEFAULT_ARAHAN_LP,
        tindakLanjut: catatanTindakLanjut || `Kunjungan selesai: kondisi ${kondisiKorban}`,
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

      cachePhoto(victim.id, photoData);
      if (victim.caseId) {
        cachePhoto(victim.caseId, photoData);
        cachePhoto(`case_${victim.caseId}`, photoData);
      }
      if (victim.activeVisitId) {
        cachePhoto(victim.activeVisitId, photoData);
        cachePhoto(`VISIT-${victim.activeVisitId}`, photoData);
      }

      const updated = await storageService.addVisit(victim.id, visitPayload);
      if (!updated) {
        throw new Error('Gagal memperbarui data korban.');
      }

      setSuccessMessage('Laporan kunjungan berhasil disimpan ke dalam riwayat korban.');
      setTimeout(() => {
        navigate(`/petugas/korban/${victim.id}`);
      }, 1000);
    } catch (err) {
      console.error(err);
      setValidationError(err.message || 'Terjadi kendala saat menyimpan laporan kunjungan. Silakan coba kembali.');
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
            {isFirstVisit ? 'Formulir Kunjungan Pertama' : 'Formulir Kunjungan Selanjutnya'}
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
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
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

            {/* Waktu Kunjungan (Otomatis & Terkunci Sistem) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-600 font-semibold">
                  Tanggal &amp; Waktu Kunjungan Aktual <span className="text-red-500">*</span>
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 font-semibold bg-slate-200/80 px-2 py-0.5 rounded">
                  <Lock className="w-3 h-3 text-slate-500" />
                  Terkunci Sistem
                </span>
              </div>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="datetime-local"
                  required
                  readOnly
                  disabled
                  value={waktuKunjungan}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 font-medium cursor-not-allowed select-none focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Tanggal dan jam dicatat otomatis oleh sistem sesuai waktu aktual saat ini (terkunci / tidak dapat diubah).
              </p>

              {/* Banner Peringatan Interval SLA 3 Hari */}
              {previousVisitDate && (
                <div className="mt-2.5">
                  {intervalCheck.isOverdue ? (
                    <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2.5 text-rose-900 shadow-2xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                      <div className="text-[11px] leading-relaxed">
                        <strong className="block font-bold text-rose-950">PERINGATAN: Kunjungan Melewati Batas Waktu 3 Hari!</strong>
                        Waktu kunjungan ini berjarak <strong>{intervalCheck.durationText}</strong> dari tanggal informasi / kunjungan sebelumnya. Batas waktu standar kunjungan adalah <strong>maksimal 72 jam (3 hari)</strong>. Kunjungan akan tercatat sebagai selesai terlambat.
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-[11px]">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Tepat waktu: berjarak <strong>{intervalCheck.durationText}</strong> dari kunjungan sebelumnya (dalam batas waktu maksimal 3 hari).
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── BAGIAN B: KONDISI KORBAN ── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#145DA0] text-xs font-bold flex items-center justify-center">
                B
              </span>
              Kondisi Korban Saat Kunjungan (Status Backend)
            </h2>
          </div>

          <div className="space-y-2 text-xs">
            {[
              { id: 'Rawat Inap', label: 'Rawat Inap', desc: 'Korban masih menjalani rawat inap di rumah sakit.' },
              { id: 'Luka Ringan', label: 'Luka Ringan', desc: 'Korban mengalami luka ringan / observasi rawat jalan.' },
              { id: 'Luka Berat', label: 'Luka Berat', desc: 'Korban mengalami luka berat dalam perawatan intensif.' },
              { id: 'Meninggal Dunia', label: 'Meninggal Dunia', desc: 'Korban dinyatakan meninggal dunia oleh tim medis RS.' },
              { id: 'Selesai', label: 'Selesai / Pulang', desc: 'Perawatan selesai, korban telah sembuh atau diizinkan pulang.' }
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

          {/* Kolom Khusus jika Kondisi Meninggal Dunia (MD) */}
          {kondisiKorban === 'Meninggal Dunia' && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-3 mt-3">
              <div className="flex items-center gap-2 font-bold text-red-950 text-xs">
                <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                <span>Pencatatan Korban Meninggal Dunia (MD)</span>
              </div>
              <p className="text-[11px] text-red-800 leading-relaxed">
                Wajib memasukkan tanggal dan jam meninggal dunia korban sesuai informasi resmi medis. Waktu pencatatan sistem akan dicatat terpisah saat formulir disimpan.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-xl border border-red-200">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1 text-xs">
                    Tanggal Meninggal Dunia <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    value={tanggalMeninggal}
                    onChange={(e) => {
                      setTanggalMeninggal(e.target.value);
                      setValidationError('');
                    }}
                    className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:ring-red-500 focus:border-red-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Tidak boleh berada di masa depan</span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1 text-xs">
                    Jam Meninggal Dunia <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={jamMeninggal}
                    onChange={(e) => {
                      setJamMeninggal(e.target.value);
                      setValidationError('');
                    }}
                    className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:ring-red-500 focus:border-red-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Format waktu WIB</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-600">
                Dicatat oleh: <strong>{currentUser?.profile?.nama || victim?.namaPetugas || 'Petugas Jasa Raharja'}</strong>
              </div>
            </div>
          )}
        </div>

        {/* ── BAGIAN C: CHECKLIST KUNJUNGAN & HASIL KOMUNIKASI ── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#145DA0] text-xs font-bold flex items-center justify-center">
                C
              </span>
              Checklist Kunjungan &amp; Hasil Komunikasi
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Checklist wajib verifikasi petugas sesuai kolom database MySQL tabel visits.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* 3 Checklist Utama Sesuai Kolom Database visits */}
            <div className="space-y-2.5">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cekKomunikasiKeluarga}
                  onChange={(e) => setCekKomunikasiKeluarga(e.target.checked)}
                  className="mt-0.5 rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="font-bold text-slate-800 block">
                    1. Komunikasi dengan Keluarga / Pendamping Korban (cek_komunikasi_keluarga)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Petugas telah bertatap muka atau berkomunikasi dengan pihak keluarga / penjamin pasien.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cekEdukasiSantunan}
                  onChange={(e) => setCekEdukasiSantunan(e.target.checked)}
                  className="mt-0.5 rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="font-bold text-slate-800 block">
                    2. Edukasi Hak Santunan Jasa Raharja (cek_edukasi_santunan)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Menyampaikan informasi hak santunan biaya perawatan RS maksimal Rp20 Juta (atau Rp50 Juta bagi ahli waris jika MD).
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cekArahanLp}
                  onChange={(e) => setCekArahanLp(e.target.checked)}
                  className="mt-0.5 rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="font-bold text-slate-800 block">
                    3. Arahan Pengurusan Laporan Polisi / LP (cek_arahan_lp)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Mengarahkan dan membantu koordinasi penerbitan Laporan Polisi dari Unit Laka Lantas kepolisian setempat.
                  </span>
                </div>
              </label>
            </div>

            {/* Catatan Kondisi Korban (catatan_kondisi) */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Catatan Kondisi / Perkembangan Medis Pasien (catatan_kondisi) <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={perkembanganKondisi}
                onChange={(e) => setPerkembanganKondisi(e.target.value)}
                placeholder="Jelaskan kondisi klinis korban, ruangan rawat, tindakan operasi medis, atau observasi dokter..."
                className="w-full p-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:ring-1 focus:ring-[#145DA0] focus:outline-none leading-relaxed"
              />
            </div>

            {/* Keluarga yang Ditemui */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Keluarga / Kontak yang Ditemui (Opsional)
              </label>
              <input
                type="text"
                value={komunikasiKeluarga}
                onChange={(e) => setKomunikasiKeluarga(e.target.value)}
                placeholder="Contoh: Bertemu istri korban (Ibu Ratna, 0812-xxxx)"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:ring-1 focus:ring-[#145DA0] focus:outline-none"
              />
            </div>

            {/* Rencana Tindak Lanjut */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Rencana Tindak Lanjut Berikutnya
              </label>
              <input
                type="text"
                value={catatanTindakLanjut}
                onChange={(e) => setCatatanTindakLanjut(e.target.value)}
                placeholder="Contoh: Pemantauan ulang 3 hari ke depan / verifikasi berkas tagihan RS"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:ring-1 focus:ring-[#145DA0] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* ── BAGIAN D: DOKUMENTASI (KAMERA & GPS) ── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
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
                hospitalCoords={
                  victim?.hospital_lat != null && victim?.hospital_lng != null
                    ? { lat: Number(victim.hospital_lat), lng: Number(victim.hospital_lng), accuracy: Number(victim.hospital_radius || 5) }
                    : null
                }
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
                  latitude: gpsData?.latitude ?? gpsData?.lat_petugas,
                  longitude: gpsData?.longitude ?? gpsData?.lng_petugas,
                  akurasiLokasi: gpsData?.akurasiLokasi ?? gpsData?.akurasi_lokasi_meter,
                  sumberKoordinat: gpsData?.sumberKoordinat ?? gpsData?.sumber_koordinat,
                  isSimulated: gpsData?.isSimulated,
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
